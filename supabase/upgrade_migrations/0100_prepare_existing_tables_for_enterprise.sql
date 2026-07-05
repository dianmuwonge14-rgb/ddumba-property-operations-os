-- Non-destructive compatibility preparation for the existing Ddumba-attendance project.
-- Rules: no DROP TABLE, no DROP COLUMN, no DELETE, no TRUNCATE.
-- This migration preserves existing records and adds enterprise compatibility columns only.

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  tax_id text,
  email text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.companies (name, legal_name)
select 'Ddumba Property Management', 'Ddumba Property Management'
where not exists (
  select 1 from public.companies where name = 'Ddumba Property Management'
);

alter table public.offices add column if not exists company_id uuid references public.companies(id);
alter table public.offices add column if not exists name text;
alter table public.offices add column if not exists code text;
alter table public.offices add column if not exists address text;
alter table public.offices add column if not exists city text;
alter table public.offices add column if not exists region text;
alter table public.offices add column if not exists latitude numeric(10,7);
alter table public.offices add column if not exists longitude numeric(10,7);
alter table public.offices add column if not exists updated_at timestamptz default now();

alter table public.landlords add column if not exists company_id uuid references public.companies(id);
alter table public.landlords add column if not exists email text;
alter table public.landlords add column if not exists status text default 'active';
alter table public.landlords add column if not exists updated_at timestamptz default now();

alter table public.properties add column if not exists company_id uuid references public.companies(id);
alter table public.properties add column if not exists name text;
alter table public.properties add column if not exists code text;
alter table public.properties add column if not exists property_type text default 'commercial';
alter table public.properties add column if not exists address text;
alter table public.properties add column if not exists city text;
alter table public.properties add column if not exists region text;
alter table public.properties add column if not exists latitude numeric(10,7);
alter table public.properties add column if not exists longitude numeric(10,7);
alter table public.properties add column if not exists status text default 'active';
alter table public.properties add column if not exists updated_at timestamptz default now();

alter table public.rooms add column if not exists company_id uuid references public.companies(id);
alter table public.rooms add column if not exists office_id uuid references public.offices(id);
alter table public.rooms add column if not exists floor text;
alter table public.rooms add column if not exists size_sq_m numeric(10,2);
alter table public.rooms add column if not exists updated_at timestamptz default now();

alter table public.tenants add column if not exists company_id uuid references public.companies(id);
alter table public.tenants add column if not exists tenant_type text default 'individual';
alter table public.tenants add column if not exists status text default 'active';
alter table public.tenants add column if not exists updated_at timestamptz default now();

alter table public.employees add column if not exists company_id uuid references public.companies(id);
alter table public.employees add column if not exists user_id uuid references auth.users(id);
alter table public.employees add column if not exists employee_code text;
alter table public.employees add column if not exists job_title text;
alter table public.employees add column if not exists department text;
alter table public.employees add column if not exists employment_type text default 'full_time';
alter table public.employees add column if not exists hire_date date;
alter table public.employees add column if not exists termination_date date;
alter table public.employees add column if not exists email text;
alter table public.employees add column if not exists updated_at timestamptz default now();

alter table public.collections add column if not exists company_id uuid references public.companies(id);
alter table public.collections add column if not exists lease_id uuid;
alter table public.collections add column if not exists type text default 'legacy_collection';
alter table public.collections add column if not exists reference_number text;
alter table public.collections add column if not exists amount numeric(14,2);
alter table public.collections add column if not exists due_date date;
alter table public.collections add column if not exists paid_at timestamptz;
alter table public.collections add column if not exists status text default 'posted';
alter table public.collections add column if not exists recorded_by uuid;
alter table public.collections add column if not exists notes text;
alter table public.collections add column if not exists updated_at timestamptz default now();

alter table public.promises add column if not exists company_id uuid references public.companies(id);
alter table public.promises add column if not exists lease_id uuid;
alter table public.promises add column if not exists promised_amount numeric(14,2);
alter table public.promises add column if not exists promised_date date;
alter table public.promises add column if not exists fulfilled_at timestamptz;
alter table public.promises add column if not exists created_by uuid;
alter table public.promises add column if not exists notes text;
alter table public.promises add column if not exists updated_at timestamptz default now();

alter table public.expenses add column if not exists company_id uuid references public.companies(id);
alter table public.expenses add column if not exists property_id uuid references public.properties(id);
alter table public.expenses add column if not exists category_id uuid;
alter table public.expenses add column if not exists expense_date date;
alter table public.expenses add column if not exists vendor text;
alter table public.expenses add column if not exists description text;
alter table public.expenses add column if not exists submitted_by uuid;
alter table public.expenses add column if not exists approved_at timestamptz;
alter table public.expenses add column if not exists updated_at timestamptz default now();

