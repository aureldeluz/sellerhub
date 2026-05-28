"""Internal Seller Management Platform - Main FastAPI application."""
import os
import uuid
import logging
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Annotated, Literal

import pyotp
from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Query, Header, UploadFile, File, Form, WebSocket, WebSocketDisconnect, Response, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_access_token, decode_refresh_token,
    create_reset_token, decode_reset_token,
)
from storage import init_storage, put_object, get_object, APP_NAME
from ws_manager import manager

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # startup
    try:
        init_storage()
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    admin_email = os.environ.get("ADMIN_SEED_EMAIL", "admin@sellerhub.io").lower()
    admin_pwd = os.environ.get("ADMIN_SEED_PASSWORD", "Admin@12345")
    admin_username = os.environ.get("ADMIN_SEED_USERNAME", "admin")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        uid = new_id()
        await db.users.insert_one({
            "id": uid,
            "email": admin_email,
            "username": admin_username,
            "password_hash": hash_password(admin_pwd),
            "role": "admin",
            "status": "active",
            "is_email_verified": True,
            "totp_enabled": False,
            "totp_secret": None,
            "created_at": now_iso(),
            "updated_at": now_iso(),
        })
        await db.notification_prefs.insert_one({
            "id": new_id(), "user_id": uid, "sound_enabled": True, "sound_volume": 0.7, "muted_categories": [],
        })
        logger.info(f"Seeded admin user: {admin_email}")
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.listings.create_index("seller_id")
    await db.listings.create_index("status")
    await db.orders.create_index("seller_id")
    await db.orders.create_index("status")
    await db.notifications.create_index([("recipient_id", 1), ("created_at", -1)])
    await db.seller_activity_logs.create_index([("seller_id", 1), ("created_at", -1)])
    yield
    # shutdown
    client.close()


limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="Seller Hub API", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------- MODELS ---
class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    totp_code: Optional[str] = None


class TwoFAEnableIn(BaseModel):
    password: str
    code: str


class TwoFADisableIn(BaseModel):
    password: str
    code: str


class RefreshIn(BaseModel):
    refresh_token: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=6, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    user: dict


class AvailabilityIn(BaseModel):
    status: Literal["ONLINE", "OFFLINE"]


class ListingIn(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    game_name: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=80)
    description: str = Field(min_length=1, max_length=2000)
    stock: int = Field(ge=0)
    price: float = Field(gt=0)
    status: Literal["pending", "active", "paused", "sold", "archived"] = "pending"


class ListingPatch(BaseModel):
    title: Optional[str] = None
    game_name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    stock: Optional[int] = None
    price: Optional[float] = None
    status: Optional[Literal["pending", "active", "paused", "sold", "archived"]] = None


class ImageReorderIn(BaseModel):
    image_ids: List[str]


class CheckoutIn(BaseModel):
    listing_id: str
    quantity: int = Field(default=1, ge=1)


class OrderStatusIn(BaseModel):
    status: Literal["pending", "active", "waiting_delivery", "delivered", "completed", "cancelled", "disputed"]


class CancelIn(BaseModel):
    reason: str = Field(min_length=2, max_length=500)


class DisputeIn(BaseModel):
    order_id: str
    reason: str = Field(min_length=2, max_length=1000)
    admin_notes: Optional[str] = None


class DisputePatch(BaseModel):
    admin_notes: Optional[str] = None
    resolution_status: Optional[Literal["open", "resolved_buyer", "resolved_seller", "closed"]] = None


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    message_type: Literal["text", "image"] = "text"


class WithdrawIn(BaseModel):
    amount: float = Field(ge=10)
    method: Literal["e_wallet", "bank_transfer", "solana"]
    payout_details: dict = Field(default_factory=dict)

    @field_validator("payout_details")
    @classmethod
    def _validate_payout(cls, v, info):
        method = info.data.get("method")
        if method == "e_wallet":
            if v.get("provider") not in ("dana", "gopay", "shopeepay", "ovo"):
                raise ValueError("e_wallet provider must be one of dana, gopay, shopeepay, ovo")
            if not v.get("account_number"):
                raise ValueError("account_number is required")
        elif method == "bank_transfer":
            for k in ("bank_name", "account_holder", "account_number"):
                if not v.get(k):
                    raise ValueError(f"{k} is required")
        elif method == "solana":
            if not v.get("solana_address"):
                raise ValueError("solana_address is required")
        return v


class WithdrawPatch(BaseModel):
    status: Literal["approved", "rejected"]
    admin_notes: Optional[str] = None


class FeedbackIn(BaseModel):
    rating: Literal["positive", "negative"]
    comment: str = Field(default="", max_length=500)
    customer_label: Optional[str] = Field(default=None, max_length=80)
    order_id: Optional[str] = None


class WalletAdjustIn(BaseModel):
    amount: float = Field(description="Positive credits, negative debits the seller wallet")
    note: str = Field(min_length=2, max_length=500)


class SellerNotesIn(BaseModel):
    notes: str


class NotificationPrefIn(BaseModel):
    sound_enabled: Optional[bool] = None
    sound_volume: Optional[float] = Field(default=None, ge=0, le=1)
    muted_categories: Optional[List[str]] = None


# ---------------------------------------------------------- AUTH HELPERS ---
async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(401, "Missing token")
    payload = decode_access_token(creds.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("status") == "disabled":
        raise HTTPException(403, "Account disabled")
    return user


async def get_current_user_ws(token: str) -> Optional[dict]:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload or payload.get("type") != "access":
        return None
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    return user


def require_role(role: str):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] != role:
            raise HTTPException(403, f"Requires {role} role")
        return user
    return _dep


require_admin = require_role("admin")
require_seller = require_role("seller")


# --------------------------------------------------------- DB HELPERS ---
async def get_seller_profile(user_id: str) -> dict:
    p = await db.seller_profiles.find_one({"user_id": user_id}, {"_id": 0})
    return p or {}


async def get_wallet(user_id: str) -> dict:
    w = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    if not w:
        w = {
            "id": new_id(),
            "user_id": user_id,
            "available_balance": 0.0,
            "pending_balance": 0.0,
            "created_at": now_iso(),
        }
        await db.wallets.insert_one(dict(w))
    return w


async def public_user(user: dict) -> dict:
    """Return user with profile + wallet attached, safe for API."""
    profile = await get_seller_profile(user["id"])
    wallet = await get_wallet(user["id"]) if user["role"] == "seller" else None
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"],
        "role": user["role"],
        "status": user.get("status", "active"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at"),
        "profile": {
            "profile_image": profile.get("profile_image"),
            "rating": profile.get("rating", 0.0),
            "availability_status": profile.get("availability_status", "OFFLINE"),
            "total_completed_orders": profile.get("total_completed_orders", 0),
            "admin_notes": profile.get("admin_notes") if user["role"] == "seller" else None,
        } if user["role"] == "seller" else None,
        "wallet": {
            "available_balance": wallet["available_balance"],
            "pending_balance": wallet["pending_balance"],
        } if wallet else None,
    }


