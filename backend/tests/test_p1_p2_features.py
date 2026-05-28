"""Tests for P1/P2 enhancements: rate limiting, 2FA TOTP, pagination headers, /admin/analytics.

Notes:
- Rate-limit tests use LOCAL_URL (localhost:8001) to avoid CDN/Cloudflare IP rotation.
- 2FA tests run last and ALWAYS disable 2FA in teardown to not pollute other suites.
- Pagination tests use external REACT_APP_BACKEND_URL so we verify CORS expose-headers reach client.
"""
import os
import time
import uuid
import pyotp
import pytest
import requests

EXT_BASE = os.environ.get("REACT_APP_BACKEND_URL") or "http://localhost:8001"
EXT_BASE = EXT_BASE.rstrip("/")
LOCAL_BASE = "http://localhost:8001"

ADMIN_EMAIL = "admin@sellerhub.io"
ADMIN_PASSWORD = "Admin@12345"

# Pull REACT_APP_BACKEND_URL from frontend .env if not present
if "REACT_APP_BACKEND_URL" not in os.environ:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    EXT_BASE = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass


# ---------------- helpers ----------------
def _login(base, email, password, totp_code=None):
    payload = {"email": email, "password": password}
    if totp_code is not None:
        payload["totp_code"] = totp_code
    return requests.post(f"{base}/api/auth/login", json=payload, timeout=15)


def _register_seller(base):
    suffix = uuid.uuid4().hex[:8]
    payload = {
        "username": f"TEST_p2_{suffix}",
        "email": f"TEST_p2_{suffix}@test.io",
        "password": "Seller@12345",
    }
    r = requests.post(f"{base}/api/auth/register", json=payload, timeout=15)
    return r, payload


@pytest.fixture(scope="module")
def admin_token():
    # Wait for rate-limit window in case previous runs hammered login
    for _ in range(3):
        r = _login(EXT_BASE, ADMIN_EMAIL, ADMIN_PASSWORD)
        if r.status_code == 200:
            return r.json()["access_token"]
        if r.status_code == 429:
            time.sleep(20)
            continue
        break
    pytest.skip(f"Admin login failed: {r.status_code} {r.text}")


@pytest.fixture(scope="module")
def seller_creds():
    # Sleep first to avoid register-rate-limit collision
    time.sleep(2)
    r, payload = _register_seller(EXT_BASE)
    if r.status_code == 429:
        time.sleep(65)
        r, payload = _register_seller(EXT_BASE)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return {"token": r.json()["access_token"], "email": payload["email"], "password": payload["password"], "user_id": r.json()["user"]["id"]}


