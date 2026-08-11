begin;

create or replace function public.ddumba_receipt_resolved_room(p_payment public.collections)
returns table (
    room_id uuid,
    room_number text,
    office_id uuid,
    property_id uuid,
    landlord_id uuid,
    resolution_source text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_payment_date date := coalesce(p_payment.payment_date, p_payment.paid_at::date, p_payment.created_at::date);
    v_tenant public.tenants%rowtype;
    v_room public.rooms%rowtype;
    v_lease public.leases%rowtype;
    v_exit record;
    v_debt record;
begin
    if p_payment.room_id is not null then
        select *
        into v_room
        from public.rooms r
        where r.company_id = p_payment.company_id
          and r.id = p_payment.room_id
        limit 1;

        if v_room.id is not null then
            return query select v_room.id, v_room.room_number, v_room.office_id, v_room.property_id, v_room.landlord_id, 'payment.room_id'::text;
            return;
        end if;
    end if;

    if p_payment.tenant_id is not null then
        select *
        into v_tenant
        from public.tenants t
        where t.company_id = p_payment.company_id
          and t.id = p_payment.tenant_id
        limit 1;
    end if;

    if p_payment.lease_id is not null then
        select *
        into v_lease
        from public.leases l
        where l.company_id = p_payment.company_id
          and l.id = p_payment.lease_id
          and l.room_id is not null
        limit 1;
    end if;

    if v_lease.id is null and p_payment.tenant_id is not null then
        select *
        into v_lease
        from public.leases l
        where l.company_id = p_payment.company_id
          and l.tenant_id = p_payment.tenant_id
          and l.room_id is not null
          and (v_payment_date is null or l.start_date <= v_payment_date)
          and (v_payment_date is null or l.end_date is null or l.end_date >= v_payment_date)
        order by l.start_date desc nulls last, l.created_at desc
        limit 1;
    end if;

    if v_lease.id is null and p_payment.tenant_id is not null then
        select *
        into v_lease
        from public.leases l
        where l.company_id = p_payment.company_id
          and l.tenant_id = p_payment.tenant_id
          and l.room_id is not null
        order by
          case when lower(coalesce(l.status, '')) = 'active' then 0 else 1 end,
          l.start_date desc nulls last,
          l.created_at desc
        limit 1;
    end if;

    if v_lease.id is not null then
        select *
        into v_room
        from public.rooms r
        where r.company_id = p_payment.company_id
          and r.id = v_lease.room_id
        limit 1;

        if v_room.id is not null then
            return query select v_room.id, v_room.room_number, v_room.office_id, v_room.property_id, v_room.landlord_id, 'lease.room_id'::text;
            return;
        end if;
    end if;

    if v_tenant.id is not null and v_tenant.room_id is not null then
        select *
        into v_room
        from public.rooms r
        where r.company_id = p_payment.company_id
          and r.id = v_tenant.room_id
        limit 1;

        if v_room.id is not null then
            return query select v_room.id, v_room.room_number, v_room.office_id, v_room.property_id, v_room.landlord_id, 'tenant.room_id'::text;
            return;
        end if;
    end if;

    if to_regclass('public.tenant_exit_records') is not null and p_payment.tenant_id is not null then
        select ter.room_id
        into v_exit
        from public.tenant_exit_records ter
        where ter.company_id = p_payment.company_id
          and ter.tenant_id = p_payment.tenant_id
          and ter.room_id is not null
          and (v_payment_date is null or ter.created_at::date >= v_payment_date)
        order by ter.created_at asc
        limit 1;

        if v_exit.room_id is not null then
            select *
            into v_room
            from public.rooms r
            where r.company_id = p_payment.company_id
              and r.id = v_exit.room_id
            limit 1;

            if v_room.id is not null then
                return query select v_room.id, v_room.room_number, v_room.office_id, v_room.property_id, v_room.landlord_id, 'tenant_exit_records.room_id'::text;
                return;
            end if;
        end if;
    end if;

    if to_regclass('public.vacated_tenant_debts') is not null and p_payment.tenant_id is not null then
        select vtd.room_id
        into v_debt
        from public.vacated_tenant_debts vtd
        where vtd.company_id = p_payment.company_id
          and vtd.tenant_id = p_payment.tenant_id
          and vtd.room_id is not null
          and (v_payment_date is null or vtd.created_at::date >= v_payment_date)
        order by vtd.created_at asc
        limit 1;

        if v_debt.room_id is not null then
            select *
            into v_room
            from public.rooms r
            where r.company_id = p_payment.company_id
              and r.id = v_debt.room_id
            limit 1;

            if v_room.id is not null then
                return query select v_room.id, v_room.room_number, v_room.office_id, v_room.property_id, v_room.landlord_id, 'vacated_tenant_debts.room_id'::text;
                return;
            end if;
        end if;
    end if;

    return;
end;
$$;

create index if not exists idx_leases_receipt_room_resolution
    on public.leases(company_id, tenant_id, start_date desc, end_date, status)
    where room_id is not null;

create index if not exists idx_tenant_exit_records_receipt_room_resolution
    on public.tenant_exit_records(company_id, tenant_id, created_at)
    where room_id is not null;

create index if not exists idx_vacated_tenant_debts_receipt_room_resolution
    on public.vacated_tenant_debts(company_id, tenant_id, created_at)
    where room_id is not null;

with resolved as (
    select
        pr.id as receipt_id,
        pr.company_id,
        pr.office_id as previous_receipt_office_id,
        pr.receipt_snapshot as previous_snapshot,
        c.id as payment_id,
        c.office_id as previous_payment_office_id,
        room.room_id,
        room.room_number,
        room.office_id,
        room.property_id,
        room.landlord_id,
        room.resolution_source
    from public.payment_receipts pr
    join public.collections c
      on c.company_id = pr.company_id
     and c.id = pr.payment_id
    cross join lateral public.ddumba_receipt_resolved_room(c) room
    where pr.payment_type = 'tenant_collection'
      and (
        nullif(trim(pr.receipt_snapshot->>'roomNumber'), '') is null
        or lower(trim(coalesce(pr.receipt_snapshot->>'roomNumber', ''))) in ('n/a', 'no room')
        or c.room_id is null
      )
      and room.room_id is not null
      and nullif(trim(room.room_number), '') is not null
),
updated_payments as (
    update public.collections c
    set
        room_id = resolved.room_id,
        office_id = coalesce(c.office_id, resolved.office_id),
        property_id = coalesce(c.property_id, resolved.property_id)
    from resolved
    where c.id = resolved.payment_id
      and c.company_id = resolved.company_id
      and c.room_id is null
    returning c.id
),
updated_receipts as (
    update public.payment_receipts pr
    set
        office_id = coalesce(pr.office_id, resolved.office_id),
        receipt_snapshot =
            jsonb_set(
              jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      coalesce(pr.receipt_snapshot, '{}'::jsonb),
                      '{paymentId}',
                      coalesce(to_jsonb(resolved.payment_id::text), 'null'::jsonb),
                      true
                    ),
                    '{roomId}',
                    coalesce(to_jsonb(resolved.room_id::text), 'null'::jsonb),
                    true
                  ),
                  '{roomNumber}',
                  coalesce(to_jsonb(resolved.room_number), 'null'::jsonb),
                  true
                ),
                '{officeId}',
                coalesce(to_jsonb(coalesce(resolved.office_id, pr.office_id)::text), 'null'::jsonb),
                true
              ),
              '{landlordId}',
              coalesce(to_jsonb(resolved.landlord_id::text), 'null'::jsonb),
              true
            ),
        updated_at = now()
    from resolved
    where pr.id = resolved.receipt_id
    returning
      pr.id,
      pr.company_id,
      pr.office_id,
      pr.payment_id,
      resolved.previous_snapshot,
      resolved.room_id,
      resolved.room_number,
      resolved.resolution_source
)
insert into public.audit_logs(company_id, office_id, action, entity_type, entity_id, before_data, after_data)
select
    company_id,
    office_id,
    'receipt_room_snapshot_repaired',
    'payment_receipt',
    id,
    jsonb_build_object('receipt_snapshot', previous_snapshot),
    jsonb_build_object(
      'payment_id', payment_id,
      'room_id', room_id,
      'room_number', room_number,
      'resolution_source', resolution_source,
      'reason', 'Backfilled missing tenant receipt room from authoritative room history'
    )
from updated_receipts
where not exists (
    select 1
    from public.audit_logs existing
    where existing.company_id = updated_receipts.company_id
      and existing.entity_type = 'payment_receipt'
      and existing.entity_id = updated_receipts.id
      and existing.action = 'receipt_room_snapshot_repaired'
      and existing.after_data->>'room_id' = updated_receipts.room_id::text
);

commit;
