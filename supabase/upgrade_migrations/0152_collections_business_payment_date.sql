-- Add an explicit business payment date for cashier-entered collections.
-- paid_at / created_at remain timestamps for audit and recording time.

alter table if exists public.collections
    add column if not exists payment_date date;

update public.collections
set payment_date = coalesce(
    payment_date,
    workbook_payment_date,
    (paid_at at time zone 'Africa/Kampala')::date,
    (created_at at time zone 'Africa/Kampala')::date
)
where payment_date is null;

create index if not exists idx_collections_company_office_payment_date
    on public.collections(company_id, office_id, payment_date, created_at, id);

create index if not exists idx_collections_company_payment_date
    on public.collections(company_id, payment_date, created_at, id);

create index if not exists idx_collections_room_payment_date
    on public.collections(company_id, room_id, payment_date);

create index if not exists idx_collections_tenant_payment_date
    on public.collections(company_id, tenant_id, payment_date);
