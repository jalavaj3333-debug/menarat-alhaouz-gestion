# Cloudflare staging test plan — Menarat Al Haouz

Run these checks only against the separate staging Pages site and a brand-new, empty staging D1 database. Never point the tests at Firebase or the existing production application.

## 1. Provisioning and schema
- [ ] Create a new D1 database dedicated to staging.
- [ ] Apply the complete `cloudflare/schema.sql` once.
- [ ] Confirm the tables exist: `users`, `sessions`, `employees`, `zones`, `suppliers`, `products`, `invoices`, `invoice_lines`, and `login_attempts`.
- [ ] Confirm all business tables are initially empty.
- [ ] Deploy the Worker with `DB`, exact `APP_ORIGIN`, and a temporary `BOOTSTRAP_SECRET`.
- [ ] Confirm `GET /api/health` returns `ok: true`.

## 2. First administrator and sessions
- [ ] Create the first administrator through `POST /api/setup-admin`.
- [ ] Repeat setup: it must return conflict and must not create a second admin.
- [ ] Remove or rotate `BOOTSTRAP_SECRET` immediately after successful setup.
- [ ] Log in with the correct credentials and confirm `GET /api/me` returns the admin role.
- [ ] Try an incorrect password; it must not create a session.
- [ ] Confirm repeated failures are throttled, then confirm a successful login clears the failure counter.
- [ ] Log out; `GET /api/me` must no longer return an authenticated user.
- [ ] Try requests with an unexpected Origin; state-changing requests must be rejected.

## 3. Admin master data
- [ ] Create a product with a valid name, unit, sale price, and opening stock.
- [ ] Create an employee with a unique email and password of at least 12 characters.
- [ ] Create a zone and a supplier.
- [ ] Edit the product name, unit, price, and supplier; verify its stock is unchanged.
- [ ] Deactivate a product, employee, zone, and supplier; verify each is hidden from active lists.
- [ ] Confirm duplicate names/emails are handled safely and return a useful error.

## 4. Sales, purchases, and stock integrity
- [ ] As admin, record a purchase; verify stock increases by the purchased quantity.
- [ ] As admin, record a sale; verify stock decreases and invoice/lines are saved.
- [ ] Attempt a sale larger than available stock; expect a conflict and no partial invoice or stock change.
- [ ] Attempt a sale with an unknown product, invalid date, zero/negative quantity, or invalid price; each must be rejected.
- [ ] Confirm sale unit price comes from the server-side product price, not a client-supplied value.
- [ ] As employee, attempt a purchase; it must be forbidden.
- [ ] As employee, record a valid sale; verify stock and invoice are updated.
- [ ] Submit two lines for the same product; verify stock validation uses their combined quantity.
- [ ] Verify invoice reference, date, employee, zone/supplier, payment status, and line totals in history.

## 5. Role isolation
- [ ] Create two employees and record sales under both accounts.
- [ ] Log in as employee A; history must contain only A's invoices.
- [ ] Log in as employee B; history must contain only B's invoices.
- [ ] Confirm neither employee can call admin endpoints.
- [ ] Confirm the admin can see all employee operations.
- [ ] Deactivate an employee; their next authenticated request must be rejected.

## 6. Browser and operational checks
- [ ] Test desktop and mobile layouts in current Chrome/Edge.
- [ ] Test refresh while signed in, session expiry, and logout.
- [ ] Test CSV export with Arabic text in Excel.
- [ ] Check browser console and Worker logs for unexpected errors.
- [ ] Confirm no request is sent to Firebase and no Firebase credentials/configuration are present.
- [ ] Add Cloudflare WAF/rate limiting and Turnstile before production consideration.
- [ ] Complete an independent security review before using real business data.

## Test result record
Record date, staging hostname, D1 database name, tester, pass/fail, and any issue for each section. Use synthetic test data only. Do not put passwords, API tokens, or bootstrap secrets in this file or in Git.
