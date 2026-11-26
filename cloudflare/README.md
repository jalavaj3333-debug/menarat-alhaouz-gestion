# Menarat Al Haouz — Cloudflare migration workspace

This directory is a **staging area** on the `cloudflare-migration` branch.
The live frontend and Firebase configuration have not been changed.

## Current application findings

- Firebase Authentication currently signs in the admin and employees.
- The Firestore source is the single document `menarat/state`.
- That document contains arrays: `operations`, `employes`, `zones`, `produits`, `fournisseurs`, and transient `panier`.
- Each operation is a line item. Related lines share `factureId`; legacy operations may only have their own `id`.
- Employee restrictions are mostly enforced in browser code today. They must be enforced again by the Worker on every write.
- The old app's `saveState()` writes the entire shared object. Do not point it at a new backend until API authorization and concurrency-safe write operations exist.

## Target architecture

- Cloudflare Pages: static frontend.
- Cloudflare Worker: authentication, sessions, validation, authorization, and API.
- Cloudflare D1: relational application data, with invoice headers and lines.
- Worker secrets/bindings: no credentials or initial passwords in source control.

## Migration safety rules

1. Keep Firebase Auth and Firestore unchanged during development.
2. Export and checksum the complete `menarat/state` document before importing.
3. Import in a staging D1 database first; preserve original operation IDs, invoice references, dates, amounts, and unknown fields (`legacy_json` / `legacy_state`).
4. Firebase Auth passwords cannot be exported as plaintext. Accounts need a secure password-reset/re-enrolment flow; never copy passwords into this repository.
5. Test admin and employee permissions against the Worker, not just by hiding buttons in the UI.
6. Test totals, stock calculations, credit settlement, imports/exports, and concurrent sales against a copy of the data.
7. Only after user approval and successful verification should the frontend be switched. Keep Firebase as a rollback backup until then.
8. Do not weaken or delete Firebase security/data as part of this staging work.

## D1 schema

Apply `schema.sql` only to a newly created D1 database. It is a target schema, not a data import. No production database has been created or modified by this commit.

## Next implementation stages

- Worker API with secure login/logout/session cookies and server-side role checks.
- One-time admin bootstrap without a hard-coded password.
- Read endpoints and atomic sale/stock/invoice write endpoint.
- Admin-only product, supplier, zone, employee, and credit-management endpoints.
- A validated importer for an exported legacy JSON backup.
- Frontend API adapter and staged browser tests.
