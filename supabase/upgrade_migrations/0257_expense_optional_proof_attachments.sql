-- Optional supporting proof for unauthorised expense approval requests.
-- Files are stored privately and accessed through authenticated signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'expense-proofs',
  'expense-proofs',
  false,
  10485760,
  array['image/jpeg','image/jpg','image/png','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/jpg','image/png','image/heic','image/heif','application/pdf'];

alter table public.expenses
  add column if not exists supporting_document text,
  add column if not exists supporting_document_original_name text,
  add column if not exists supporting_document_mime_type text,
  add column if not exists supporting_document_file_size bigint,
  add column if not exists supporting_document_uploaded_by uuid references public.users(id) on delete set null,
  add column if not exists supporting_document_uploaded_by_employee_id uuid references public.employees(id) on delete set null,
  add column if not exists supporting_document_uploaded_at timestamptz,
  add column if not exists supporting_document_checksum text;

create index if not exists idx_expenses_supporting_document_present
  on public.expenses(company_id, office_id, created_at desc)
  where supporting_document is not null;

drop policy if exists expense_proofs_service on storage.objects;
create policy expense_proofs_service
on storage.objects
for all
using (
  bucket_id = 'expense-proofs'
  and public.ddumba_v1_is_service_role()
)
with check (
  bucket_id = 'expense-proofs'
  and public.ddumba_v1_is_service_role()
);
