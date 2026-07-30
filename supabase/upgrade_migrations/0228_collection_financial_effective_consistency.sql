-- Phase 228: Canonical collection financial-effectiveness flags for reports.

alter table if exists public.collections
    add column if not exists financial_effective boolean not null default true,
    add column if not exists reversed_at timestamptz,
    add column if not exists reversed_by uuid,
    add column if not exists reversal_reason text,
    add column if not exists superseded_at timestamptz,
    add column if not exists superseded_by_payment_id uuid,
    add column if not exists corrected_by_payment_id uuid,
    add column if not exists correction_of_payment_id uuid,
    add column if not exists voided_at timestamptz,
    add column if not exists deleted_at timestamptz;

update public.collections
set financial_effective = false
where lower(coalesce(status, 'posted')) in (
    'archived',
    'cancelled',
    'canceled',
    'corrected',
    'deleted',
    'duplicate',
    'pending',
    'rejected',
    'removed',
    'removed_by_admin_approval',
    'reversed',
    'superseded',
    'void',
    'voided'
)
and financial_effective is distinct from false;

create index if not exists idx_collections_company_office_date_effective
    on public.collections(company_id, office_id, payment_date, financial_effective);

create index if not exists idx_collections_payment_date_effective
    on public.collections(payment_date, financial_effective);

create index if not exists idx_collections_correction_links
    on public.collections(company_id, correction_of_payment_id, superseded_by_payment_id, corrected_by_payment_id);

create or replace function public.get_valid_collections_total(
    p_company_id uuid,
    p_office_id uuid default null,
    p_start_date date default null,
    p_end_date date default null
)
returns table(collection_count bigint, total_amount numeric)
language sql
stable
security definer
set search_path = public
as $$
    select
        count(*)::bigint as collection_count,
        coalesce(sum(coalesce(c.amount_paid, c.amount, 0)), 0)::numeric as total_amount
    from public.collections c
    where c.company_id = p_company_id
      and (p_office_id is null or c.office_id = p_office_id)
      and (p_start_date is null or c.payment_date >= p_start_date)
      and (p_end_date is null or c.payment_date <= p_end_date)
      and coalesce(c.financial_effective, true) is true
      and lower(coalesce(c.status, 'posted')) not in (
          'archived',
          'cancelled',
          'canceled',
          'corrected',
          'deleted',
          'duplicate',
          'pending',
          'rejected',
          'removed',
          'removed_by_admin_approval',
          'reversed',
          'superseded',
          'void',
          'voided'
      )
      and c.reversed_at is null
      and c.voided_at is null
      and c.deleted_at is null
      and c.superseded_at is null
      and c.superseded_by_payment_id is null
      and c.corrected_by_payment_id is null
      and not exists (
          select 1
          from public.collections replacement
          where replacement.company_id = c.company_id
            and replacement.correction_of_payment_id = c.id
            and coalesce(replacement.financial_effective, true) is true
            and lower(coalesce(replacement.status, 'posted')) not in (
                'archived',
                'cancelled',
                'canceled',
                'corrected',
                'deleted',
                'duplicate',
                'pending',
                'rejected',
                'removed',
                'removed_by_admin_approval',
                'reversed',
                'superseded',
                'void',
                'voided'
            )
      );
$$;

grant execute on function public.get_valid_collections_total(uuid, uuid, date, date) to authenticated;
grant execute on function public.get_valid_collections_total(uuid, uuid, date, date) to service_role;
