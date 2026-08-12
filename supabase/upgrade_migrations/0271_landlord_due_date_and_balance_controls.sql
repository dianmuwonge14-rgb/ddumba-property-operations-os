alter table public.landlords
  add column if not exists payment_date date;

alter table public.landlord_balance_adjustments
  add column if not exists proof_url text;

alter table public.landlord_expense_edit_requests
  add column if not exists proof_url text;

alter table public.landlord_expense_edit_requests
  drop constraint if exists landlord_expense_edit_requests_request_type_check;

alter table public.landlord_expense_edit_requests
  add constraint landlord_expense_edit_requests_request_type_check
  check (request_type in ('landlord_outstanding_balance_edit','landlord_payment_date_edit','landlord_billing_date_edit'));

comment on column public.landlords.payment_date is
  'Landlord Payment Due Date: scheduled expected payment date. Changing this date does not change money, collections, office cash, or landlord balance.';

comment on table public.landlord_expense_edit_requests is
  'Admin-review queue for landlord outstanding balance and Landlord Payment Due Date changes. Office users request; Admin approves or rejects.';
