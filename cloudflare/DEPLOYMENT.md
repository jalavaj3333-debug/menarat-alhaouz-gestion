# Cloudflare staging deployment — Menarat Al Haouz

This is a **staging-only** backend. It does not connect to Firebase and does not change the existing app or Firebase records.

## Files
- `schema.sql`: D1 schema. Apply only to a newly created staging D1 database.
- `worker/index.js`: Worker API foundation (initial admin bootstrap, login/logout, session lookup, state read, admin create/deactivate for products/employees/zones/suppliers).
- `../wrangler.toml`: deployment template. Replace placeholders only after creating the staging resources.

## Create staging resources
1. In Cloudflare, create a **new** D1 database named `menarat-staging`. Do not select or reuse any existing production database.
2. Open the D1 console for that new database and execute the complete `cloudflare/schema.sql`.
3. Create a Worker from this repository's `cloudflare/worker/index.js`, or deploy with Wrangler after configuring `wrangler.toml`.
4. Bind the D1 database to the Worker using binding name `DB`.
5. Set Worker variable `APP_ORIGIN` to the exact Pages origin (scheme + host only, no trailing slash), for example `https://your-project.pages.dev`.
6. Add Worker secret `BOOTSTRAP_SECRET` using Cloudflare's secret settings. Never commit this value to GitHub or send it in chat.
7. Deploy to a staging Worker URL and test `GET /api/health`.

## Create the first administrator
Send a same-origin request from the future staging frontend to `POST /api/setup-admin` with JSON:
`{ "secret": "<BOOTSTRAP_SECRET>", "email": "admin@example.com", "displayName": "ADMIN", "password": "<unique password of at least 12 characters>" }`

This endpoint succeeds only while the users table is empty. After the first admin is created, remove or rotate the `BOOTSTRAP_SECRET` Worker secret. Do not put the secret in frontend source code.

## API currently implemented
- `GET /api/health`
- `POST /api/setup-admin` (one-time)
- `POST /api/login`
- `POST /api/logout`
- `GET /api/me`
- `GET /api/state` (authenticated read)
- `POST /api/sales` (server-priced sales, admin-only purchases, stock-checked invoice batch)
- `POST /api/admin/products`
- `POST /api/admin/employees`
- `POST /api/admin/zones`
- `POST /api/admin/suppliers`
- `DELETE /api/admin/{products|employees|zones|suppliers}/<id>` (soft delete)

## Important limitations before production
This is the first backend foundation, **not yet a complete replacement application**:
- Existing frontend still uses Firebase Auth/Firestore. Do not switch it over yet.
- Invoice editing, employee login-account provisioning, full update flows, password change/reset, audit log, and legacy Firebase import are not implemented yet. The initial `POST /api/sales` endpoint now records new invoices and updates stock in a D1 batch; it still needs staging tests and integration with the frontend.
- Add rate limiting / Cloudflare Turnstile protection to login and setup before public production use.
- Validate the full workflow on a staging URL with test data before any cutover.
- Do not import real customer/business data until the importer has been implemented and verified.
- Keep Firebase unchanged as the fallback until migration is complete and explicitly approved.
