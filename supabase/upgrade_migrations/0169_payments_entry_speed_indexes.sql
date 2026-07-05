-- Hot-path indexes for high-volume tenant payment entry.

create index if not exists idx_payments_entry_rooms_office_room_number
    on public.rooms(company_id, office_id, room_number);

create index if not exists idx_payments_entry_rooms_office_room_number_lower
    on public.rooms(company_id, office_id, lower(room_number));

create index if not exists idx_payments_entry_tenants_room_active
    on public.tenants(company_id, room_id, status)
    where status = 'active';

create index if not exists idx_payments_entry_collections_room_date
    on public.collections(company_id, room_id, payment_date, created_at);

create index if not exists idx_payments_entry_collections_office_date
    on public.collections(company_id, office_id, payment_date, created_at);

create index if not exists idx_payments_entry_allocations_tenant_room_month
    on public.tenant_rent_allocations(company_id, tenant_id, room_id, allocation_month);

create index if not exists idx_payments_entry_corrections_payment_status
    on public.payment_correction_requests(company_id, payment_id, status);
