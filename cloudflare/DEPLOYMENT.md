# Cloudflare staging deployment — Menarat Al Haouz

This guide is for a **new, independent staging edition**. It must not connect to Firebase and must not change the old application, Firebase data/accounts/rules, or its existing hosting.

## Before starting
- Create a separate Cloudflare Pages project for the files in `cloudflare-app/`.
- Create a brand-new D1 database named `menarat-staging`. It must be empty and must not be an existing database.
- Keep the current GitHub Pages / Cloudflare Pages configuration for the old app unchanged.

## Create staging resources
1. In Cloudflare, create the new D1 database `menarat-staging`.
2. Open that new database and execute the complete `cloudflare/schema.sql`.
3. Create a staging Worker using `cloudflare/worker/index.js`.
4. Bind the new D1 database to the Worker with binding name `DB`.
5. Configure `APP_ORIGIN` to the exact origin of the separate new Pages site (scheme + host only, no trailing slash).
6. Add `BOOTSTRAP_SECRET` as a Worker secret. Never commit or send this secret in chat.
7. Route the Worker to the same new Pages hostname under `/api/*`. The frontend uses same-origin API paths and secure session cookies.
8. Deploy the frontend folder `cloudflare-app/` to that separate Pages project.
9. Test `GET /api/health` on the staging hostname.

## Create the first administrator
Send a same-origin request to `POST /api/setup-admin` with JSON:
`{ "secret": "<BOOTSTRAP_SECRET>", "email": "admin@example.com", "displayName": "ADMIN", "password": "<unique password of at least 12 characters>" }`

This endpoint succeeds only while the D1 users table is empty. After creating the first administrator, remove or rotate the `BOOTSTRAP_SECRET` Worker secret. Do not put the secret in frontend source code. Create employee accounts later from the admin interface.

## API currently implemented
- `GET /api/health`
- `POST /api/setup-admin` (one-time)
- `POST /api/login`, `POST /api/logout`
- `GET /api/me`, `GET /api/state`
- `POST /api/sales` (server-priced sales, admin-only purchases, stock-checked invoice batch)
- `POST /api/admin/products`
- `PUT /api/admin/products/<id>` (updates product name, unit, sale price, and supplier without changing stock)
- `POST /api/admin/employees` (creates a new employee login)
- `POST /api/admin/zones`, `POST /api/admin/suppliers`
- `DELETE /api/admin/{products|employees|zones|suppliers}/<id>` (soft delete / deactivate)

## Not yet production-ready
- Password change/reset, invoice details/grouping, reports, returns, credit settlement, and payment tracking.
- The Worker now limits repeated failed logins per hashed IP-and-email key (8 failures in a 15-minute window). Add Cloudflare WAF/rate-limiting rules as another layer before production.
- Turnstile, audit log, automated tests, and independent security review.
- Full browser tests for admin and employee roles, stock edge cases, session expiry, and mobile layouts.

## Data separation — mandatory
The Cloudflare D1 database starts empty. There is no Firebase export, import, copy, synchronization, or account transfer in this project. Do not reuse Firebase credentials or databases. Keep the old Firebase application untouched and independent.
