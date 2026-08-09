# Desktop Offline-First Edition

This project now has the first desktop foundation for Ddumba Property Operations OS.

Supabase remains the authoritative production backend. The desktop edition must not post financial records through a separate business engine. Offline mutations are saved with a UUID and queued for server-side replay through the same canonical payment, security deposit, expense, and promise workflows used by the web app.

## Current Foundation

- Tauri shell scaffold in `src-tauri/`.
- Authenticated desktop device registration at `/api/desktop/devices`.
- Authenticated offline mutation queue endpoint at `/api/desktop/sync`.
- Sync Centre page at `/office/sync-centre`.
- Header sync status chip across office, collector, manager, and admin workspaces.
- Supabase migration `0262_offline_desktop_sync_foundation.sql` for devices, mutation queue, conflict review, and offline idempotency columns.

## Required Next Phase

The financial sync worker must call canonical server RPCs/actions for:

- tenant payments;
- security deposits;
- unauthorised expenses;
- promises;
- collection notes.

The worker must be idempotent by `company_id + transaction_uuid`, lock affected financial records, return existing server records when a retry repeats the same UUID, and create Admin review conflicts for unsafe reconciliation.

## Packaging Note

The existing app is a dynamic Next.js application with server auth, cookies, Supabase access, and Server Components. A fully installable offline desktop release requires either:

- a Tauri sidecar/local runtime able to serve the Next app and local SQLite bridge; or
- a dedicated Tauri React shell that reuses the shared Ddumba domain contracts and talks to the same Supabase backend.

The scaffold currently uses Tauri dev mode against `npm run dev`. Production installer work must finish the local runtime/static asset strategy before it is safe to distribute.
