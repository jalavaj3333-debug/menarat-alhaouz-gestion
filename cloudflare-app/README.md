# Menarat Al Haouz — Cloudflare edition

This folder is a separate frontend for the new Cloudflare edition. It does not import Firebase SDKs, does not connect to Firebase, and does not migrate or modify any Firebase data.

## Current connection contract
- Frontend calls same-origin endpoints under `/api`.
- The Cloudflare Worker must be routed on the same hostname under `/api/*` so the secure session cookie works reliably.
- The Worker requires a NEW D1 database and bindings documented in `../DEPLOYMENT.md`.
- The frontend is not production-ready until the Worker, Pages routing, database, admin bootstrap, and end-to-end workflows are configured and tested.

## Implemented in this UI
- Admin/employee login against the Cloudflare Worker.
- Role-aware navigation.
- Dashboard counts, product listing, operation history.
- Admin product/employee/zone/supplier creation.
- Sale/purchase form using server-side validation.

## Known backend gaps before release
- Employee account creation and linking to employee records.
- Product editing, robust deletion confirmation by stable IDs for all resource types.
- Invoice grouping/details, reports, returns/credit workflows, payment tracking.
- Rate limiting, audit log, security review, automated tests.
- The Worker must be reviewed for transactional/atomic invoice writes before production.

Do not point this frontend at Firebase. Do not deploy against or reuse the old Firebase data.
