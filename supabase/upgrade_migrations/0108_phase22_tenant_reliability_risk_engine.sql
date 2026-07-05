-- Phase 22: Tenant Reliability & Risk Engine
-- Additive migration only. Preserves all existing tenant data and keeps legacy score columns compatible.

alter table public.tenants
    add column if not exists tenant_reliability_score numeric(5,2),
    add column if not exists tenant_risk_level text,
    add column if not exists tenant_score_reason text,
    add column if not exists tenant_score_updated_at timestamptz;

update public.tenants
set
    tenant_reliability_score = coalesce(tenant_reliability_score, reliability_score, 70),
    tenant_risk_level = coalesce(
        tenant_risk_level,
        case
            when coalesce(reliability_score, 70) >= 90 then 'Elite'
            when coalesce(reliability_score, 70) >= 75 then 'Low Risk'
            when coalesce(reliability_score, 70) >= 50 then 'Medium Risk'
            when coalesce(reliability_score, 70) >= 25 then 'High Risk'
            else 'Critical'
        end
    ),
    tenant_score_reason = coalesce(tenant_score_reason, 'Reliability baseline created from existing tenant score.'),
    tenant_score_updated_at = coalesce(tenant_score_updated_at, now())
where tenant_reliability_score is null
   or tenant_risk_level is null
   or tenant_score_reason is null
   or tenant_score_updated_at is null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'tenants_reliability_score_range_chk'
          and conrelid = 'public.tenants'::regclass
    ) then
        alter table public.tenants
            add constraint tenants_reliability_score_range_chk
            check (tenant_reliability_score is null or (tenant_reliability_score >= 0 and tenant_reliability_score <= 100));
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'tenants_risk_level_chk'
          and conrelid = 'public.tenants'::regclass
    ) then
        alter table public.tenants
            add constraint tenants_risk_level_chk
            check (tenant_risk_level is null or tenant_risk_level in ('Elite', 'Low Risk', 'Medium Risk', 'High Risk', 'Critical'));
    end if;
end $$;

create index if not exists idx_tenants_company_risk_level
    on public.tenants (company_id, tenant_risk_level);

create index if not exists idx_tenants_company_reliability_score
    on public.tenants (company_id, tenant_reliability_score desc);

do $$
begin
    if exists (
        select 1
        from pg_tables
        where schemaname = 'public'
          and tablename = 'tenants'
    ) and not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'tenants'
          and policyname = 'ddumba_v1_tenants_scoring_update'
    ) then
        create policy ddumba_v1_tenants_scoring_update
            on public.tenants
            for update
            using (
                public.ddumba_v1_has_permission('collections.manage')
                or public.ddumba_v1_has_permission('collections.payment.post')
            )
            with check (
                public.ddumba_v1_has_permission('collections.manage')
                or public.ddumba_v1_has_permission('collections.payment.post')
            );
    end if;
end $$;
