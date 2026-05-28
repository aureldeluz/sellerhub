"""End-to-end backend test for Seller Hub API."""
import io
import os
import uuid
import time
import requests
import pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE:
    # fallback to local for sanity
    BASE = "http://localhost:8001"
BASE = BASE.rstrip("/") + "/api"

ADMIN_EMAIL = "admin@sellerhub.io"
ADMIN_PASS = "Admin@12345"


# ---------- Shared state for sequential test order ----------
state: dict = {}


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------- AUTH ----------
def test_admin_login():
    r = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and "refresh_token" in data
    assert data["user"]["role"] == "admin"
    assert data["user"]["email"] == ADMIN_EMAIL
    state["admin_token"] = data["access_token"]
    state["admin_refresh"] = data["refresh_token"]
    state["admin_id"] = data["user"]["id"]


def test_register_seller():
    uid = uuid.uuid4().hex[:8]
    email = f"test_seller_{uid}@test.io"
    username = f"TEST_seller_{uid}"
    pwd = "Seller@12345"
    r = requests.post(f"{BASE}/auth/register", json={"username": username, "email": email, "password": pwd})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["role"] == "seller"
    assert d["user"]["email"] == email
    assert d["user"]["wallet"]["available_balance"] == 0.0
    state["seller_token"] = d["access_token"]
    state["seller_refresh"] = d["refresh_token"]
    state["seller_id"] = d["user"]["id"]
    state["seller_username"] = username
    state["seller_email"] = email
    state["seller_password"] = pwd


def test_register_duplicate():
    r = requests.post(f"{BASE}/auth/register", json={
        "username": state["seller_username"], "email": state["seller_email"], "password": "Seller@12345"
    })
    assert r.status_code == 400


