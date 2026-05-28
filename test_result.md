user_problem_statement: |
  Updates to SellerHub (Indonesian seller dashboard). Must implement:
  1) New withdrawal methods only: e_wallet (Dana/Gopay/ShopeePay/Ovo + account_number),
     bank_transfer (bank_name + account_holder + account_number), solana (solana_address).
     Remove bitcoin, usdc, sepa, skrill, payoneer. Withdraw page must show fixed exchange
     rates "Rate setiap Senin: Rp.13,300" and "Rate hari lain: Rp.13,000" instead of
     fees/you-receive breakdown.
  2) Each withdrawal request must have a human-readable ref id (WD-XXXXXXXX). Admin can
     view payout details via the withdrawal modal.
  3) Wallet transactions list (seller) MUST only display: completed orders (sale_credit),
     withdrawal approvals (withdrawal_approved), and admin interventions (admin_intervention).
     No duplicate entries from pending_credit / withdrawal_hold etc.
  4) Stock bug: clicking checkout 1x must decrement stock by quantity; listing only flips to
     "sold" when stock reaches 0. Cancel must restore stock and reactivate listing.
  5) Forgot password page: strip MVP token UI. Show "Reset password" header,
     "Silahkan kontak admin jika ingin reset password" message, and "Back to login page" link.
  6) Admin can permanently delete archived listings via DELETE /api/listings/{id}.
  7) Feedback (rating) system: thumbs up/down per screenshot. Only admin can add/delete via
     POST /api/admin/sellers/{sid}/feedback, DELETE /api/admin/feedback/{fid}. Seller views
     own via GET /api/feedback and GET /api/feedback/stats.

backend:
  - task: "Withdrawal new methods schema + ref_no"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "WithdrawIn updated to method literal {e_wallet,bank_transfer,solana} with structured payout_details validator. Each withdrawal stored with ref_no (WD- + first 8 of uuid)."
  - task: "Stock decrement on checkout, cancel restores stock"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "checkout now decrements stock by quantity; status flips to sold only at 0. cancel adds quantity back and reverts status to active if it had been sold."
  - task: "Wallet transactions filtered to 3 visible types"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "/api/wallet/transactions returns only sale_credit, withdrawal_approved, admin_intervention. Internal pending/hold/refund records remain in DB for audit but are not exposed."
  - task: "Admin permanent delete archived listings"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "DELETE /api/listings/{id} hard-deletes for admin when status==archived; otherwise soft-archives."
  - task: "Feedback (thumbs up/down) endpoints replacing rating delta"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New endpoints: POST /api/admin/sellers/{sid}/feedback, DELETE /api/admin/feedback/{fid}, GET /api/feedback, GET /api/feedback/stats, GET /api/admin/sellers/{sid}/feedback, GET /api/admin/sellers/{sid}/feedback-stats. RBAC enforced."
  - task: "Admin wallet adjust (admin_intervention)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/admin/wallets/{seller_id}/adjust accepts {amount, note}. Adjusts available_balance and writes wallet_transactions with type=admin_intervention."
  - task: "Withdrawal admin GET endpoint"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/wallet/withdrawals/{wid} returns full record including payout_details for admin."

frontend:
  - task: "Withdraw page UI rewrite"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/Withdraw.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Three method tabs (e_wallet, bank_transfer, solana) with method-specific fields. Exchange-rate panel shows the two fixed rates."
  - task: "Withdrawals list shows ref + admin modal payout details"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/Withdrawals.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Added Ref column and modal with full payout_details + admin approve/reject."
  - task: "Forgot password simplified"
    implemented: true
    working: true
    file: "/app/frontend/src/pages/ForgotPassword.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Verified via screenshot - simplified page renders correctly with Indonesian message."
  - task: "Listings admin hard-delete button for archived"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/Listings.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "When admin views an archived listing, the trash button calls DELETE for permanent deletion."
  - task: "Sellers admin feedback modal"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/Sellers.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Removed ±0.1 rating buttons. Added 'Add feedback' modal (positive/negative + comment + customer label)."
  - task: "Seller Feedback page"
    implemented: true
    working: "NA"
    file: "/app/frontend/src/pages/Feedback.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New page matching screenshot 5258 - stats cards + filter pills + feedback rows. Sidebar nav added for sellers."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 0
  run_ui: true

test_plan:
  current_focus:
    - "Withdrawal new methods schema + ref_no"
    - "Stock decrement on checkout, cancel restores stock"
    - "Wallet transactions filtered to 3 visible types"
    - "Feedback (thumbs up/down) endpoints replacing rating delta"
    - "Withdraw page UI rewrite"
    - "Withdrawals list shows ref + admin modal payout details"
    - "Sellers admin feedback modal"
    - "Seller Feedback page"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Implemented all P0/P1 items in single batch. Backend running clean. Frontend
      smoke-tested via screenshot (ForgotPassword renders correctly). Please test:

      BACKEND:
      - POST /api/wallet/withdraw with new methods. Verify rejection of old methods
        (bitcoin/usdc/sepa/skrill/payoneer should give 422). Verify ref_no in response.
      - GET /api/wallet/withdrawals/{wid} admin-only.
      - POST /api/orders/checkout: create listing with stock=3, checkout 1x -> stock 2,
        status still active; checkout 2x -> stock 0, status=sold. Cancel one ->
        stock restored, status active.
      - GET /api/wallet/transactions: only sale_credit/withdrawal_approved/admin_intervention
        types appear (not pending_credit, withdrawal_hold, etc.).
      - POST /api/admin/sellers/{sid}/feedback (admin only) then GET /api/feedback (seller).
      - DELETE /api/listings/{id} permanent delete when status=archived (admin role).
      - POST /api/admin/wallets/{seller_id}/adjust generates admin_intervention txn.

      FRONTEND:
      - /forgot-password page (already verified).
      - /wallet/withdraw shows 3 method tabs, exchange rate cards, dynamic fields per method.
      - /withdrawals shows Ref column and the eye-icon modal with payout_details.
      - /sellers (admin) shows 'Add feedback' button + modal; no ±0.1 buttons.
      - /feedback (seller) shows stats + list, matches screenshot 5258 style.
      - /listings (admin) shows red trash icon on archived listings (hard delete).

      Test credentials: admin@sellerhub.io / Admin@12345.
