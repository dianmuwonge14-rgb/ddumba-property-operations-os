begin;

create table if not exists public.payment_receipt_amendments (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    receipt_id uuid references public.payment_receipts(id) on delete cascade,
    payment_id uuid references public.collections(id) on delete cascade,
    amendment_type text not null,
    previous_snapshot jsonb not null default '{}'::jsonb,
    new_snapshot jsonb not null default '{}'::jsonb,
    requested_by uuid references public.users(id) on delete set null,
    changed_by uuid references public.users(id) on delete set null,
    approved_by uuid references public.users(id) on delete set null,
    requested_at timestamptz,
    changed_at timestamptz,
    approved_at timestamptz,
    reason text,
    status text not null default 'approved',
    audit_reference text,
    replacement_receipt_id uuid references public.payment_receipts(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_payment_receipt_amendments_company_created
    on public.payment_receipt_amendments(company_id, created_at desc);

create index if not exists idx_payment_receipt_amendments_receipt
    on public.payment_receipt_amendments(receipt_id, created_at);

create index if not exists idx_payment_receipt_amendments_payment
    on public.payment_receipt_amendments(payment_id, created_at);

create unique index if not exists idx_payment_receipt_amendments_audit_reference
    on public.payment_receipt_amendments(audit_reference)
    where audit_reference is not null;

alter table public.payment_receipt_amendments enable row level security;

drop policy if exists payment_receipt_amendments_company_read on public.payment_receipt_amendments;
create policy payment_receipt_amendments_company_read
    on public.payment_receipt_amendments
    for select
    using (
        public.ddumba_v1_is_service_role()
        or public.ddumba_v1_is_company_admin()
        or exists (
            select 1
            from public.payment_receipts receipt
            where receipt.id = payment_receipt_amendments.receipt_id
              and receipt.company_id = public.ddumba_v1_current_company_id()
              and (
                public.ddumba_v1_is_field_collector()
                or receipt.issued_by = auth.uid()
                or (receipt.office_id is not null and public.ddumba_v1_can_access_office(receipt.office_id))
              )
        )
    );

drop policy if exists payment_receipt_amendments_admin_write on public.payment_receipt_amendments;
create policy payment_receipt_amendments_admin_write
    on public.payment_receipt_amendments
    for all
    using (
        public.ddumba_v1_is_service_role()
        or public.ddumba_v1_is_company_admin()
    )
    with check (
        public.ddumba_v1_is_service_role()
        or public.ddumba_v1_is_company_admin()
    );

commit;