# ============================================================
# PAGINATION (X-Total-Count) on list endpoints
# ============================================================
class TestPagination:
    """Verify X-Total-Count header + Access-Control-Expose-Headers on paginated lists."""

    def _assert_total_count_header(self, r):
        assert r.status_code == 200, f"unexpected {r.status_code}: {r.text[:200]}"
        assert "X-Total-Count" in r.headers, f"X-Total-Count missing on {r.url}"
        total = int(r.headers["X-Total-Count"])
        assert total >= 0
        expose = r.headers.get("Access-Control-Expose-Headers", "")
        assert "X-Total-Count" in expose, f"Expose-Headers missing X-Total-Count: '{expose}'"
        return total

    def test_listings_pagination(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/listings?skip=0&limit=2", headers=h, timeout=15)
        total = self._assert_total_count_header(r)
        body = r.json()
        assert len(body) <= 2
        if total > 0:
            assert len(body) >= min(1, total)

    def test_orders_pagination(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/orders?skip=0&limit=2", headers=h, timeout=15)
        total = self._assert_total_count_header(r)
        assert len(r.json()) <= 2 and len(r.json()) <= total

    def test_withdrawals_pagination(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/wallet/withdrawals?skip=0&limit=2", headers=h, timeout=15)
        self._assert_total_count_header(r)

    def test_notifications_pagination(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/notifications?skip=0&limit=2", headers=h, timeout=15)
        self._assert_total_count_header(r)

    def test_admin_sellers_pagination(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/admin/sellers?skip=0&limit=2", headers=h, timeout=15)
        self._assert_total_count_header(r)

    def test_admin_activity_logs_pagination(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/admin/activity-logs?skip=0&limit=2", headers=h, timeout=15)
        self._assert_total_count_header(r)


# ============================================================
# ANALYTICS endpoint
# ============================================================
class TestAnalytics:
    def test_analytics_default_14_days(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/admin/analytics?days=14", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert {"series", "status_breakdown", "top_categories", "active_sellers_count", "days"} <= set(data.keys())
        assert data["days"] == 14
        assert isinstance(data["series"], list) and len(data["series"]) == 15  # start day + 14
        for entry in data["series"]:
            assert {"date", "revenue", "orders"} <= set(entry.keys())
        assert isinstance(data["active_sellers_count"], int)

    def test_analytics_7_days(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/admin/analytics?days=7", headers=h, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["days"] == 7
        assert len(d["series"]) == 8

    def test_analytics_30_days(self, admin_token):
        h = {"Authorization": f"Bearer {admin_token}"}
        r = requests.get(f"{EXT_BASE}/api/admin/analytics?days=30", headers=h, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["series"]) == 31

    def test_analytics_seller_forbidden(self, seller_creds):
        h = {"Authorization": f"Bearer {seller_creds['token']}"}
        r = requests.get(f"{EXT_BASE}/api/admin/analytics?days=7", headers=h, timeout=15)
        assert r.status_code == 403, f"expected 403, got {r.status_code}"


# ============================================================
# 2FA TOTP
# ============================================================
class Test2FA:
    """Use a freshly created seller to keep admin clean."""

    @pytest.fixture(scope="class")
    def user(self):
        time.sleep(3)
        r, payload = _register_seller(EXT_BASE)
        if r.status_code == 429:
            time.sleep(65)
            r, payload = _register_seller(EXT_BASE)
        assert r.status_code == 200, f"register failed: {r.text}"
        token = r.json()["access_token"]
        ctx = {"token": token, "email": payload["email"], "password": payload["password"], "secret": None}
        yield ctx
        # Teardown: if 2fa still enabled, disable
        try:
            if ctx.get("secret"):
                code = pyotp.TOTP(ctx["secret"]).now()
                requests.post(
                    f"{EXT_BASE}/api/auth/2fa/disable",
                    json={"password": ctx["password"], "code": code},
                    headers={"Authorization": f"Bearer {ctx['token']}"},
                    timeout=10,
                )
        except Exception:
            pass

    def test_2fa_setup_returns_secret_and_uri(self, user):
        r = requests.post(f"{EXT_BASE}/api/auth/2fa/setup", headers={"Authorization": f"Bearer {user['token']}"}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "secret" in d and "otpauth_uri" in d
        assert d["otpauth_uri"].startswith("otpauth://totp/")
        user["secret"] = d["secret"]

    def test_2fa_enable_wrong_password(self, user):
        assert user["secret"], "setup must run first"
        code = pyotp.TOTP(user["secret"]).now()
        r = requests.post(
            f"{EXT_BASE}/api/auth/2fa/enable",
            json={"password": "WrongPassword!", "code": code},
            headers={"Authorization": f"Bearer {user['token']}"},
            timeout=10,
        )
        assert r.status_code == 401

    def test_2fa_enable_wrong_code(self, user):
        assert user["secret"]
        r = requests.post(
            f"{EXT_BASE}/api/auth/2fa/enable",
            json={"password": user["password"], "code": "000000"},
            headers={"Authorization": f"Bearer {user['token']}"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_2fa_enable_success(self, user):
        code = pyotp.TOTP(user["secret"]).now()
        r = requests.post(
            f"{EXT_BASE}/api/auth/2fa/enable",
            json={"password": user["password"], "code": code},
            headers={"Authorization": f"Bearer {user['token']}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True and body.get("totp_enabled") is True

    def test_me_includes_totp_enabled(self, user):
        r = requests.get(f"{EXT_BASE}/api/auth/me", headers={"Authorization": f"Bearer {user['token']}"}, timeout=10)
        assert r.status_code == 200
        assert r.json().get("totp_enabled") is True

    def test_login_blocked_without_code(self, user):
        time.sleep(2)
        r = _login(EXT_BASE, user["email"], user["password"])
        assert r.status_code == 401
        detail = r.json().get("detail")
        # detail may be a dict
        assert isinstance(detail, dict) and detail.get("code") == "2fa_required", f"got: {detail}"

    def test_login_with_invalid_code(self, user):
        time.sleep(2)
        r = _login(EXT_BASE, user["email"], user["password"], totp_code="000000")
        assert r.status_code == 401
        detail = r.json().get("detail")
        assert isinstance(detail, dict) and detail.get("code") == "2fa_invalid", f"got: {detail}"

    def test_login_with_valid_code(self, user):
        time.sleep(2)
        code = pyotp.TOTP(user["secret"]).now()
        r = _login(EXT_BASE, user["email"], user["password"], totp_code=code)
        assert r.status_code == 200, r.text
        assert "access_token" in r.json() and "refresh_token" in r.json()

    def test_2fa_enable_without_prior_setup_rejected(self, admin_token):
        # admin has no pending secret -> enable should 400
        code = "123456"
        r = requests.post(
            f"{EXT_BASE}/api/auth/2fa/enable",
            json={"password": ADMIN_PASSWORD, "code": code},
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=10,
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"

    def test_2fa_disable_wrong_code(self, user):
        r = requests.post(
            f"{EXT_BASE}/api/auth/2fa/disable",
            json={"password": user["password"], "code": "000000"},
            headers={"Authorization": f"Bearer {user['token']}"},
            timeout=10,
        )
        assert r.status_code == 400

    def test_2fa_disable_success(self, user):
        code = pyotp.TOTP(user["secret"]).now()
        r = requests.post(
            f"{EXT_BASE}/api/auth/2fa/disable",
            json={"password": user["password"], "code": code},
            headers={"Authorization": f"Bearer {user['token']}"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("totp_enabled") is False
        user["secret"] = None  # mark as disabled


# ============================================================
# RATE LIMITS (run last; uses localhost to avoid CDN IP rotation)
# ============================================================
class TestRateLimits:
    """Hit local backend directly so get_remote_address sees one stable IP."""

    def test_login_rate_limit_10_per_min(self):
        time.sleep(62)  # reset window
        codes = []
        for i in range(12):
            r = requests.post(
                f"{LOCAL_BASE}/api/auth/login",
                json={"email": "nobody@example.com", "password": "wrong"},
                timeout=10,
            )
            codes.append(r.status_code)
        n_429 = sum(1 for c in codes if c == 429)
        assert n_429 >= 2, f"expected >=2 429s, got codes={codes}"
        # first 10 should NOT be 429
        assert codes[:10].count(429) == 0, f"first 10 should not be 429, got {codes[:10]}"

    def test_register_rate_limit_5_per_min(self):
        time.sleep(62)
        codes = []
        for i in range(7):
            payload = {
                "username": f"TEST_rl_{uuid.uuid4().hex[:8]}",
                "email": f"TEST_rl_{uuid.uuid4().hex[:8]}@t.io",
                "password": "Secret@12345",
            }
            r = requests.post(f"{LOCAL_BASE}/api/auth/register", json=payload, timeout=10)
            codes.append(r.status_code)
        n_429 = sum(1 for c in codes if c == 429)
        assert n_429 >= 2, f"expected >=2 429s, got {codes}"
        assert codes[:5].count(429) == 0, f"first 5 should not be 429, got {codes[:5]}"

    def test_forgot_password_rate_limit_3_per_min(self):
        time.sleep(62)
        codes = []
        for i in range(5):
            r = requests.post(
                f"{LOCAL_BASE}/api/auth/forgot-password",
                json={"email": f"nobody{i}@x.com"},
                timeout=10,
            )
            codes.append(r.status_code)
        n_429 = sum(1 for c in codes if c == 429)
        assert n_429 >= 2, f"expected >=2 429s, got {codes}"
        assert codes[:3].count(429) == 0, f"first 3 should not be 429, got {codes[:3]}"

    def test_reset_password_rate_limit_5_per_min(self):
        time.sleep(62)
        codes = []
        for i in range(7):
            r = requests.post(
                f"{LOCAL_BASE}/api/auth/reset-password",
                json={"token": "invalid_token", "new_password": "newpass12"},
                timeout=10,
            )
            codes.append(r.status_code)
        n_429 = sum(1 for c in codes if c == 429)
        assert n_429 >= 2, f"expected >=2 429s, got {codes}"


# ============================================================
# Regression: smoke test core flows still work
# ============================================================
class TestRegressionSmoke:
    def test_admin_me(self, admin_token):
        r = requests.get(f"{EXT_BASE}/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "admin"
        assert "totp_enabled" in body

    def test_admin_stats(self, admin_token):
        r = requests.get(f"{EXT_BASE}/api/admin/stats", headers={"Authorization": f"Bearer {admin_token}"}, timeout=10)
        assert r.status_code == 200
        assert "orders" in r.json()

    def test_seller_rbac_blocks_admin(self, seller_creds):
        h = {"Authorization": f"Bearer {seller_creds['token']}"}
        r = requests.get(f"{EXT_BASE}/api/admin/stats", headers=h, timeout=10)
        assert r.status_code == 403
