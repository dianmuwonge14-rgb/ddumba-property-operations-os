-- Indexes for fast high-volume tenant payment entry.

create index if not exists idx_rooms_company_office_room_number_lower
    on public.rooms(company_id, office_id, lower(room_number));

create index if not exists idx_rooms_company_room_number_lower
    on public.rooms(company_id, lower(room_number));

create index if not exists idx_tenants_company_room_status
    on public.tenants(company_id, room_id, status);

create index if not exists idx_leases_company_room_status
    on public.leases(company_id, room_id, status);

create index if not exists idx_leases_company_tenant_status
    on public.leases(company_id, tenant_id, status);

create index if not exists idx_collections_company_tenant_payment_date
    on public.collections(company_id, tenant_id, payment_date desc, created_at desc);

create index if not exists idx_collections_company_payment_date_office
    on public.collections(company_id, payment_date, office_id, created_at);

create index if not exists idx_tenant_rent_allocations_tenant_payment_month
    on public.tenant_rent_allocations(company_id, tenant_id, payment_id, allocation_month);

create index if not exists idx_tenant_rent_allocations_room_month
    on public.tenant_rent_allocations(company_id, room_id, allocation_month);
