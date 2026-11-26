# Menarat Al Haouz — independent Cloudflare edition

This directory is a development workspace on the `cloudflare-migration` branch. The existing application, Firebase Authentication, Firestore data, and production deployment must remain unchanged.

## User-approved architecture
- Keep the existing Firebase edition exactly as it is.
- Build a separate Cloudflare Pages + Worker + D1 application.
- Create a brand-new D1 database that starts empty.
- Do not export, import, copy, synchronize, or migrate any Firebase records or accounts.
- Create new administrator and employee accounts for the Cloudflare edition.
- Test the new edition on staging before considering any separate production release.

## Target architecture
- Cloudflare Pages: static frontend in `cloudflare-app/`.
- Cloudflare Worker: authentication, sessions, validation, authorization, and API.
- Cloudflare D1: independent relational database.
- Worker secrets and bindings: no credentials or passwords committed to source control.

## Implemented foundation
- D1 schema for users, sessions, products, employees, zones, suppliers, invoices, and invoice lines.
- Worker login/logout/session lookup and one-time initial-admin setup.
- Authenticated state read with employee-specific operation filtering.
- Server-validated sales and admin-only purchases, with stock checks and invoice writes.
- Admin create/deactivate endpoints for products, employees, zones, and suppliers.
- Separate Arabic RTL frontend in `cloudflare-app/`.

## Release blockers
- Create a new staging D1 database and apply `schema.sql`.
- Configure Worker bindings/secrets and same-origin `/api/*` routing.
- Host the separate frontend on its own Pages project/site without changing the old site's Pages settings.
- Implement product editing, password change/reset, invoice details/grouping, reports, returns, credit settlement, and payment tracking.
- Add login rate limiting / Turnstile, audit logs, automated tests, and security review.
- Complete admin and employee browser tests using non-production test data.

## Safety
Never point this Worker or frontend at Firebase. Never reuse the old Firebase database. Do not change the old app, Firebase rules, Firebase accounts, or production deployment as part of this work. No Firebase data transfer is part of this project.
