-- Sync C8019 stored balance projections to its reconstructed pre-system arrears ledger.
-- This does not create a payment, collection, receipt, cash movement, or rent charge.
-- It corrects stale tenant/room/receipt projections after the genuine UGX 300,000
-- payment restoration and legacy-arrears reconstruction.

do $$
declare
  v_room record;
  v_tenant record;
  v_target_outstanding numeric(14,2);
  v_before_tenant_balance numeric(14,2);
  v_before_room_balance numeric(14,2);
begin
  select *
  into v_room
  from public.rooms
  where room_number = 'C8019'
  order by updated_at desc nulls last
  limit 1
  for update;

  if not found then
    raise exception 'C8019 room not found; cannot sync legacy arrears projection.';
  end if;

  select *
  into v_tenant
  from public.tenants
  where room_id = v_room.id
    and lower(coalesce(status, 'active')) = 'active'
  order by updated_at desc nulls last
  limit 1
  for update;

  if not found then
    raise exception 'C8019 active tenant not found; cannot sync legacy arrears projection.';
  end if;

  select coalesce(sum(remaining_amount), 0)::numeric(14,2)
  into v_target_outstanding
  from public.tenant_pre_system_arrears_periods
  where tenant_id = v_tenant.id
    and room_id = v_room.id;

  if v_target_outstanding <> 510000 then
    raise exception 'C8019 safety check failed: reconstructed remaining amount is %, expected 510000.', v_target_outstanding;
  end if;

  v_before_tenant_balance := coalesce(v_tenant.balance, 0)::numeric(14,2);
  v_before_room_balance := coalesce(v_room.outstanding_balance, 0)::numeric(14,2);

  update public.tenants
  set balance = v_target_outstanding,
      updated_at = now()
  where id = v_tenant.id;

  update public.rooms
  set outstanding_balance = v_target_outstanding,
      updated_at = now()
  where id = v_room.id;

  update public.collections c
  set
    balance = v_target_outstanding,
    balance_after_payment = v_target_outstanding,
    updated_at = now()
  where c.id in (
    select source_payment_id
    from public.tenant_pre_system_arrears_periods
    where tenant_id = v_tenant.id
      and room_id = v_room.id
      and source_payment_id is not null
  )
    and coalesce(c.financial_effective, true) = true;

  update public.payment_receipts pr
  set
    receipt_snapshot = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            coalesce(pr.receipt_snapshot, '{}'::jsonb),
            '{outstandingBalance}',
            to_jsonb(v_target_outstanding),
            true
          ),
          '{remainingOutstanding}',
          to_jsonb(v_target_outstanding),
          true
        ),
        '{advanceBalance}',
        '0'::jsonb,
        true
      ),
      '{advanceAmount}',
      '0'::jsonb,
      true
    ),
    updated_at = now()
  where pr.payment_id in (
    select source_payment_id
    from public.tenant_pre_system_arrears_periods
    where tenant_id = v_tenant.id
      and room_id = v_room.id
      and source_payment_id is not null
  );

  insert into public.tenant_balance_reconciliations (
    company_id,
    office_id,
    tenant_id,
    room_id,
    source_type,
    source_id,
    requested_outstanding,
    outstanding_before,
    advance_before,
    advance_consumed,
    outstanding_after,
    advance_after,
    note,
    created_by
  )
  select
    v_room.company_id,
    v_room.office_id,
    v_tenant.id,
    v_room.id,
    'c8019_legacy_arrears_projection_sync',
    v_room.id,
    v_target_outstanding,
    greatest(v_before_tenant_balance, v_before_room_balance),
    0,
    0,
    v_target_outstanding,
    0,
    'C8019 stored balance projection synchronized to reconstructed pre-system arrears. No duplicate payment, collection, receipt, cash movement, or rent charge created.',
    null
  where not exists (
    select 1
    from public.tenant_balance_reconciliations existing
    where existing.source_type = 'c8019_legacy_arrears_projection_sync'
      and existing.source_id = v_room.id
  );

  insert into public.audit_logs (
    company_id,
    office_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    user_agent
  )
  select
    v_room.company_id,
    v_room.office_id,
    null,
    'c8019_legacy_arrears_projection_synced',
    'room',
    v_room.id,
    jsonb_build_object(
      'tenant_balance', v_before_tenant_balance,
      'room_outstanding_balance', v_before_room_balance
    ),
    jsonb_build_object(
      'tenant_balance', v_target_outstanding,
      'room_outstanding_balance', v_target_outstanding,
      'advance', 0,
      'reason', 'Stored projection synchronized to reconstructed pre-system arrears after confirmed genuine payment restoration.',
      'no_duplicate_payment_created', true
    ),
    'system-authorised-production-reconciliation'
  where not exists (
    select 1
    from public.audit_logs existing
    where existing.action = 'c8019_legacy_arrears_projection_synced'
      and existing.entity_type = 'room'
      and existing.entity_id = v_room.id
  );
end $$;
