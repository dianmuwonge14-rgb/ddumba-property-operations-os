-- Allow payment-method correction requests for existing tenant payments.
-- The request preserves the original collection and reclassifies the cash/bank/mobile-money ledger effect.

alter table public.payment_correction_requests
    drop constraint if exists payment_correction_requests_correction_type_check;

alter table public.payment_correction_requests
    add constraint payment_correction_requests_correction_type_check
    check (correction_type in ('date_change', 'amount_change', 'room_change', 'remove_payment', 'payment_method_change'));

create index if not exists idx_payment_correction_requests_one_pending_payment
    on public.payment_correction_requests(company_id, payment_id, status)
    where status = 'pending';

create index if not exists idx_payment_correction_requests_method_status
    on public.payment_correction_requests(company_id, correction_type, status, created_at desc)
    where correction_type = 'payment_method_change';
