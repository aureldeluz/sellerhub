"""Tests for new SellerHub features: withdrawals (3 methods), stock fix,
wallet txn filter, feedback system, archived listing hard delete, wallet adjust."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("TEST_BACKEND_URL", "https://withdrawal-system-v2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@sellerhub.io"
ADMIN_PWD = "Admin@12345"


def _login(email, pwd):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register_seller():
    uniq = uuid.uuid4().hex[:8]
    email = f"seller_{uniq}@sellerhub.io"
    pwd = "Seller@12345"
    r = requests.post(f"{API}/auth/register", json={
        "username": f"seller_{uniq}", "email": email, "password": pwd
    }, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    return data["access_token"], data["user"]["id"], email


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PWD)


@pytest.fixture(scope="module")
def seller_ctx():
    token, sid, email = _register_seller()
    return {"token": token, "id": sid, "email": email}


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def _seed_balance(admin_token, seller_id, amount):
    r = requests.post(f"{API}/admin/wallets/{seller_id}/adjust",
                      json={"amount": amount, "note": "test seed"}, headers=_h(admin_token), timeout=20)
    assert r.status_code == 200, r.text


# --- Withdrawals: 3 new methods + validation ---
class TestWithdrawals:
    def test_e_wallet_withdraw(self, admin_token, seller_ctx):
        _seed_balance(admin_token, seller_ctx["id"], 50)
        r = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "e_wallet",
            "payout_details": {"provider": "dana", "account_number": "081234"}
        }, headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ref_no"].startswith("WD-")
        assert len(d["ref_no"]) == 11  # WD- + 8 hex
        assert d["method"] == "e_wallet"

    def test_bank_transfer_withdraw(self, admin_token, seller_ctx):
        _seed_balance(admin_token, seller_ctx["id"], 50)
        r = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "bank_transfer",
            "payout_details": {"bank_name": "BCA", "account_holder": "Foo Bar", "account_number": "12345"}
        }, headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["ref_no"].startswith("WD-")

    def test_solana_withdraw(self, admin_token, seller_ctx):
        _seed_balance(admin_token, seller_ctx["id"], 50)
        r = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "solana",
            "payout_details": {"solana_address": "SoLAddr123"}
        }, headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["ref_no"].startswith("WD-")

    def test_old_method_rejected(self, seller_ctx):
        for m in ["bitcoin", "usdc", "sepa", "skrill", "payoneer"]:
            r = requests.post(f"{API}/wallet/withdraw", json={
                "amount": 10, "method": m, "payout_details": {}
            }, headers=_h(seller_ctx["token"]), timeout=20)
            assert r.status_code == 422, f"{m} should be rejected: {r.status_code}"

    def test_e_wallet_missing_account_number(self, seller_ctx):
        r = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "e_wallet",
            "payout_details": {"provider": "dana"}
        }, headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 422

    def test_bank_transfer_missing_holder(self, seller_ctx):
        r = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "bank_transfer",
            "payout_details": {"bank_name": "BCA", "account_number": "123"}
        }, headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 422

    def test_admin_view_withdrawal_and_seller_403(self, admin_token, seller_ctx):
        _seed_balance(admin_token, seller_ctx["id"], 50)
        cr = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "solana",
            "payout_details": {"solana_address": "Sol"}
        }, headers=_h(seller_ctx["token"]), timeout=20).json()
        wid = cr["id"]
        # admin can GET
        a = requests.get(f"{API}/wallet/withdrawals/{wid}", headers=_h(admin_token), timeout=20)
        assert a.status_code == 200
        assert a.json()["payout_details"]["solana_address"] == "Sol"
        # seller forbidden
        s = requests.get(f"{API}/wallet/withdrawals/{wid}", headers=_h(seller_ctx["token"]), timeout=20)
        assert s.status_code == 403

    def test_approve_creates_withdrawal_approved_txn(self, admin_token, seller_ctx):
        _seed_balance(admin_token, seller_ctx["id"], 50)
        wid = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "solana", "payout_details": {"solana_address": "S"}
        }, headers=_h(seller_ctx["token"]), timeout=20).json()["id"]
        r = requests.patch(f"{API}/wallet/withdrawals/{wid}",
                           json={"status": "approved"}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200

    def test_reject_returns_funds(self, admin_token, seller_ctx):
        _seed_balance(admin_token, seller_ctx["id"], 50)
        before = requests.get(f"{API}/wallet", headers=_h(seller_ctx["token"]), timeout=20).json()["available_balance"]
        wid = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "solana", "payout_details": {"solana_address": "S"}
        }, headers=_h(seller_ctx["token"]), timeout=20).json()["id"]
        after_hold = requests.get(f"{API}/wallet", headers=_h(seller_ctx["token"]), timeout=20).json()["available_balance"]
        assert after_hold == before - 10
        r = requests.patch(f"{API}/wallet/withdrawals/{wid}",
                           json={"status": "rejected", "admin_notes": "bad"}, headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        final = requests.get(f"{API}/wallet", headers=_h(seller_ctx["token"]), timeout=20).json()["available_balance"]
        assert final == before


# --- Wallet transactions filter ---
class TestWalletTransactions:
    def test_only_visible_types(self, admin_token, seller_ctx):
        # create some txns of various types via flows
        _seed_balance(admin_token, seller_ctx["id"], 100)  # admin_intervention
        # Create listing as seller, admin checkout & complete to generate sale_credit
        # Create listing
        lr = requests.post(f"{API}/listings", json={
            "title": "Test Item", "game_name": "G", "category": "C",
            "description": "d", "stock": 2, "price": 10, "status": "active"
        }, headers=_h(seller_ctx["token"]), timeout=20)
        assert lr.status_code == 200, lr.text
        lid = lr.json()["id"]
        # checkout
        ord_r = requests.post(f"{API}/orders/checkout", json={"listing_id": lid, "quantity": 1},
                              headers=_h(admin_token), timeout=20)
        assert ord_r.status_code == 200, ord_r.text
        oid = ord_r.json()["id"]
        # complete
        cp = requests.post(f"{API}/orders/{oid}/complete", headers=_h(admin_token), timeout=20)
        assert cp.status_code == 200
        # withdraw + approve (creates withdrawal_approved)
        wid = requests.post(f"{API}/wallet/withdraw", json={
            "amount": 10, "method": "solana", "payout_details": {"solana_address": "S"}
        }, headers=_h(seller_ctx["token"]), timeout=20).json()["id"]
        requests.patch(f"{API}/wallet/withdrawals/{wid}",
                       json={"status": "approved"}, headers=_h(admin_token), timeout=20)
        # GET transactions
        r = requests.get(f"{API}/wallet/transactions", headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 200
        rows = r.json()
        allowed = {"sale_credit", "withdrawal_approved", "admin_intervention"}
        types = {row["type"] for row in rows}
        assert types.issubset(allowed), f"unexpected types: {types - allowed}"
        # must contain at least one of each
        assert "sale_credit" in types
        assert "admin_intervention" in types
        assert "withdrawal_approved" in types


# --- Stock decrement bug ---
class TestStock:
    def test_stock_decrement_and_restore(self, admin_token, seller_ctx):
        lr = requests.post(f"{API}/listings", json={
            "title": "Stock Item", "game_name": "G", "category": "C",
            "description": "d", "stock": 3, "price": 5, "status": "active"
        }, headers=_h(seller_ctx["token"]), timeout=20)
        assert lr.status_code == 200, lr.text
        lid = lr.json()["id"]
        # checkout 1 -> stock 2 active
        o1 = requests.post(f"{API}/orders/checkout", json={"listing_id": lid, "quantity": 1},
                           headers=_h(admin_token), timeout=20).json()
        l = requests.get(f"{API}/listings/{lid}", headers=_h(admin_token), timeout=20).json()
        assert l["stock"] == 2 and l["status"] == "active"
        # checkout qty=2 -> stock 0 sold
        requests.post(f"{API}/orders/checkout", json={"listing_id": lid, "quantity": 2},
                      headers=_h(admin_token), timeout=20)
        l = requests.get(f"{API}/listings/{lid}", headers=_h(admin_token), timeout=20).json()
        assert l["stock"] == 0 and l["status"] == "sold", l
        # cancel first -> stock 1, active
        cr = requests.post(f"{API}/orders/{o1['id']}/cancel", json={"reason": "test"},
                           headers=_h(admin_token), timeout=20)
        assert cr.status_code == 200
        l = requests.get(f"{API}/listings/{lid}", headers=_h(admin_token), timeout=20).json()
        assert l["stock"] == 1 and l["status"] == "active", l


# --- Feedback system ---
class TestFeedback:
    def test_admin_add_feedback(self, admin_token, seller_ctx):
        r = requests.post(f"{API}/admin/sellers/{seller_ctx['id']}/feedback",
                          json={"rating": "positive", "comment": "Fast and legit", "customer_label": "Skr***"},
                          headers=_h(admin_token), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["rating"] == "positive"

    def test_seller_cannot_post_feedback(self, seller_ctx):
        r = requests.post(f"{API}/admin/sellers/{seller_ctx['id']}/feedback",
                          json={"rating": "positive", "comment": "self"},
                          headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 403

    def test_seller_lists_own_feedback(self, seller_ctx):
        r = requests.get(f"{API}/feedback", headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert all(x["seller_id"] == seller_ctx["id"] for x in rows)

    def test_feedback_stats(self, seller_ctx):
        r = requests.get(f"{API}/feedback/stats", headers=_h(seller_ctx["token"]), timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["completed_orders", "positive", "negative", "score"]:
            assert k in d

    def test_admin_lists_seller_feedback(self, admin_token, seller_ctx):
        r = requests.get(f"{API}/admin/sellers/{seller_ctx['id']}/feedback",
                         headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_delete_feedback(self, admin_token, seller_ctx):
        # create one
        c = requests.post(f"{API}/admin/sellers/{seller_ctx['id']}/feedback",
                          json={"rating": "negative", "comment": "x"},
                          headers=_h(admin_token), timeout=20).json()
        d = requests.delete(f"{API}/admin/feedback/{c['id']}", headers=_h(admin_token), timeout=20)
        assert d.status_code == 200


# --- Listing delete (archived hard delete) ---
class TestListingDelete:
    def test_active_archives_then_hard_delete(self, admin_token, seller_ctx):
        lr = requests.post(f"{API}/listings", json={
            "title": "Del Item", "game_name": "G", "category": "C",
            "description": "d", "stock": 1, "price": 5, "status": "active"
        }, headers=_h(seller_ctx["token"]), timeout=20).json()
        lid = lr["id"]
        # admin deletes active -> archived
        r1 = requests.delete(f"{API}/listings/{lid}", headers=_h({**_h(admin_token)}["Authorization"].split(" ")[1])
                             if False else None, timeout=20) if False else requests.delete(
            f"{API}/listings/{lid}", headers=_h(admin_token), timeout=20)
        assert r1.status_code == 200
        assert r1.json().get("hard_deleted") is not True
        got = requests.get(f"{API}/listings/{lid}", headers=_h(admin_token), timeout=20).json()
        assert got["status"] == "archived"
        # delete archived -> hard delete
        r2 = requests.delete(f"{API}/listings/{lid}", headers=_h(admin_token), timeout=20)
        assert r2.status_code == 200
        assert r2.json().get("hard_deleted") is True
        # 404 now
        gone = requests.get(f"{API}/listings/{lid}", headers=_h(admin_token), timeout=20)
        assert gone.status_code == 404


# --- Admin wallet adjust ---
class TestWalletAdjust:
    def test_adjust_increases_and_logs(self, admin_token, seller_ctx):
        before = requests.get(f"{API}/wallet", headers=_h(seller_ctx["token"]), timeout=20).json()["available_balance"]
        r = requests.post(f"{API}/admin/wallets/{seller_ctx['id']}/adjust",
                          json={"amount": 5.0, "note": "compensation"},
                          headers=_h(admin_token), timeout=20)
        assert r.status_code == 200
        after = requests.get(f"{API}/wallet", headers=_h(seller_ctx["token"]), timeout=20).json()["available_balance"]
        assert round(after - before, 2) == 5.0
        # show up in transactions
        txns = requests.get(f"{API}/wallet/transactions", headers=_h(seller_ctx["token"]), timeout=20).json()
        assert any(t["type"] == "admin_intervention" and t["description"].endswith("compensation") for t in txns)
