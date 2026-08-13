-- Phase 274: Allow landlord advance-balance correction requests from the
-- Expenses -> Landlord Payment workspace.

alter table public.landlord_expense_edit_requests
  drop constraint if exists landlord_expense_edit_requests_request_type_check;

alter table public.landlord_expense_edit_requests
  add constraint landlord_expense_edit_requests_request_type_check
  check (
    request_type in (
      'landlord_outstanding_balance_edit',
      'landlord_payment_date_edit',
      'landlord_billing_date_edit',
      'landlord_advance_balance_edit'
    )
  );

comment on table public.landlord_expense_edit_requests is
  'Admin-review queue for landlord outstanding balance, advance balance and Landlord Payment Due Date changes. Office users request; Admin approves or rejects.';