async def create_notification(recipient_id: str, type_: str, title: str, message: str, related_id: Optional[str] = None):
    notif = {
        "id": new_id(),
        "recipient_id": recipient_id,
        "type": type_,
        "title": title,
        "message": message,
        "related_id": related_id,
        "is_read": False,
        "created_at": now_iso(),
    }
    await db.notifications.insert_one(dict(notif))
    notif.pop("_id", None)
    await manager.send_to_user(recipient_id, "notification", notif)
    return notif


async def log_audit(actor_id: str, action: str, target_type: str, target_id: str, metadata: dict = None):
    doc = {
        "id": new_id(),
        "actor_id": actor_id,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "metadata": metadata or {},
        "created_at": now_iso(),
    }
    await db.audit_logs.insert_one(doc)


async def log_seller_activity(seller_id: str, activity_type: str, previous_value=None, new_value=None, related_id: Optional[str] = None, metadata: dict = None):
    doc = {
        "id": new_id(),
        "seller_id": seller_id,
        "activity_type": activity_type,
        "previous_value": previous_value,
        "new_value": new_value,
        "related_id": related_id,
        "metadata": metadata or {},
        "created_at": now_iso(),
    }
    await db.seller_activity_logs.insert_one(dict(doc))
    doc.pop("_id", None)
    # Broadcast to admins
    admins = await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(100)
    for a in admins:
        await manager.send_to_user(a["id"], "seller_activity", doc)
    return doc


async def get_admin_ids() -> List[str]:
    admins = await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(100)
    return [a["id"] for a in admins]


# --------------------------------------------------------- AUTH ROUTES ---
@api.post("/auth/register", response_model=TokenOut)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterIn):
    existing = await db.users.find_one({"$or": [{"email": body.email.lower()}, {"username": body.username}]})
    if existing:
        raise HTTPException(400, "Email or username already in use")
    uid = new_id()
    user = {
        "id": uid,
        "email": body.email.lower(),
        "username": body.username,
        "password_hash": hash_password(body.password),
        "role": "seller",
        "status": "active",
        "is_email_verified": False,
        "totp_enabled": False,
        "totp_secret": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.users.insert_one(dict(user))
    await db.seller_profiles.insert_one({
        "id": new_id(),
        "user_id": uid,
        "profile_image": None,
        "rating": 5.0,
        "availability_status": "OFFLINE",
        "total_completed_orders": 0,
        "admin_notes": "",
        "created_at": now_iso(),
    })
    await get_wallet(uid)
    await db.notification_prefs.insert_one({
        "id": new_id(),
        "user_id": uid,
        "sound_enabled": True,
        "sound_volume": 0.7,
        "muted_categories": [],
    })
    access = create_access_token(uid, "seller")
    refresh = create_refresh_token(uid, "seller")
    pub = await public_user(user)
    # Notify admins
    for aid in await get_admin_ids():
        await create_notification(aid, "seller_registered", "New seller registered", f"{body.username} just signed up.", uid)
    return TokenOut(access_token=access, refresh_token=refresh, user=pub)


@api.post("/auth/login", response_model=TokenOut)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    if user.get("status") == "disabled":
        raise HTTPException(403, "Account disabled")
    if user.get("totp_enabled") and user.get("totp_secret"):
        if not body.totp_code:
            raise HTTPException(status_code=401, detail={"code": "2fa_required", "message": "Two-factor code required"})
        totp = pyotp.TOTP(user["totp_secret"])
        if not totp.verify(body.totp_code, valid_window=1):
            raise HTTPException(status_code=401, detail={"code": "2fa_invalid", "message": "Invalid two-factor code"})
    access = create_access_token(user["id"], user["role"])
    refresh = create_refresh_token(user["id"], user["role"])
    pub = await public_user(user)
    return TokenOut(access_token=access, refresh_token=refresh, user=pub)


@api.post("/auth/refresh")
async def refresh_token(body: RefreshIn):
    payload = decode_refresh_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid refresh token")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(401, "User not found")
    access = create_access_token(user["id"], user["role"])
    return {"access_token": access}


@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)):
    # Mark seller offline on explicit logout
    if user["role"] == "seller":
        prev = (await get_seller_profile(user["id"])).get("availability_status", "OFFLINE")
        if prev != "OFFLINE":
            await db.seller_profiles.update_one({"user_id": user["id"]}, {"$set": {"availability_status": "OFFLINE"}})
            await log_seller_activity(user["id"], "STATUS_OFFLINE", prev, "OFFLINE", metadata={"reason": "logout"})
    return {"ok": True}


@api.post("/auth/forgot-password")
@limiter.limit("3/minute")
async def forgot_password(request: Request, body: ForgotIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user:
        # silent ok
        return {"ok": True, "message": "If account exists, reset token issued."}
    token = create_reset_token(user["id"])
    # MVP: return token in response
    return {"ok": True, "reset_token": token, "message": "Use this token at /auth/reset-password (MVP placeholder)."}


@api.post("/auth/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetIn):
    payload = decode_reset_token(body.token)
    if not payload:
        raise HTTPException(400, "Invalid or expired token")
    await db.users.update_one(
        {"id": payload["sub"]},
        {"$set": {"password_hash": hash_password(body.new_password), "updated_at": now_iso()}},
    )
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    pub = await public_user(user)
    pub["totp_enabled"] = bool(user.get("totp_enabled"))
    return pub


# ------------------------------------------------------ 2FA ROUTES (TOTP) ---
@api.post("/auth/2fa/setup")
async def twofa_setup(user: dict = Depends(get_current_user)):
    """Generate a fresh TOTP secret (not yet enabled). Returns secret + otpauth URI."""
    secret = pyotp.random_base32()
    # Store as pending - overwrites until enabled
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"totp_pending_secret": secret, "updated_at": now_iso()}},
    )
    uri = pyotp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name="SellerHub")
    return {"secret": secret, "otpauth_uri": uri}


@api.post("/auth/2fa/enable")
async def twofa_enable(body: TwoFAEnableIn, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(body.password, full["password_hash"]):
        raise HTTPException(401, "Invalid password")
    secret = full.get("totp_pending_secret")
    if not secret:
        raise HTTPException(400, "No pending TOTP setup. Call /auth/2fa/setup first.")
    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(400, "Invalid TOTP code")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"totp_enabled": True, "totp_secret": secret, "updated_at": now_iso()}, "$unset": {"totp_pending_secret": ""}},
    )
    await log_audit(user["id"], "2fa_enable", "user", user["id"], {})
    return {"ok": True, "totp_enabled": True}


