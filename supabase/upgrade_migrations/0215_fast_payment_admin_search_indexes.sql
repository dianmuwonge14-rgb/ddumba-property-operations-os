-- Tighten the indexed expressions used by search_payment_tenants_fast.
-- Additive only: no tenant, payment, balance, billing, or receipt data is changed.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_payments_entry_rooms_trim_room_trgm
    on public.rooms using gin (lower(trim(room_number)) gin_trgm_ops);

create index if not exists idx_payments_entry_rooms_company_status_office_room
    on public.rooms(company_id, status, office_id, room_number);

create index if not exists idx_payments_entry_tenants_trim_name_trgm
    on public.tenants using gin (lower(trim(full_name)) gin_trgm_ops)
    where status = 'active';

create index if not exists idx_payments_entry_tenants_company_status_room_office
    on public.tenants(company_id, status, room_id, office_id);

create index if not exists idx_payments_entry_tenants_phone_digits_company
    on public.tenants(company_id, status, (regexp_replace(coalesce(phone, ''), '\D', '', 'g')))
    where status = 'active';