alter table public.attendance add column if not exists company_id uuid references public.companies(id);
alter table public.attendance add column if not exists user_id uuid;
alter table public.attendance add column if not exists work_date date;
alter table public.attendance add column if not exists total_minutes int default 0;
alter table public.attendance add column if not exists break_minutes int default 0;
alter table public.attendance add column if not exists updated_at timestamptz default now();

alter table public.cash_position add column if not exists company_id uuid references public.companies(id);
alter table public.cash_position add column if not exists position_date date default current_date;

alter table public.landlord_payments add column if not exists company_id uuid references public.companies(id);
alter table public.landlord_payments add column if not exists settlement_id uuid;
alter table public.landlord_payments add column if not exists payout_reference text;
alter table public.landlord_payments add column if not exists paid_at timestamptz;
alter table public.landlord_payments add column if not exists status text default 'paid';
alter table public.landlord_payments add column if not exists created_by uuid;
alter table public.landlord_payments add column if not exists updated_at timestamptz default now();

alter table public.office_scores add column if not exists company_id uuid references public.companies(id);
alter table public.office_scores add column if not exists score_date date default current_date;
alter table public.office_scores add column if not exists total_score numeric(5,2);
alter table public.office_scores add column if not exists metadata jsonb default '{}';
alter table public.office_scores add column if not exists created_at timestamptz default now();

alter table public.ai_insights add column if not exists company_id uuid references public.companies(id);
alter table public.ai_insights add column if not exists subject_type text;
alter table public.ai_insights add column if not exists subject_id uuid;
alter table public.ai_insights add column if not exists summary text;
alter table public.ai_insights add column if not exists confidence numeric(5,2);
alter table public.ai_insights add column if not exists severity text default 'info';
alter table public.ai_insights add column if not exists status text default 'open';
alter table public.ai_insights add column if not exists model_name text;
alter table public.ai_insights add column if not exists input_hash text;
alter table public.ai_insights add column if not exists metadata jsonb default '{}';
alter table public.ai_insights add column if not exists resolved_at timestamptz;

alter table public.activity_timeline add column if not exists company_id uuid references public.companies(id);
alter table public.notifications add column if not exists company_id uuid references public.companies(id);
alter table public.notifications add column if not exists recipient_type text;
alter table public.notifications add column if not exists recipient_id uuid;
alter table public.notifications add column if not exists channel text default 'in_app';
alter table public.notifications add column if not exists delivery_status text default 'pending';

do $$
declare
  ddumba_company_id uuid;
