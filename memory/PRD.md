# SellerHub — Internal Seller Management Platform

## Original Problem Statement (Indonesian-speaking user, Feb 2026)
SellerHub is an internal admin-managed marketplace dashboard. Each seller can publish
listings, see their wallet & withdrawals, chat in messages, manage disputes, and view
feedback. Only the platform admin can checkout, complete, or cancel orders, approve
withdrawals, and add/remove feedback. The user requested a focused set of UX and
business-logic updates over the existing repo (`aureldeluz/sellerhub`).

## Tech stack
- Backend: FastAPI + Motor (async MongoDB), JWT auth, bcrypt, websockets
- Frontend: React 18 + react-router + tailwind + shadcn components + sonner toasts
- DB: MongoDB. Collections include: users, seller_profiles, listings, listing_images,
  orders, wallets, wallet_transactions, withdrawals, messages, threads, disputes,
  notifications, feedback, audit_logs, seller_activity.

## Roles
- `admin` — full access; checkout, complete, cancel, approve withdrawals, manage feedback,
  delete archived listings, adjust seller wallet, etc.
- `seller` — owns listings, views own wallet/orders/withdrawals/feedback, requests
  withdrawals. Cannot self-rate or check out their own listings.

## Implemented (this iteration — Feb 28, 2026)
1. **Withdrawal methods overhauled**
   - Removed: bitcoin, usdc, sepa, skrill, payoneer.
   - Added: `e_wallet` (provider Dana/Gopay/ShopeePay/Ovo + account_number),
     `bank_transfer` (bank_name + account_holder + account_number),
     `solana` (solana_address). Min amount $10.
   - Frontend Withdraw page replaces fee/you-receive text with fixed exchange-rate panel:
     "Rate setiap Senin: Rp.13,300" / "Rate hari lain: Rp.13,000".
2. **Withdrawal reference IDs (WD-XXXXXXXX)** + admin-only payout-detail view modal.
3. **Wallet history filtered** to only show: `sale_credit`, `withdrawal_approved`,
   `admin_intervention` (no duplicate pending/hold/refund rows for users).
4. **Stock decrement bug fixed**: checkout decrements by qty; listing flips to `sold`
   only when stock hits 0. Cancel restores qty and reactivates.
5. **Forgot password page simplified**: logo + "Reset password" header +
   "Silahkan kontak admin jika ingin reset password" + back-to-login link.
6. **Admin can permanently delete archived listings** via DELETE /api/listings/{id}
   (returns `hard_deleted: true` when status was already `archived`).
7. **Feedback (rating) system** replacing the ±0.1 delta rating:
   - `POST /api/admin/sellers/{sid}/feedback` (admin only) `{rating, comment, customer_label, order_id?}`
   - `DELETE /api/admin/feedback/{fid}` (admin only)
   - `GET /api/feedback` + `GET /api/feedback/stats` (seller, own only)
   - `GET /api/admin/sellers/{sid}/feedback` + `…/feedback-stats` (admin)
   - New seller page `/feedback` matching screenshot 5258 (stat cards + filter pills + list).
   - Sellers cannot create/delete feedback.
8. **Admin wallet adjustment** via `POST /api/admin/wallets/{seller_id}/adjust` writing
   a `admin_intervention` wallet transaction.
9. **MVP reset-token UI removed.**
10. No "Made with Emergent" badge anywhere.

### Test results (iteration 3 & 4)
- Backend: **19/19 PASS** (iteration_3.json)
- Frontend: **11/11 PASS** (iteration_4.json)

## Files of reference
Backend: `/app/backend/server.py`
Frontend: `/app/frontend/src/pages/{Withdraw,Withdrawals,ForgotPassword,Sellers,Feedback,Listings}.jsx`,
`/app/frontend/src/App.js`, `/app/frontend/src/components/layout/Sidebar.jsx`

## Backlog / P1+
- Investigate `/api/ws` websocket handshake (browser shows "closed before connection
  established" — does not block UX but impacts realtime online indicator over time).
- Polish: clear default `0` in withdraw amount input (use placeholder).
- Hook real "completed order" feedback to a per-order admin "Mark complete + add feedback"
  flow if the user wants tighter coupling.
- Translate UI strings to Indonesian if the user wants the entire app localized
  (currently only the forgot-password and exchange-rate panels are Indonesian).
- Export feedback to CSV from admin.

## Test credentials
See `/app/memory/test_credentials.md`.
