-- Store explicit before/after balance snapshots for tenant payments.
-- This prevents month allocation displays from re-inferring the starting balance.

alter table public.collections
    add column if not exists balance_before_payment numeric(14,2),
    add column if not exists balance_after_payment numeric(14,2),
    add column if not exists used_to_clear_outstanding numeric(14,2) not null default 0,
    add column if not exists allocated_to_next_month numeric(14,2) not null default 0;

create index if not exists idx_collections_balance_snapshot_tenant_date
    on public.collections(company_id, tenant_id, payment_date, status);
