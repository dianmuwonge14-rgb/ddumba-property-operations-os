-- Add admin-approved tenant payment removal requests.
-- Office users request removal; approved removals void the collection without hard-deleting history.

alter table public.payment_correction_requests
    drop constraint if exists payment_correction_requests_correction_type_check;

alter table public.payment_correction_requests
    add constraint payment_correction_requests_correction_type_check
    check (correction_type in ('date_change', 'amount_change', 'room_change', 'remove_payment'));

create index if not exists idx_payment_correction_requests_remove_status
    on public.payment_correction_requests(company_id, correction_type, status, created_at desc)
    where correction_type = 'remove_payment';