@api.post("/auth/2fa/disable")
async def twofa_disable(body: TwoFADisableIn, user: dict = Depends(get_current_user)):
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(body.password, full["password_hash"]):
        raise HTTPException(401, "Invalid password")
    if not full.get("totp_enabled"):
        return {"ok": True, "totp_enabled": False}
    if not pyotp.TOTP(full["totp_secret"]).verify(body.code, valid_window=1):
        raise HTTPException(400, "Invalid TOTP code")
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"totp_enabled": False, "totp_secret": None, "updated_at": now_iso()}},
    )
    await log_audit(user["id"], "2fa_disable", "user", user["id"], {})
    return {"ok": True, "totp_enabled": False}


# -------------------------------------------------------- SELLER ROUTES ---
@api.patch("/seller/availability")
async def set_availability(body: AvailabilityIn, user: dict = Depends(require_seller)):
    profile = await get_seller_profile(user["id"])
    prev = profile.get("availability_status", "OFFLINE")
    new = body.status
    await db.seller_profiles.update_one(
        {"user_id": user["id"]},
        {"$set": {"availability_status": new, "updated_at": now_iso()}},
    )
    if prev != new:
        await log_seller_activity(user["id"], f"STATUS_{new}", prev, new)
        # Notify admins
        for aid in await get_admin_ids():
            await manager.send_to_user(aid, "seller_status_change", {
                "seller_id": user["id"],
                "username": user["username"],
                "previous": prev,
                "new": new,
                "at": now_iso(),
            })
            await create_notification(aid, "seller_status_changed", f"Seller {user['username']} is now {new}", f"Availability changed from {prev} to {new}.", user["id"])
    return {"availability_status": new}


