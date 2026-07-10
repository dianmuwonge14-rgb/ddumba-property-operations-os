-- Payment receipt generation and delivery logs.
-- Additive only: stores receipt metadata linked to saved payment transactions.

create table if not exists public.payment_receipts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    payment_type text not null default 'tenant_collection'
        check (payment_type in ('tenant_collection','landlord_payment')),
    payment_id uuid not null,
    receipt_number text not null,
    status text not null default 'issued'
        check (status in ('issued','corrected','replaced','cancelled','reissued')),
    receipt_snapshot jsonb not null default '{}'::jsonb,
    verification_code text not null,
    corrected_from_receipt_id uuid references public.payment_receipts(id) on delete set null,
    file_url text,
    issued_by uuid references public.users(id) on delete set null,
    issued_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, receipt_number),
    unique(company_id, payment_type, payment_id)
);

create table if not exists public.payment_receipt_delivery_logs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    receipt_id uuid not null references public.payment_receipts(id) on delete cascade,
    payment_type text not null default 'tenant_collection',
    payment_id uuid not null,
    channel text not null check (channel in ('email','whatsapp','sms','print','download_pdf')),
    recipient_email text,
    recipient_phone text,
    delivery_status text not null default 'pending'
        check (delivery_status in ('pending','sent','delivered','failed','skipped')),
    provider text,
    provider_message_id text,
    error_message text,
    sent_by uuid references public.users(id) on delete set null,
    sent_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_payment_receipts_company_payment
    on public.payment_receipts(company_id, payment_type, payment_id);

create index if not exists idx_payment_receipts_company_office_created
    on public.payment_receipts(company_id, office_id, created_at desc);

create index if not exists idx_payment_receipts_snapshot_search
    on public.payment_receipts using gin (receipt_snapshot jsonb_path_ops);

create index if not exists idx_payment_receipt_delivery_logs_receipt
    on public.payment_receipt_delivery_logs(receipt_id, created_at desc);

alter table public.payment_receipts enable row level security;
alter table public.payment_receipt_delivery_logs enable row level security;

drop policy if exists payment_receipts_select on public.payment_receipts;
create policy payment_receipts_select
on public.payment_receipts
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
    or issued_by = auth.uid()
);

drop policy if exists payment_receipts_write on public.payment_receipts;
create policy payment_receipts_write
on public.payment_receipts
for all
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
    or issued_by = auth.uid()
)
with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
    or issued_by = auth.uid()
);

drop policy if exists payment_receipt_delivery_logs_select on public.payment_receipt_delivery_logs;
create policy payment_receipt_delivery_logs_select
on public.payment_receipt_delivery_logs
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or exists (
        select 1
        from public.payment_receipts receipt
        where receipt.id = payment_receipt_delivery_logs.receipt_id
          and (
            receipt.issued_by = auth.uid()
            or (receipt.office_id is not null and public.ddumba_v1_can_access_office(receipt.office_id))
          )
    )
);

drop policy if exists payment_receipt_delivery_logs_write on public.payment_receipt_delivery_logs;
create policy payment_receipt_delivery_logs_write
on public.payment_receipt_delivery_logs
for all
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or sent_by = auth.uid()
)
with check (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or sent_by = auth.uid()
);
