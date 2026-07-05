-- Keep the Admin Notifications approval queue fast and scoped.
-- Safe additive indexes only; no business data is changed.

create index if not exists idx_notifications_company_recipient_created
    on public.notifications(company_id, recipient_type, created_at desc);

create index if not exists idx_notifications_company_office_recipient_unread
    on public.notifications(company_id, office_id, recipient_type, is_read, created_at desc);

create index if not exists idx_room_rent_change_requests_company_status_created
    on public.room_rent_change_requests(company_id, status, created_at desc);

create index if not exists idx_room_rent_change_requests_company_office_status_created
    on public.room_rent_change_requests(company_id, office_id, status, created_at desc);

create index if not exists idx_payment_correction_requests_company_status_created
    on public.payment_correction_requests(company_id, status, created_at desc);

create index if not exists idx_payment_correction_requests_company_office_status_created
    on public.payment_correction_requests(company_id, office_id, status, created_at desc);

create index if not exists idx_landlord_payment_expense_requests_company_status_created
    on public.landlord_payment_expense_requests(company_id, status, created_at desc);

create index if not exists idx_landlord_payment_expense_requests_company_office_status_created
    on public.landlord_payment_expense_requests(company_id, office_id, status, created_at desc);