@api.get("/seller/activity-logs")
async def seller_own_logs(limit: int = 100, user: dict = Depends(require_seller)):
    logs = await db.seller_activity_logs.find({"seller_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return logs


# ------------------------------------------------------- LISTING ROUTES ---
async def listing_with_images(listing: dict) -> dict:
    imgs = await db.listing_images.find({"listing_id": listing["id"], "is_deleted": {"$ne": True}}, {"_id": 0}).sort("image_order", 1).to_list(10)
    listing["images"] = imgs
    seller = await db.users.find_one({"id": listing["seller_id"]}, {"_id": 0, "password_hash": 0})
    if seller:
        sp = await get_seller_profile(seller["id"])
        listing["seller"] = {
            "id": seller["id"],
            "username": seller["username"],
            "availability_status": sp.get("availability_status", "OFFLINE"),
            "rating": sp.get("rating", 0.0),
        }
    return listing


SELLER_ALLOWED_STATUSES = {"active", "paused"}


@api.post("/listings")
async def create_listing(body: ListingIn, user: dict = Depends(require_seller)):
    chosen_status = body.status if body.status in SELLER_ALLOWED_STATUSES else "active"
    listing = {
        "id": new_id(),
        "seller_id": user["id"],
        "title": body.title,
        "game_name": body.game_name,
        "category": body.category,
        "description": body.description,
        "stock": body.stock,
        "price": body.price,
        "status": chosen_status,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.listings.insert_one(dict(listing))
    await log_seller_activity(user["id"], "LISTING_CREATED", None, listing["title"], listing["id"], {
        "title": listing["title"], "price": listing["price"], "game_name": listing["game_name"],
    })
    for aid in await get_admin_ids():
        await create_notification(aid, "listing_created", "New listing submitted", f"{user['username']} created '{listing['title']}'", listing["id"])
    return await listing_with_images(listing)


@api.get("/listings")
async def list_listings(
    response: Response,
    user: dict = Depends(get_current_user),
    status_: Optional[str] = Query(None, alias="status"),
    seller_id: Optional[str] = None,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    filt: dict = {}
    if user["role"] == "seller":
        filt["seller_id"] = user["id"]
    elif seller_id:
        filt["seller_id"] = seller_id
    if status_:
        filt["status"] = status_
    if q:
        filt["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"game_name": {"$regex": q, "$options": "i"}},
            {"category": {"$regex": q, "$options": "i"}},
        ]
    total = await db.listings.count_documents(filt)
    cursor = db.listings.find(filt, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    rows = await cursor.to_list(limit)
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return [await listing_with_images(l) for l in rows]


@api.get("/listings/{listing_id}")
async def get_listing(listing_id: str, user: dict = Depends(get_current_user)):
    l = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    if not l:
        raise HTTPException(404, "Not found")
    if user["role"] == "seller" and l["seller_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    return await listing_with_images(l)


@api.patch("/listings/{listing_id}")
async def update_listing(listing_id: str, body: ListingPatch, user: dict = Depends(get_current_user)):
    l = await db.listings.find_one({"id": listing_id})
    if not l:
        raise HTTPException(404, "Not found")
    if user["role"] == "seller" and l["seller_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    updates = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if not updates:
        return await listing_with_images(l)
    if user["role"] == "seller" and "status" in updates and updates["status"] not in SELLER_ALLOWED_STATUSES:
        raise HTTPException(400, f"Sellers can only set status to {sorted(SELLER_ALLOWED_STATUSES)}")
    updates["updated_at"] = now_iso()
    await db.listings.update_one({"id": listing_id}, {"$set": updates})

    # Granular seller activity logs for relevant changes
    if user["role"] == "seller":
        if "price" in updates and updates["price"] != l.get("price"):
            await log_seller_activity(user["id"], "LISTING_PRICE_CHANGED", l.get("price"), updates["price"], listing_id, {"title": l.get("title")})
        if "title" in updates and updates["title"] != l.get("title"):
            await log_seller_activity(user["id"], "LISTING_TITLE_CHANGED", l.get("title"), updates["title"], listing_id)
        other = {k: v for k, v in updates.items() if k not in {"price", "title", "updated_at"}}
        if other:
            await log_seller_activity(user["id"], "LISTING_UPDATED", None, None, listing_id, other)

    for aid in await get_admin_ids():
        await create_notification(aid, "listing_updated", "Listing updated", f"{user['username']} updated '{l.get('title')}'", listing_id)

    new_doc = await db.listings.find_one({"id": listing_id}, {"_id": 0})
    return await listing_with_images(new_doc)


@api.delete("/listings/{listing_id}")
async def delete_listing(listing_id: str, user: dict = Depends(get_current_user)):
    l = await db.listings.find_one({"id": listing_id})
    if not l:
        raise HTTPException(404, "Not found")
    if user["role"] == "seller" and l["seller_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    # Admin can permanently delete an already-archived listing.
    if user["role"] == "admin" and l.get("status") == "archived":
        await db.listings.delete_one({"id": listing_id})
        await db.listing_images.update_many({"listing_id": listing_id}, {"$set": {"is_deleted": True}})
        await log_audit(user["id"], "listing_hard_deleted", "listing", listing_id, {"title": l.get("title")})
        return {"ok": True, "hard_deleted": True}
    # Otherwise soft-archive to preserve order references
    await db.listings.update_one({"id": listing_id}, {"$set": {"status": "archived", "updated_at": now_iso()}})
    if user["role"] == "seller":
        await log_seller_activity(user["id"], "LISTING_DELETED", l.get("title"), None, listing_id, {"title": l.get("title"), "price": l.get("price")})
    return {"ok": True}


@api.post("/listings/{listing_id}/pause")
async def pause_listing(listing_id: str, user: dict = Depends(get_current_user)):
    l = await db.listings.find_one({"id": listing_id})
    if not l:
        raise HTTPException(404, "Not found")
    if user["role"] == "seller" and l["seller_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    await db.listings.update_one({"id": listing_id}, {"$set": {"status": "paused", "updated_at": now_iso()}})
    return {"ok": True}


@api.post("/listings/{listing_id}/images")
async def upload_image(listing_id: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    l = await db.listings.find_one({"id": listing_id})
    if not l:
        raise HTTPException(404, "Listing not found")
    if user["role"] == "seller" and l["seller_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")

    existing_count = await db.listing_images.count_documents({"listing_id": listing_id, "is_deleted": {"$ne": True}})
    if existing_count >= 3:
        raise HTTPException(400, "Maximum 3 images per listing")

    allowed = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, "Invalid format. JPG, PNG, WEBP only.")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10MB)")

    ext = (file.filename or "img.jpg").rsplit(".", 1)[-1].lower()
    if ext == "jpeg":
        ext = "jpg"
    path = f"{APP_NAME}/listings/{user['id']}/{new_id()}.{ext}"
    result = put_object(path, data, file.content_type)

    img = {
        "id": new_id(),
        "listing_id": listing_id,
        "storage_path": result["path"],
        "content_type": file.content_type,
        "size": result.get("size", len(data)),
        "image_order": existing_count,
        "is_deleted": False,
        "created_at": now_iso(),
    }
    await db.listing_images.insert_one(dict(img))
    if user["role"] == "seller":
        await log_seller_activity(user["id"], "LISTING_PHOTO_CHANGED", None, img["id"], listing_id, {"title": l.get("title"), "action": "added"})
    img.pop("_id", None)
    return img


@api.delete("/listings/{listing_id}/images/{image_id}")
async def delete_image(listing_id: str, image_id: str, user: dict = Depends(get_current_user)):
    l = await db.listings.find_one({"id": listing_id})
    if not l:
        raise HTTPException(404, "Listing not found")
    if user["role"] == "seller" and l["seller_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    await db.listing_images.update_one({"id": image_id, "listing_id": listing_id}, {"$set": {"is_deleted": True}})
    if user["role"] == "seller":
        await log_seller_activity(user["id"], "LISTING_PHOTO_CHANGED", image_id, None, listing_id, {"title": l.get("title"), "action": "removed"})
    return {"ok": True}


@api.patch("/listings/{listing_id}/images/reorder")
async def reorder_images(listing_id: str, body: ImageReorderIn, user: dict = Depends(get_current_user)):
    l = await db.listings.find_one({"id": listing_id})
    if not l:
        raise HTTPException(404, "Listing not found")
    if user["role"] == "seller" and l["seller_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    for idx, img_id in enumerate(body.image_ids):
        await db.listing_images.update_one({"id": img_id, "listing_id": listing_id}, {"$set": {"image_order": idx}})
    return {"ok": True}


# ----------------------------------------------------- FILE SERVING ---
@api.get("/files/{path:path}")
async def serve_file(path: str, auth: Optional[str] = Query(None), authorization: Optional[str] = Header(None)):
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    elif auth:
        token = auth
    if not token or not decode_access_token(token):
        raise HTTPException(401, "Unauthorized")
    try:
        data, ctype = get_object(path)
    except Exception:
        raise HTTPException(404, "Not found")
    return Response(content=data, media_type=ctype)


# -------------------------------------------------------- ORDER ROUTES ---
async def order_with_details(o: dict) -> dict:
    listing = await db.listings.find_one({"id": o["listing_id"]}, {"_id": 0})
    if listing:
        o["listing"] = await listing_with_images(listing)
    seller = await db.users.find_one({"id": o["seller_id"]}, {"_id": 0, "password_hash": 0})
    if seller:
        sp = await get_seller_profile(seller["id"])
        o["seller"] = {"id": seller["id"], "username": seller["username"], "availability_status": sp.get("availability_status", "OFFLINE")}
    return o


@api.post("/orders/checkout")
async def checkout(body: CheckoutIn, user: dict = Depends(require_admin)):
    listing = await db.listings.find_one({"id": body.listing_id})
    if not listing:
        raise HTTPException(404, "Listing not found")
    if listing["status"] not in ("active", "pending"):
        raise HTTPException(400, f"Cannot checkout listing with status {listing['status']}")
    current_stock = int(listing.get("stock", 0))
    if current_stock < body.quantity:
        raise HTTPException(400, "Insufficient stock")

    order = {
        "id": new_id(),
        "listing_id": listing["id"],
        "seller_id": listing["seller_id"],
        "admin_id": user["id"],
        "quantity": body.quantity,
        "unit_price": listing["price"],
        "amount": listing["price"] * body.quantity,
        "status": "active",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.orders.insert_one(dict(order))
    # Decrement stock by quantity; mark "sold" only when depleted
    new_stock = current_stock - body.quantity
    upd = {"stock": new_stock, "updated_at": now_iso()}
    if new_stock <= 0:
        upd["status"] = "sold"
    await db.listings.update_one({"id": listing["id"]}, {"$set": upd})

    # Create chat room
    room = {
        "id": new_id(),
        "order_id": order["id"],
        "participants": [order["seller_id"], user["id"]],
        "created_at": now_iso(),
    }
    await db.chat_rooms.insert_one(dict(room))

    # Move amount to pending balance for seller
    await db.wallets.update_one({"user_id": order["seller_id"]}, {"$inc": {"pending_balance": order["amount"]}})
    await db.wallet_transactions.insert_one({
        "id": new_id(),
        "wallet_user_id": order["seller_id"],
        "amount": order["amount"],
        "type": "pending_credit",
        "related_order_id": order["id"],
        "description": f"Pending: order #{order['id'][:8]}",
        "created_at": now_iso(),
    })

    await log_audit(user["id"], "order_checkout", "order", order["id"], {"listing_id": listing["id"]})
    await create_notification(order["seller_id"], "new_order", "New order received", f"Order for '{listing['title']}' has been placed.", order["id"])
    await manager.send_to_user(order["seller_id"], "new_order", await order_with_details(dict(order)))
    return await order_with_details(dict(order))


@api.get("/orders")
async def list_orders(
    response: Response,
    user: dict = Depends(get_current_user),
    status_: Optional[str] = Query(None, alias="status"),
    seller_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    filt: dict = {}
    if user["role"] == "seller":
        filt["seller_id"] = user["id"]
    elif seller_id:
        filt["seller_id"] = seller_id
    if status_:
        filt["status"] = status_
    total = await db.orders.count_documents(filt)
    cursor = db.orders.find(filt, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    rows = await cursor.to_list(limit)
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return [await order_with_details(o) for o in rows]


@api.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Order not found")
    if user["role"] == "seller" and o["seller_id"] != user["id"]:
        raise HTTPException(403, "Forbidden")
    return await order_with_details(o)


@api.patch("/orders/{order_id}/status")
async def update_order_status(order_id: str, body: OrderStatusIn, user: dict = Depends(require_admin)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Order not found")
    await db.orders.update_one({"id": order_id}, {"$set": {"status": body.status, "updated_at": now_iso()}})
    await log_audit(user["id"], "order_status_change", "order", order_id, {"from": o["status"], "to": body.status})
    await create_notification(o["seller_id"], "order_status", f"Order status: {body.status}", f"Order #{order_id[:8]} is now {body.status}.", order_id)
    return {"ok": True}


@api.post("/orders/{order_id}/complete")
async def complete_order(order_id: str, user: dict = Depends(require_admin)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] == "completed":
        return {"ok": True}
    if o["status"] in ("cancelled", "disputed"):
        raise HTTPException(400, f"Cannot complete order with status {o['status']}")
    now = now_iso()
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed", "updated_at": now, "completed_at": now}})
    # Move pending -> available
    await db.wallets.update_one({"user_id": o["seller_id"]}, {"$inc": {"pending_balance": -o["amount"], "available_balance": o["amount"]}})
    await db.wallet_transactions.insert_one({
        "id": new_id(),
        "wallet_user_id": o["seller_id"],
        "amount": o["amount"],
        "type": "sale_credit",
        "related_order_id": order_id,
        "description": f"Sale completed: order #{order_id[:8]}",
        "created_at": now,
    })
    # bump completed counter
    await db.seller_profiles.update_one({"user_id": o["seller_id"]}, {"$inc": {"total_completed_orders": 1}})
    await log_audit(user["id"], "order_completed", "order", order_id, {})
    await create_notification(o["seller_id"], "order_completed", "Order completed", f"Order #{order_id[:8]} completed. Funds added to your wallet.", order_id)
    return {"ok": True}


@api.post("/orders/{order_id}/cancel")
async def cancel_order(order_id: str, body: CancelIn, user: dict = Depends(require_admin)):
    o = await db.orders.find_one({"id": order_id})
    if not o:
        raise HTTPException(404, "Order not found")
    if o["status"] in ("completed", "cancelled"):
        raise HTTPException(400, f"Already {o['status']}")
    now = now_iso()
    await db.orders.update_one({"id": order_id}, {"$set": {"status": "cancelled", "updated_at": now, "cancel_reason": body.reason}})
    # Reverse pending balance
    await db.wallets.update_one({"user_id": o["seller_id"]}, {"$inc": {"pending_balance": -o["amount"]}})
    await db.wallet_transactions.insert_one({
        "id": new_id(),
        "wallet_user_id": o["seller_id"],
        "amount": -o["amount"],
        "type": "pending_reverse",
        "related_order_id": order_id,
        "description": f"Order #{order_id[:8]} cancelled",
        "created_at": now,
    })
    # Restore stock by the order quantity and reactivate listing
    qty = int(o.get("quantity", 1))
    listing = await db.listings.find_one({"id": o["listing_id"]}, {"_id": 0})
    if listing:
        new_stock = int(listing.get("stock", 0)) + qty
        new_status = listing.get("status", "active")
        if new_status == "sold" and new_stock > 0:
            new_status = "active"
        await db.listings.update_one({"id": o["listing_id"]}, {"$set": {"stock": new_stock, "status": new_status, "updated_at": now}})
    await log_audit(user["id"], "order_cancelled", "order", order_id, {"reason": body.reason})
    await create_notification(o["seller_id"], "order_cancelled", "Order cancelled", f"Order #{order_id[:8]} was cancelled. Reason: {body.reason}", order_id)
    return {"ok": True}


# --------------------------------------------------------- CHAT ROUTES ---
@api.get("/chat/rooms")
async def list_rooms(user: dict = Depends(get_current_user)):
    rooms = await db.chat_rooms.find({"participants": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    out = []
    for r in rooms:
        order = await db.orders.find_one({"id": r["order_id"]}, {"_id": 0})
        last = await db.messages.find({"room_id": r["id"]}, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)
        unread = await db.messages.count_documents({"room_id": r["id"], "sender_id": {"$ne": user["id"]}, "is_read": False})
        r["order"] = await order_with_details(order) if order else None
        r["last_message"] = last[0] if last else None
        r["unread"] = unread
        out.append(r)
    return out


@api.get("/chat/rooms/{order_id}/messages")
async def get_messages(order_id: str, limit: int = 200, user: dict = Depends(get_current_user)):
    room = await db.chat_rooms.find_one({"order_id": order_id})
    if not room:
        raise HTTPException(404, "Chat room not found")
    if user["id"] not in room["participants"]:
        raise HTTPException(403, "Forbidden")
    msgs = await db.messages.find({"room_id": room["id"]}, {"_id": 0}).sort("created_at", 1).limit(limit).to_list(limit)
    # mark all incoming as read
    await db.messages.update_many({"room_id": room["id"], "sender_id": {"$ne": user["id"]}, "is_read": False}, {"$set": {"is_read": True}})
    return {"room_id": room["id"], "order_id": order_id, "messages": msgs}


@api.post("/chat/rooms/{order_id}/messages")
async def send_message(order_id: str, body: MessageIn, user: dict = Depends(get_current_user)):
    room = await db.chat_rooms.find_one({"order_id": order_id})
    if not room:
        raise HTTPException(404, "Chat room not found")
    if user["id"] not in room["participants"]:
        raise HTTPException(403, "Forbidden")
    msg = {
        "id": new_id(),
        "room_id": room["id"],
        "order_id": order_id,
        "sender_id": user["id"],
        "sender_username": user["username"],
        "content": body.content,
        "message_type": body.message_type,
        "is_read": False,
        "created_at": now_iso(),
    }
    await db.messages.insert_one(dict(msg))
    msg.pop("_id", None)
    # Broadcast
    for pid in room["participants"]:
        await manager.send_to_user(pid, "chat_message", msg)
        if pid != user["id"]:
            await create_notification(pid, "new_message", f"New message from {user['username']}", body.content[:80], order_id)
    return msg


# ------------------------------------------------------- WALLET ROUTES ---
@api.get("/wallet")
async def wallet_info(user: dict = Depends(require_seller)):
    return await get_wallet(user["id"])


@api.get("/wallet/transactions")
async def wallet_txns(user: dict = Depends(require_seller), limit: int = 100):
    # History only records: completed orders, withdrawal approvals, and admin interventions
    visible_types = ["sale_credit", "withdrawal_approved", "admin_intervention"]
    rows = await db.wallet_transactions.find(
        {"wallet_user_id": user["id"], "type": {"$in": visible_types}},
        {"_id": 0},
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return rows


@api.post("/wallet/withdraw")
async def withdraw(body: WithdrawIn, user: dict = Depends(require_seller)):
    w = await get_wallet(user["id"])
    if body.amount > w["available_balance"]:
        raise HTTPException(400, "Insufficient balance")
    wid = new_id()
    ref_no = f"WD-{wid.replace('-', '')[:8].upper()}"
    req = {
        "id": wid,
        "ref_no": ref_no,
        "seller_id": user["id"],
        "seller_username": user["username"],
        "amount": body.amount,
        "method": body.method,
        "payout_details": body.payout_details,
        "status": "pending",
        "admin_notes": "",
        "created_at": now_iso(),
        "processed_at": None,
    }
    await db.withdrawals.insert_one(dict(req))
    # Hold funds
    await db.wallets.update_one({"user_id": user["id"]}, {"$inc": {"available_balance": -body.amount}})
    await db.wallet_transactions.insert_one({
        "id": new_id(),
        "wallet_user_id": user["id"],
        "amount": -body.amount,
        "type": "withdrawal_hold",
        "related_order_id": None,
        "description": f"Withdrawal request {ref_no}",
        "created_at": now_iso(),
    })
    for aid in await get_admin_ids():
        await create_notification(aid, "withdrawal_requested", "Withdrawal request", f"{user['username']} requested ${body.amount:.2f} via {body.method} ({ref_no})", req["id"])
    req.pop("_id", None)
    return req


@api.get("/wallet/withdrawals")
async def list_withdrawals(
    response: Response,
    user: dict = Depends(get_current_user),
    status_: Optional[str] = Query(None, alias="status"),
    skip: int = 0,
    limit: int = 50,
):
    filt: dict = {}
    if user["role"] == "seller":
        filt["seller_id"] = user["id"]
    if status_:
        filt["status"] = status_
    total = await db.withdrawals.count_documents(filt)
    rows = await db.withdrawals.find(filt, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return rows


@api.patch("/wallet/withdrawals/{wid}")
async def process_withdrawal(wid: str, body: WithdrawPatch, user: dict = Depends(require_admin)):
    w = await db.withdrawals.find_one({"id": wid})
    if not w:
        raise HTTPException(404, "Not found")
    if w["status"] != "pending":
        raise HTTPException(400, "Already processed")
    now = now_iso()
    ref_no = w.get("ref_no") or f"WD-{wid.replace('-', '')[:8].upper()}"
    await db.withdrawals.update_one({"id": wid}, {"$set": {"status": body.status, "admin_notes": body.admin_notes or "", "processed_at": now}})
    if body.status == "approved":
        await db.wallet_transactions.insert_one({
            "id": new_id(),
            "wallet_user_id": w["seller_id"],
            "amount": -w["amount"],
            "type": "withdrawal_approved",
            "related_order_id": None,
            "description": f"Withdrawal {ref_no} approved",
            "created_at": now,
        })
        await create_notification(w["seller_id"], "withdrawal_approved", "Withdrawal approved", f"Your withdrawal {ref_no} of ${w['amount']:.2f} has been approved.", wid)
    else:  # rejected
        # Return funds
        await db.wallets.update_one({"user_id": w["seller_id"]}, {"$inc": {"available_balance": w["amount"]}})
        await db.wallet_transactions.insert_one({
            "id": new_id(),
            "wallet_user_id": w["seller_id"],
            "amount": w["amount"],
            "type": "withdrawal_refund",
            "related_order_id": None,
            "description": f"Withdrawal {ref_no} rejected. Funds returned.",
            "created_at": now,
        })
        await create_notification(w["seller_id"], "withdrawal_rejected", "Withdrawal rejected", f"{ref_no} - Reason: {body.admin_notes or 'No reason provided'}", wid)
    return {"ok": True}


@api.get("/wallet/withdrawals/{wid}")
async def get_withdrawal(wid: str, user: dict = Depends(require_admin)):
    w = await db.withdrawals.find_one({"id": wid}, {"_id": 0})
    if not w:
        raise HTTPException(404, "Not found")
    return w


# ------------------------------------------------------ DISPUTE ROUTES ---
@api.post("/disputes")
async def open_dispute(body: DisputeIn, user: dict = Depends(require_admin)):
    o = await db.orders.find_one({"id": body.order_id})
    if not o:
        raise HTTPException(404, "Order not found")
    # Prevent duplicate open disputes for same order
    existing_open = await db.disputes.find_one({"order_id": body.order_id, "resolution_status": "open"})
    if existing_open:
        raise HTTPException(400, "An open dispute already exists for this order")
    if o["status"] in ("cancelled",):
        raise HTTPException(400, f"Cannot open dispute on a {o['status']} order")
    d = {
        "id": new_id(),
        "order_id": body.order_id,
        "reason": body.reason,
        "admin_notes": body.admin_notes or "",
        "resolution_status": "open",
        "opened_by": user["id"],
        "created_at": now_iso(),
        "resolved_at": None,
    }
    await db.disputes.insert_one(dict(d))
    await db.orders.update_one({"id": body.order_id}, {"$set": {"status": "disputed", "updated_at": now_iso()}})
    await log_audit(user["id"], "dispute_open", "dispute", d["id"], {"order_id": body.order_id})
    await create_notification(o["seller_id"], "dispute_opened", "Dispute opened", body.reason[:120], d["id"])
    return d


@api.get("/disputes")
async def list_disputes(user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        rows = await db.disputes.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    else:
        # Seller sees only their own
        orders = await db.orders.find({"seller_id": user["id"]}, {"id": 1, "_id": 0}).to_list(1000)
        ids = [o["id"] for o in orders]
        rows = await db.disputes.find({"order_id": {"$in": ids}}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for r in rows:
        o = await db.orders.find_one({"id": r["order_id"]}, {"_id": 0})
        r["order"] = await order_with_details(o) if o else None
    return rows


@api.patch("/disputes/{did}")
async def update_dispute(did: str, body: DisputePatch, user: dict = Depends(require_admin)):
    d = await db.disputes.find_one({"id": did})
    if not d:
        raise HTTPException(404, "Not found")
    upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if body.resolution_status and body.resolution_status != "open":
        upd["resolved_at"] = now_iso()
    await db.disputes.update_one({"id": did}, {"$set": upd})
    o = await db.orders.find_one({"id": d["order_id"]})
    if o:
        await create_notification(o["seller_id"], "dispute_resolved", "Dispute updated", f"Status: {body.resolution_status or 'updated'}", did)
    return {"ok": True}


# --------------------------------------------------- NOTIFICATION ROUTES ---
@api.get("/notifications")
async def list_notifications(
    response: Response,
    user: dict = Depends(get_current_user),
    unread_only: bool = False,
    skip: int = 0,
    limit: int = 50,
):
    filt = {"recipient_id": user["id"]}
    if unread_only:
        filt["is_read"] = False
    total = await db.notifications.count_documents(filt)
    rows = await db.notifications.find(filt, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return rows


@api.get("/notifications/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    c = await db.notifications.count_documents({"recipient_id": user["id"], "is_read": False})
    return {"count": c}


@api.patch("/notifications/{nid}/read")
async def mark_read(nid: str, user: dict = Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "recipient_id": user["id"]}, {"$set": {"is_read": True}})
    return {"ok": True}


@api.post("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    await db.notifications.update_many({"recipient_id": user["id"], "is_read": False}, {"$set": {"is_read": True}})
    return {"ok": True}


@api.get("/notifications/preferences")
async def get_prefs(user: dict = Depends(get_current_user)):
    p = await db.notification_prefs.find_one({"user_id": user["id"]}, {"_id": 0})
    if not p:
        p = {
            "id": new_id(),
            "user_id": user["id"],
            "sound_enabled": True,
            "sound_volume": 0.7,
            "muted_categories": [],
        }
        await db.notification_prefs.insert_one(dict(p))
        p.pop("_id", None)
    return p


@api.patch("/notifications/preferences")
async def set_prefs(body: NotificationPrefIn, user: dict = Depends(get_current_user)):
    upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    await db.notification_prefs.update_one({"user_id": user["id"]}, {"$set": upd}, upsert=True)
    return await get_prefs(user)


# -------------------------------------------------------- ADMIN ROUTES ---
@api.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_admin)):
    active = await db.orders.count_documents({"status": "active"})
    pending = await db.orders.count_documents({"status": "pending"})
    completed = await db.orders.count_documents({"status": "completed"})
    cancelled = await db.orders.count_documents({"status": "cancelled"})
    disputes = await db.disputes.count_documents({"resolution_status": "open"})
    sellers_total = await db.users.count_documents({"role": "seller"})
    sellers_online = await db.seller_profiles.count_documents({"availability_status": "ONLINE"})
    listings_active = await db.listings.count_documents({"status": "active"})
    listings_pending = await db.listings.count_documents({"status": "pending"})
    withdraw_pending = await db.withdrawals.count_documents({"status": "pending"})
    # revenue from completed orders
    cur = db.orders.find({"status": "completed"}, {"amount": 1, "_id": 0})
    total_rev = 0.0
    async for o in cur:
        total_rev += float(o.get("amount", 0))
    return {
        "orders": {"active": active, "pending": pending, "completed": completed, "cancelled": cancelled},
        "disputes_open": disputes,
        "sellers": {"total": sellers_total, "online": sellers_online},
        "listings": {"active": listings_active, "pending": listings_pending},
        "withdrawals_pending": withdraw_pending,
        "revenue": round(total_rev, 2),
    }


@api.get("/admin/analytics")
async def admin_analytics(user: dict = Depends(require_admin), days: int = 14):
    """Time-series data for dashboard charts."""
    from datetime import timedelta
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    start_iso = start.isoformat()

    # Daily revenue from completed orders
    revenue_by_day: dict = {}
    orders_by_day: dict = {}
    async for o in db.orders.find({"created_at": {"$gte": start_iso}}, {"_id": 0, "created_at": 1, "amount": 1, "status": 1}):
        day = o["created_at"][:10]
        orders_by_day[day] = orders_by_day.get(day, 0) + 1
        if o.get("status") == "completed":
            revenue_by_day[day] = revenue_by_day.get(day, 0.0) + float(o.get("amount", 0))

    # Order status breakdown
    status_breakdown = []
    for s in ["active", "pending", "waiting_delivery", "delivered", "completed", "cancelled", "disputed"]:
        c = await db.orders.count_documents({"status": s})
        if c > 0:
            status_breakdown.append({"status": s, "count": c})

    # Top categories by completed order count
    top_cats: dict = {}
    async for o in db.orders.find({"status": "completed"}, {"_id": 0, "listing_id": 1}):
        l = await db.listings.find_one({"id": o["listing_id"]}, {"category": 1, "_id": 0})
        if l:
            top_cats[l["category"]] = top_cats.get(l["category"], 0) + 1
    top_categories = sorted([{"category": k, "count": v} for k, v in top_cats.items()], key=lambda x: -x["count"])[:6]

    # Series with all days filled (zero where missing)
    series = []
    cur = start
    for _ in range(days + 1):
        day = cur.isoformat()[:10]
        series.append({
            "date": day,
            "revenue": round(revenue_by_day.get(day, 0.0), 2),
            "orders": orders_by_day.get(day, 0),
        })
        cur = cur + timedelta(days=1)

    # Active sellers count (last 14d activity)
    recent_active_sellers = await db.seller_activity_logs.distinct("seller_id", {"created_at": {"$gte": start_iso}})

    return {
        "series": series,
        "status_breakdown": status_breakdown,
        "top_categories": top_categories,
        "active_sellers_count": len(recent_active_sellers),
        "days": days,
    }


@api.get("/admin/sellers")
async def list_sellers(
    response: Response,
    user: dict = Depends(require_admin),
    q: Optional[str] = None,
    availability: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    user_filt: dict = {"role": "seller"}
    if q:
        user_filt["$or"] = [
            {"username": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
        ]
    if availability:
        sids = await db.seller_profiles.distinct("user_id", {"availability_status": availability})
        user_filt["id"] = {"$in": sids}
    total = await db.users.count_documents(user_filt)
    users = await db.users.find(user_filt, {"_id": 0, "password_hash": 0, "totp_secret": 0, "totp_pending_secret": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    out = []
    for u in users:
        sp = await get_seller_profile(u["id"])
        w = await get_wallet(u["id"])
        out.append({**u, "profile": sp, "wallet": {"available_balance": w["available_balance"], "pending_balance": w["pending_balance"]}})
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return out


@api.post("/admin/sellers/{sid}/feedback")
async def add_feedback(sid: str, body: FeedbackIn, user: dict = Depends(require_admin)):
    sp = await db.seller_profiles.find_one({"user_id": sid})
    if not sp:
        raise HTTPException(404, "Seller not found")
    fb = {
        "id": new_id(),
        "seller_id": sid,
        "order_id": body.order_id,
        "rating": body.rating,
        "comment": body.comment,
        "customer_label": body.customer_label,
        "created_by": user["id"],
        "created_at": now_iso(),
    }
    await db.feedback.insert_one(dict(fb))
    fb.pop("_id", None)
    await log_audit(user["id"], "feedback_added", "seller", sid, {"feedback_id": fb["id"], "rating": body.rating})
    await create_notification(sid, "feedback_received", "New feedback received", f"You received {body.rating} feedback from admin.", fb["id"])
    return fb


@api.delete("/admin/feedback/{fid}")
async def delete_feedback(fid: str, user: dict = Depends(require_admin)):
    fb = await db.feedback.find_one({"id": fid})
    if not fb:
        raise HTTPException(404, "Not found")
    await db.feedback.delete_one({"id": fid})
    await log_audit(user["id"], "feedback_deleted", "seller", fb["seller_id"], {"feedback_id": fid})
    return {"ok": True}


async def _build_feedback_stats(seller_id: str) -> dict:
    completed = await db.orders.count_documents({"seller_id": seller_id, "status": "completed"})
    positive = await db.feedback.count_documents({"seller_id": seller_id, "rating": "positive"})
    negative = await db.feedback.count_documents({"seller_id": seller_id, "rating": "negative"})
    total = positive + negative
    score = round((positive / total) * 100, 1) if total > 0 else 0.0
    return {
        "completed_orders": completed,
        "positive": positive,
        "negative": negative,
        "score": score,
    }


@api.get("/feedback/stats")
async def my_feedback_stats(user: dict = Depends(require_seller)):
    return await _build_feedback_stats(user["id"])


@api.get("/feedback")
async def list_my_feedback(
    response: Response,
    user: dict = Depends(require_seller),
    rating: Optional[Literal["positive", "negative"]] = None,
    skip: int = 0,
    limit: int = 50,
):
    filt: dict = {"seller_id": user["id"]}
    if rating:
        filt["rating"] = rating
    total = await db.feedback.count_documents(filt)
    rows = await db.feedback.find(filt, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return rows


@api.get("/admin/sellers/{sid}/feedback")
async def list_seller_feedback(
    sid: str,
    response: Response,
    user: dict = Depends(require_admin),
    rating: Optional[Literal["positive", "negative"]] = None,
    skip: int = 0,
    limit: int = 50,
):
    filt: dict = {"seller_id": sid}
    if rating:
        filt["rating"] = rating
    total = await db.feedback.count_documents(filt)
    rows = await db.feedback.find(filt, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return rows


@api.get("/admin/sellers/{sid}/feedback-stats")
async def admin_feedback_stats(sid: str, user: dict = Depends(require_admin)):
    return await _build_feedback_stats(sid)


@api.post("/admin/wallets/{seller_id}/adjust")
async def admin_wallet_adjust(seller_id: str, body: WalletAdjustIn, user: dict = Depends(require_admin)):
    seller = await db.users.find_one({"id": seller_id, "role": "seller"})
    if not seller:
        raise HTTPException(404, "Seller not found")
    if body.amount == 0:
        raise HTTPException(400, "Amount cannot be zero")
    await get_wallet(seller_id)
    await db.wallets.update_one({"user_id": seller_id}, {"$inc": {"available_balance": body.amount}})
    now = now_iso()
    await db.wallet_transactions.insert_one({
        "id": new_id(),
        "wallet_user_id": seller_id,
        "amount": body.amount,
        "type": "admin_intervention",
        "related_order_id": None,
        "description": f"Admin adjustment: {body.note}",
        "created_at": now,
    })
    await log_audit(user["id"], "wallet_adjust", "seller", seller_id, {"amount": body.amount, "note": body.note})
    await create_notification(seller_id, "admin_intervention", "Wallet adjusted by admin", f"{body.note} ({'+' if body.amount > 0 else ''}${body.amount:.2f})", None)
    return {"ok": True}


@api.patch("/admin/sellers/{sid}/notes")
async def set_seller_notes(sid: str, body: SellerNotesIn, user: dict = Depends(require_admin)):
    await db.seller_profiles.update_one({"user_id": sid}, {"$set": {"admin_notes": body.notes, "updated_at": now_iso()}})
    await log_audit(user["id"], "seller_notes", "seller", sid, {})
    return {"ok": True}


@api.get("/admin/activity-logs")
async def admin_activity_logs(
    response: Response,
    user: dict = Depends(require_admin),
    seller_id: Optional[str] = None,
    activity_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
):
    filt: dict = {}
    if seller_id:
        filt["seller_id"] = seller_id
    if activity_type:
        filt["activity_type"] = activity_type
    total = await db.seller_activity_logs.count_documents(filt)
    rows = await db.seller_activity_logs.find(filt, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    # enrich with seller username
    seller_ids = list({r["seller_id"] for r in rows})
    sellers = {u["id"]: u["username"] async for u in db.users.find({"id": {"$in": seller_ids}}, {"id": 1, "username": 1, "_id": 0})}
    for r in rows:
        r["seller_username"] = sellers.get(r["seller_id"], "Unknown")
    response.headers["X-Total-Count"] = str(total)
    response.headers["Access-Control-Expose-Headers"] = "X-Total-Count"
    return rows


@api.get("/admin/audit-logs")
async def admin_audit_logs(user: dict = Depends(require_admin), limit: int = 200):
    rows = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return rows


# ------------------------------------------------------- WEBSOCKET ---
@app.websocket("/api/ws")
async def ws_endpoint(websocket: WebSocket, token: str = Query(...)):
    user = await get_current_user_ws(token)
    if not user:
        await websocket.close(code=4401)
        return
    await manager.connect(user["id"], websocket)
    try:
        # Send initial online sellers list to admins
        if user["role"] == "admin":
            online_sellers = await db.seller_profiles.find({"availability_status": "ONLINE"}, {"_id": 0}).to_list(500)
            await websocket.send_json({"event": "online_sellers", "data": online_sellers})
        while True:
            try:
                msg = await websocket.receive_json()
                # Handle typing indicators
                if msg.get("event") == "typing":
                    order_id = msg.get("order_id")
                    if order_id:
                        room = await db.chat_rooms.find_one({"order_id": order_id})
                        if room and user["id"] in room["participants"]:
                            for pid in room["participants"]:
                                if pid != user["id"]:
                                    await manager.send_to_user(pid, "typing", {"order_id": order_id, "user_id": user["id"], "username": user["username"]})
                elif msg.get("event") == "ping":
                    await websocket.send_json({"event": "pong"})
            except WebSocketDisconnect:
                break
    finally:
        await manager.disconnect(user["id"], websocket)


# ---------------------------------------------------------------- ROOT ---
@api.get("/")
async def root():
    return {"name": "Seller Hub API", "status": "ok"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