def test_login_invalid_credentials():
    r = requests.post(f"{BASE}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_auth_me_seller():
    r = requests.get(f"{BASE}/auth/me", headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == state["seller_id"]
    assert d["profile"] is not None
    assert d["wallet"] is not None


def test_auth_me_admin():
    r = requests.get(f"{BASE}/auth/me", headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200
    d = r.json()
    assert d["role"] == "admin"
    assert d.get("wallet") is None


def test_auth_refresh():
    r = requests.post(f"{BASE}/auth/refresh", json={"refresh_token": state["seller_refresh"]})
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_forgot_and_reset_password():
    r = requests.post(f"{BASE}/auth/forgot-password", json={"email": state["seller_email"]})
    assert r.status_code == 200
    d = r.json()
    assert "reset_token" in d
    new_pw = "Seller@New123"
    r2 = requests.post(f"{BASE}/auth/reset-password", json={"token": d["reset_token"], "new_password": new_pw})
    assert r2.status_code == 200
    # Login with new
    r3 = requests.post(f"{BASE}/auth/login", json={"email": state["seller_email"], "password": new_pw})
    assert r3.status_code == 200
    state["seller_token"] = r3.json()["access_token"]
    state["seller_password"] = new_pw


# ---------- SELLER AVAILABILITY ----------
def test_seller_availability_online():
    r = requests.patch(f"{BASE}/seller/availability", json={"status": "ONLINE"}, headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    assert r.json()["availability_status"] == "ONLINE"


def test_seller_availability_offline_log():
    r = requests.patch(f"{BASE}/seller/availability", json={"status": "OFFLINE"}, headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    # check logs
    r2 = requests.get(f"{BASE}/seller/activity-logs", headers=_auth_headers(state["seller_token"]))
    assert r2.status_code == 200
    logs = r2.json()
    types = {l["activity_type"] for l in logs}
    assert "STATUS_ONLINE" in types
    assert "STATUS_OFFLINE" in types


def test_admin_cannot_set_availability():
    r = requests.patch(f"{BASE}/seller/availability", json={"status": "ONLINE"}, headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 403


# ---------- LISTINGS ----------
def test_create_listing():
    body = {
        "title": "TEST_Listing_Initial", "game_name": "Test Game", "category": "accounts",
        "description": "Test description", "stock": 5, "price": 49.99, "status": "active",
    }
    r = requests.post(f"{BASE}/listings", json=body, headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["title"] == body["title"]
    assert d["seller_id"] == state["seller_id"]
    state["listing_id"] = d["id"]


def test_seller_sees_only_own_listings():
    r = requests.get(f"{BASE}/listings", headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    for l in r.json():
        assert l["seller_id"] == state["seller_id"]


def test_admin_sees_all_and_filter():
    r = requests.get(f"{BASE}/listings?status=active&q=TEST_Listing", headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200
    ids = [l["id"] for l in r.json()]
    assert state["listing_id"] in ids


def test_update_listing_price_title_logs():
    r = requests.patch(f"{BASE}/listings/{state['listing_id']}",
                       json={"price": 59.99, "title": "TEST_Listing_Updated"},
                       headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    d = r.json()
    assert d["price"] == 59.99
    assert d["title"] == "TEST_Listing_Updated"
    # logs
    r2 = requests.get(f"{BASE}/seller/activity-logs", headers=_auth_headers(state["seller_token"]))
    types = {l["activity_type"] for l in r2.json()}
    assert "LISTING_CREATED" in types
    assert "LISTING_PRICE_CHANGED" in types
    assert "LISTING_TITLE_CHANGED" in types


def _make_png_bytes() -> bytes:
    # 1x1 PNG header
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
    )


def test_upload_image_valid():
    files = {"file": ("test.png", io.BytesIO(_make_png_bytes()), "image/png")}
    r = requests.post(f"{BASE}/listings/{state['listing_id']}/images",
                      files=files, headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["listing_id"] == state["listing_id"]
    state["image_id"] = d["id"]


def test_upload_image_invalid_format():
    files = {"file": ("test.txt", io.BytesIO(b"abc"), "text/plain")}
    r = requests.post(f"{BASE}/listings/{state['listing_id']}/images",
                      files=files, headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 400


def test_upload_max_3_images():
    for i in range(2):
        files = {"file": (f"t{i}.png", io.BytesIO(_make_png_bytes()), "image/png")}
        r = requests.post(f"{BASE}/listings/{state['listing_id']}/images",
                          files=files, headers=_auth_headers(state["seller_token"]))
        assert r.status_code == 200
    # 4th should fail
    files = {"file": ("over.png", io.BytesIO(_make_png_bytes()), "image/png")}
    r = requests.post(f"{BASE}/listings/{state['listing_id']}/images",
                      files=files, headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 400


def test_delete_image_log():
    r = requests.delete(f"{BASE}/listings/{state['listing_id']}/images/{state['image_id']}",
                        headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    r2 = requests.get(f"{BASE}/seller/activity-logs", headers=_auth_headers(state["seller_token"]))
    types = {l["activity_type"] for l in r2.json()}
    assert "LISTING_PHOTO_CHANGED" in types


# ---------- ORDERS ----------
def test_create_listing_for_order():
    body = {"title": "TEST_OrderListing", "game_name": "G", "category": "c",
            "description": "d", "stock": 3, "price": 25.0, "status": "active"}
    r = requests.post(f"{BASE}/listings", json=body, headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    state["order_listing_id"] = r.json()["id"]


def test_checkout_seller_forbidden():
    r = requests.post(f"{BASE}/orders/checkout",
                      json={"listing_id": state["order_listing_id"], "quantity": 1},
                      headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 403


def test_admin_checkout():
    r = requests.post(f"{BASE}/orders/checkout",
                      json={"listing_id": state["order_listing_id"], "quantity": 2},
                      headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["amount"] == 50.0
    assert d["status"] == "active"
    state["order_id"] = d["id"]
    # wallet has 50 pending
    rw = requests.get(f"{BASE}/wallet", headers=_auth_headers(state["seller_token"]))
    assert rw.status_code == 200
    assert rw.json()["pending_balance"] == 50.0


def test_orders_visibility():
    r = requests.get(f"{BASE}/orders", headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert state["order_id"] in ids
    r2 = requests.get(f"{BASE}/orders", headers=_auth_headers(state["admin_token"]))
    assert r2.status_code == 200


def test_chat_room_messages():
    # admin send
    r = requests.post(f"{BASE}/chat/rooms/{state['order_id']}/messages",
                      json={"content": "Hello from admin"},
                      headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200, r.text
    # seller fetch
    r2 = requests.get(f"{BASE}/chat/rooms/{state['order_id']}/messages",
                      headers=_auth_headers(state["seller_token"]))
    assert r2.status_code == 200
    msgs = r2.json()["messages"]
    assert any(m["content"] == "Hello from admin" for m in msgs)
    # list rooms
    r3 = requests.get(f"{BASE}/chat/rooms", headers=_auth_headers(state["seller_token"]))
    assert r3.status_code == 200
    assert len(r3.json()) >= 1


def test_complete_order():
    r = requests.post(f"{BASE}/orders/{state['order_id']}/complete",
                      headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200
    rw = requests.get(f"{BASE}/wallet", headers=_auth_headers(state["seller_token"]))
    w = rw.json()
    assert w["available_balance"] == 50.0
    assert w["pending_balance"] == 0.0


def test_cancel_order_flow():
    # Create another listing & order to cancel
    body = {"title": "TEST_CancelListing", "game_name": "G", "category": "c",
            "description": "d", "stock": 1, "price": 30.0, "status": "active"}
    rl = requests.post(f"{BASE}/listings", json=body, headers=_auth_headers(state["seller_token"]))
    lid = rl.json()["id"]
    ro = requests.post(f"{BASE}/orders/checkout", json={"listing_id": lid, "quantity": 1},
                       headers=_auth_headers(state["admin_token"]))
    assert ro.status_code == 200
    oid = ro.json()["id"]
    rc = requests.post(f"{BASE}/orders/{oid}/cancel", json={"reason": "Test cancel"},
                       headers=_auth_headers(state["admin_token"]))
    assert rc.status_code == 200
    # listing restored to active
    rg = requests.get(f"{BASE}/listings/{lid}", headers=_auth_headers(state["admin_token"]))
    assert rg.json()["status"] == "active"


# ---------- WALLET ----------
def test_wallet_withdraw_and_admin_action():
    r = requests.post(f"{BASE}/wallet/withdraw",
                      json={"amount": 20.0, "method": "bitcoin", "payout_info": "bc1qtest"},
                      headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200, r.text
    wid = r.json()["id"]
    # admin approve
    ra = requests.patch(f"{BASE}/wallet/withdrawals/{wid}",
                       json={"status": "approved", "admin_notes": "ok"},
                       headers=_auth_headers(state["admin_token"]))
    assert ra.status_code == 200
    # check balance dropped to 30
    rw = requests.get(f"{BASE}/wallet", headers=_auth_headers(state["seller_token"]))
    assert rw.json()["available_balance"] == 30.0


def test_wallet_withdraw_reject_refunds():
    r = requests.post(f"{BASE}/wallet/withdraw",
                      json={"amount": 15.0, "method": "usdc", "payout_info": "0xtest"},
                      headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    wid = r.json()["id"]
    rb = requests.get(f"{BASE}/wallet", headers=_auth_headers(state["seller_token"]))
    bal_after_request = rb.json()["available_balance"]
    assert bal_after_request == 15.0  # 30 - 15
    ra = requests.patch(f"{BASE}/wallet/withdrawals/{wid}",
                       json={"status": "rejected", "admin_notes": "nope"},
                       headers=_auth_headers(state["admin_token"]))
    assert ra.status_code == 200
    rw = requests.get(f"{BASE}/wallet", headers=_auth_headers(state["seller_token"]))
    assert rw.json()["available_balance"] == 30.0


def test_wallet_seller_only():
    r = requests.get(f"{BASE}/wallet", headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 403


# ---------- DISPUTES ----------
def test_create_and_resolve_dispute():
    # Create listing+order for dispute
    body = {"title": "TEST_DisputeListing", "game_name": "G", "category": "c",
            "description": "d", "stock": 1, "price": 12.0, "status": "active"}
    rl = requests.post(f"{BASE}/listings", json=body, headers=_auth_headers(state["seller_token"]))
    lid = rl.json()["id"]
    ro = requests.post(f"{BASE}/orders/checkout", json={"listing_id": lid, "quantity": 1},
                       headers=_auth_headers(state["admin_token"]))
    oid = ro.json()["id"]
    rd = requests.post(f"{BASE}/disputes",
                       json={"order_id": oid, "reason": "Not delivered", "admin_notes": "x"},
                       headers=_auth_headers(state["admin_token"]))
    assert rd.status_code == 200, rd.text
    did = rd.json()["id"]
    # order status disputed
    rog = requests.get(f"{BASE}/orders/{oid}", headers=_auth_headers(state["admin_token"]))
    assert rog.json()["status"] == "disputed"
    rp = requests.patch(f"{BASE}/disputes/{did}",
                       json={"resolution_status": "resolved_buyer"},
                       headers=_auth_headers(state["admin_token"]))
    assert rp.status_code == 200


# ---------- NOTIFICATIONS ----------
def test_notifications_crud():
    r = requests.get(f"{BASE}/notifications", headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    notifs = r.json()
    assert len(notifs) > 0
    nid = notifs[0]["id"]
    r2 = requests.patch(f"{BASE}/notifications/{nid}/read", headers=_auth_headers(state["seller_token"]))
    assert r2.status_code == 200
    r3 = requests.post(f"{BASE}/notifications/read-all", headers=_auth_headers(state["seller_token"]))
    assert r3.status_code == 200
    # unread count = 0
    r4 = requests.get(f"{BASE}/notifications/unread-count", headers=_auth_headers(state["seller_token"]))
    assert r4.json()["count"] == 0


def test_notification_preferences():
    r = requests.get(f"{BASE}/notifications/preferences", headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    r2 = requests.patch(f"{BASE}/notifications/preferences",
                       json={"sound_enabled": False, "sound_volume": 0.3},
                       headers=_auth_headers(state["seller_token"]))
    assert r2.status_code == 200
    d = r2.json()
    assert d["sound_enabled"] is False
    assert d["sound_volume"] == 0.3


# ---------- ADMIN ----------
def test_admin_stats():
    r = requests.get(f"{BASE}/admin/stats", headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200
    d = r.json()
    for k in ["orders", "disputes_open", "sellers", "listings", "withdrawals_pending", "revenue"]:
        assert k in d


def test_admin_list_sellers_and_filter():
    r = requests.get(f"{BASE}/admin/sellers?q=TEST_seller", headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200
    found = [s for s in r.json() if s["id"] == state["seller_id"]]
    assert len(found) == 1


def test_admin_adjust_rating():
    r = requests.patch(f"{BASE}/admin/sellers/{state['seller_id']}/rating",
                       json={"delta": -0.5, "note": "test"},
                       headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200
    assert r.json()["rating"] == 4.5


def test_admin_set_notes():
    r = requests.patch(f"{BASE}/admin/sellers/{state['seller_id']}/notes",
                       json={"notes": "Trustworthy seller"},
                       headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200


def test_admin_activity_logs():
    r = requests.get(f"{BASE}/admin/activity-logs?seller_id=" + state["seller_id"],
                     headers=_auth_headers(state["admin_token"]))
    assert r.status_code == 200
    assert len(r.json()) > 0


def test_rbac_seller_forbidden_admin_endpoints():
    for path in ["/admin/stats", "/admin/sellers", "/admin/activity-logs", "/admin/audit-logs"]:
        r = requests.get(f"{BASE}{path}", headers=_auth_headers(state["seller_token"]))
        assert r.status_code == 403, f"{path} expected 403 got {r.status_code}"


# ---------- LISTING DELETE ----------
def test_delete_listing_logs():
    r = requests.delete(f"{BASE}/listings/{state['listing_id']}",
                        headers=_auth_headers(state["seller_token"]))
    assert r.status_code == 200
    r2 = requests.get(f"{BASE}/seller/activity-logs", headers=_auth_headers(state["seller_token"]))
    types = {l["activity_type"] for l in r2.json()}
    assert "LISTING_DELETED" in types
