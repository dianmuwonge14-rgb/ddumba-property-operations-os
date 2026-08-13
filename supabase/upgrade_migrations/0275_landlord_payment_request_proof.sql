-- Phase 275: Optional proof attachment reference for landlord payment requests.

alter table public.landlord_payment_expense_requests
  add column if not exists proof_url text;

comment on column public.landlord_payment_expense_requests.proof_url is
  'Private expense-proof storage path or approved proof reference attached to a landlord payment approval request.';
