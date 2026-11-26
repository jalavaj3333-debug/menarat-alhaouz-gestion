# Menarat Al Haouz — Cloudflare edition

This folder is a separate frontend for the new Cloudflare edition. It does not load Firebase SDKs, connect to Firebase, or read, import, copy, or modify Firebase data.

## Architecture
- Cloudflare Pages serves this frontend.
- Cloudflare Worker handles authentication, authorization, validation, and API requests.
- A completely new Cloudflare D1 database stores this edition's data.
- The frontend calls same-origin endpoints under `/api`; route the Worker on the same hostname under `/api/*` so secure session cookies work correctly.

## Implemented in this UI
- Admin and employee login through the Cloudflare Worker.
- Role-aware navigation and server-enforced permissions.
- Dashboard counts, product listing/search, and operation history.
- Admin creation/deactivation of products, employee accounts, zones, and suppliers.
- Sale and purchase form with server-side price and stock validation.
- Local-date default for new operations.

## Not ready for production yet
- The Worker, Pages routing, new D1 database, and first admin account have not been configured/deployed.
- Product editing and password change/reset are not implemented.
- Invoice grouping/detail screens, reports, returns, credit settlement, and payment tracking need implementation.
- Login rate limiting / Turnstile, audit logging, automated tests, and a security review are still required.
- Browser end-to-end tests must pass on a staging URL before release.

## Data separation
The new D1 database is intended to start empty. Do not connect this frontend to Firebase or reuse an existing database. The original Firebase application remains untouched and independent.