begin
  select id into ddumba_company_id
  from public.companies
  where name = 'Ddumba Property Management'
  order by created_at
  limit 1;

  update public.offices
  set company_id = coalesce(company_id, ddumba_company_id),
      name = coalesce(name, office_name),
      code = coalesce(code, office_code),
      city = coalesce(city, location),
      updated_at = coalesce(updated_at, now());

  update public.landlords
  set company_id = coalesce(company_id, ddumba_company_id),
      status = coalesce(status, 'active'),
      updated_at = coalesce(updated_at, now());

  update public.properties p
  set company_id = coalesce(p.company_id, o.company_id, ddumba_company_id),
      name = coalesce(p.name, p.property_name),
      code = coalesce(p.code, p.property_code),
      city = coalesce(p.city, p.district),
      region = coalesce(p.region, p.village),
      status = coalesce(p.status, 'active'),
      updated_at = coalesce(p.updated_at, now())
  from public.offices o
  where p.office_id = o.id;

  update public.rooms r
  set company_id = coalesce(r.company_id, p.company_id, ddumba_company_id),
      office_id = coalesce(r.office_id, p.office_id),
      status = coalesce(r.status, 'Occupied'),
      updated_at = coalesce(r.updated_at, now())
  from public.properties p
  where r.property_id = p.id;

  update public.tenants t
  set company_id = coalesce(t.company_id, p.company_id, o.company_id, ddumba_company_id),
      tenant_type = coalesce(t.tenant_type, 'individual'),
      status = coalesce(t.status, 'active'),
      updated_at = coalesce(t.updated_at, now())
  from public.properties p
  left join public.offices o on o.id = p.office_id
  where t.property_id = p.id;

  update public.employees e
  set company_id = coalesce(e.company_id, o.company_id, ddumba_company_id),
      employee_code = coalesce(e.employee_code, e.id::text),
      employment_type = coalesce(e.employment_type, 'full_time'),
      updated_at = coalesce(e.updated_at, now())
  from public.offices o
  where e.office_id = o.id;

  update public.collections c
  set company_id = coalesce(c.company_id, o.company_id, ddumba_company_id),
      reference_number = coalesce(c.reference_number, c.collection_number, c.id::text),
      amount = coalesce(c.amount, c.amount_paid, 0),
      status = coalesce(c.status, 'posted'),
      updated_at = coalesce(c.updated_at, now())
  from public.offices o
  where c.office_id = o.id;

  update public.promises p
  set company_id = coalesce(p.company_id, o.company_id, ddumba_company_id),
      promised_amount = coalesce(p.promised_amount, p.amount, 0),
      promised_date = coalesce(p.promised_date, p.promise_date),
      updated_at = coalesce(p.updated_at, now())
  from public.offices o
  where p.office_id = o.id;

  update public.expenses e
  set company_id = coalesce(e.company_id, o.company_id, ddumba_company_id),
      expense_date = coalesce(e.expense_date, e.created_at::date, current_date),
      description = coalesce(e.description, e.item),
      updated_at = coalesce(e.updated_at, now())
  from public.offices o
  where e.office_id = o.id;

  update public.attendance a
  set company_id = coalesce(a.company_id, o.company_id, ddumba_company_id),
      work_date = coalesce(a.work_date, a.clock_in::date, a.created_at::date, current_date),
      updated_at = coalesce(a.updated_at, now())
  from public.offices o
  where a.office_id = o.id;

  update public.cash_position cp
  set company_id = coalesce(cp.company_id, o.company_id, ddumba_company_id),
      position_date = coalesce(cp.position_date, current_date)
  from public.offices o
  where cp.office_id = o.id;

  update public.landlord_payments lp
  set company_id = coalesce(lp.company_id, o.company_id, ddumba_company_id),
      payout_reference = coalesce(lp.payout_reference, lp.id::text),
      status = coalesce(lp.status, 'paid'),
      paid_at = coalesce(lp.paid_at, lp.created_at),
      updated_at = coalesce(lp.updated_at, now())
  from public.offices o
  where lp.office_id = o.id;

  update public.office_scores os
  set company_id = coalesce(os.company_id, o.company_id, ddumba_company_id),
      score_date = coalesce(os.score_date, current_date),
      total_score = coalesce(os.total_score, os.overall_score, 0),
      metadata = coalesce(os.metadata, '{}')
  from public.offices o
  where os.office_id = o.id;

  update public.ai_insights ai
  set company_id = coalesce(ai.company_id, o.company_id, ddumba_company_id),
      subject_type = coalesce(ai.subject_type, 'office'),
      summary = coalesce(ai.summary, ai.description),
      severity = coalesce(ai.severity, ai.priority, 'info'),
      status = coalesce(ai.status, 'open'),
      metadata = coalesce(ai.metadata, '{}')
  from public.offices o
  where ai.office_id = o.id;

  update public.activity_timeline at
  set company_id = coalesce(at.company_id, o.company_id, ddumba_company_id)
  from public.offices o
  where at.office_id = o.id;

  update public.notifications n
  set company_id = coalesce(n.company_id, o.company_id, ddumba_company_id),
      channel = coalesce(n.channel, 'in_app'),
      delivery_status = coalesce(n.delivery_status, 'pending')
  from public.offices o
  where n.office_id = o.id;

  update public.properties set company_id = ddumba_company_id where company_id is null;
  update public.rooms set company_id = ddumba_company_id where company_id is null;
  update public.tenants set company_id = ddumba_company_id where company_id is null;
  update public.employees set company_id = ddumba_company_id where company_id is null;
  update public.collections set company_id = ddumba_company_id where company_id is null;
  update public.promises set company_id = ddumba_company_id where company_id is null;
  update public.expenses set company_id = ddumba_company_id where company_id is null;
  update public.attendance set company_id = ddumba_company_id where company_id is null;
  update public.cash_position set company_id = ddumba_company_id where company_id is null;
  update public.landlord_payments set company_id = ddumba_company_id where company_id is null;
  update public.office_scores set company_id = ddumba_company_id where company_id is null;
  update public.ai_insights set company_id = ddumba_company_id where company_id is null;
  update public.activity_timeline set company_id = ddumba_company_id where company_id is null;
  update public.notifications set company_id = ddumba_company_id where company_id is null;
end;
$$;
