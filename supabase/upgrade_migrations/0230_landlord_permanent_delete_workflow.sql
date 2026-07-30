create or replace function public.ddumba_v1_landlord_delete_preview(
  p_company_id uuid,
  p_landlord_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_landlord public.landlords%rowtype;
  v_property_ids uuid[] := array[]::uuid[];
  v_room_ids uuid[] := array[]::uuid[];
  v_office_ids uuid[] := array[]::uuid[];
  v_total_rooms integer := 0;
  v_occupied_rooms integer := 0;
  v_vacant_rooms integer := 0;
  v_rent_roll numeric := 0;
  v_active_tenants integer := 0;
  v_active_leases integer := 0;
  v_pending_landlord_payments integer := 0;
  v_pending_approvals integer := 0;
  v_pending_treasury integer := 0;
  v_unresolved_advances integer := 0;
  v_unresolved_security integer := 0;
  v_unpaid_payables numeric := 0;
  v_payment_history integer := 0;
  v_settlement_history integer := 0;
  v_room_history integer := 0;
  v_blockers jsonb := '[]'::jsonb;
begin
  select *
    into v_landlord
  from public.landlords
  where id = p_landlord_id
    and company_id = p_company_id;

  if v_landlord.id is null then
    raise exception 'Landlord not found.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct id), array[]::uuid[])
    into v_property_ids
  from public.properties
  where company_id = p_company_id
    and landlord_id = p_landlord_id;

  select coalesce(array_agg(distinct property_id), array[]::uuid[])
    into v_property_ids
  from (
    select unnest(v_property_ids) as property_id
    union
    select property_id
    from public.property_landlords
    where company_id = p_company_id
      and landlord_id = p_landlord_id
  ) ids
  where property_id is not null;

  select coalesce(array_agg(distinct id), array[]::uuid[])
    into v_room_ids
  from public.rooms
  where company_id = p_company_id
    and (
      landlord_id = p_landlord_id
      or (property_id is not null and property_id = any(v_property_ids))
    );

  select
    count(*)::integer,
    count(*) filter (where lower(coalesce(status, '')) in ('occupied','active'))::integer,
    count(*) filter (where lower(coalesce(status, '')) in ('vacant','empty','available'))::integer,
    coalesce(sum(coalesce(monthly_rent, 0)), 0),
    coalesce(array_agg(distinct office_id) filter (where office_id is not null), array[]::uuid[])
    into v_total_rooms, v_occupied_rooms, v_vacant_rooms, v_rent_roll, v_office_ids
  from public.rooms
  where id = any(v_room_ids);

  select count(*)::integer
    into v_active_tenants
  from public.tenants
  where company_id = p_company_id
    and room_id = any(v_room_ids)
    and lower(coalesce(status, 'active')) not in ('inactive','vacated','deleted','removed','archived');

  select count(*)::integer
    into v_active_leases
  from public.leases
  where company_id = p_company_id
    and room_id = any(v_room_ids)
    and lower(coalesce(status, 'active')) not in ('inactive','ended','terminated','vacated','deleted','removed','archived');

  select count(*)::integer
    into v_room_history
  from public.leases
  where company_id = p_company_id
    and room_id = any(v_room_ids);

  if to_regclass('public.landlord_payment_expense_requests') is not null then
    execute 'select count(*)::integer from public.landlord_payment_expense_requests where company_id = $1 and landlord_id = $2 and lower(coalesce(status, ''pending'')) = ''pending'''
      into v_pending_landlord_payments
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.landlord_expense_edit_requests') is not null then
    execute 'select count(*)::integer from public.landlord_expense_edit_requests where company_id = $1 and landlord_id = $2 and lower(coalesce(status, ''pending'')) = ''pending'''
      into v_pending_approvals
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.landlord_payment_details') is not null then
    execute 'select $1 + count(*)::integer from public.landlord_payment_details where company_id = $2 and landlord_id = $3 and lower(coalesce(status, ''pending'')) = ''pending'''
      into v_pending_approvals
      using v_pending_approvals, p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.treasury_cash_requests') is not null and coalesce(array_length(v_office_ids, 1), 0) > 0 then
    execute 'select count(*)::integer from public.treasury_cash_requests where company_id = $1 and office_id = any($2) and lower(coalesce(status, ''pending'')) = ''pending'''
      into v_pending_treasury
      using p_company_id, v_office_ids;
  end if;

  if to_regclass('public.landlord_advances') is not null then
    execute 'select count(*)::integer from public.landlord_advances where company_id = $1 and landlord_id = $2 and lower(coalesce(status, ''pending'')) not in (''fully_deducted'',''cleared'',''cancelled'',''rejected'',''voided'') and greatest(0, coalesce(remaining_balance, advance_amount, 0) - coalesce(deducted_amount, 0)) > 0'
      into v_unresolved_advances
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.tenant_security_deposits') is not null then
    execute 'select count(*)::integer from public.tenant_security_deposits where company_id = $1 and (landlord_id = $2 or room_id = any($3)) and lower(coalesce(status, ''held'')) not in (''refunded'',''retained'',''cancelled'',''voided'',''deleted'',''closed'') and greatest(0, coalesce(amount,0) - coalesce(amount_refunded,0) - coalesce(amount_retained,0) - coalesce(amount_applied_to_charges,0)) > 0'
      into v_unresolved_security
      using p_company_id, p_landlord_id, v_room_ids;
  end if;

  if to_regclass('public.landlord_monthly_payables') is not null then
    execute 'select coalesce(sum(greatest(0, coalesce(unpaid_balance,0))), 0) from public.landlord_monthly_payables where company_id = $1 and landlord_id = $2 and lower(coalesce(status, ''unpaid'')) not in (''paid'',''cleared'',''cancelled'',''voided'',''deleted'')'
      into v_unpaid_payables
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.landlord_payments') is not null then
    execute 'select count(*)::integer from public.landlord_payments where company_id = $1 and landlord_id = $2'
      into v_payment_history
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.landlord_settlements') is not null then
    execute 'select count(*)::integer from public.landlord_settlements where company_id = $1 and landlord_id = $2'
      into v_settlement_history
      using p_company_id, p_landlord_id;
  end if;

  if v_active_tenants > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','active_tenants','count',v_active_tenants,'message','Active tenants are still attached to rooms in this landlord portfolio.'));
  end if;
  if v_active_leases > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','active_leases','count',v_active_leases,'message','Active leases are still attached to rooms in this landlord portfolio.'));
  end if;
  if v_pending_landlord_payments > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','pending_landlord_payments','count',v_pending_landlord_payments,'message','Pending landlord payment requests must be resolved first.'));
  end if;
  if v_pending_approvals > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','pending_approvals','count',v_pending_approvals,'message','Pending landlord approval records must be resolved first.'));
  end if;
  if v_pending_treasury > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','pending_treasury','count',v_pending_treasury,'message','The affected office has pending banking or cash handover requests.'));
  end if;
  if v_unresolved_advances > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','unresolved_advances','count',v_unresolved_advances,'message','Unresolved landlord advances exist.'));
  end if;
  if v_unresolved_security > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','unresolved_security_deposits','count',v_unresolved_security,'message','Unresolved security deposits are attached to this landlord or rooms.'));
  end if;
  if v_unpaid_payables > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','outstanding_financial_obligations','amount',v_unpaid_payables,'message','Outstanding landlord payable balance remains.'));
  end if;
  if v_payment_history > 0 or v_settlement_history > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','financial_history','count',v_payment_history + v_settlement_history,'message','Financial payment or settlement history exists. Preserve those records before using the operational permanent delete path.'));
  end if;
  if v_room_history > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','room_history','count',v_room_history,'message','Lease history is attached to one or more rooms. Remove or preserve historical lease evidence before permanent operational room deletion.'));
  end if;

  return jsonb_build_object(
    'landlordId', v_landlord.id,
    'landlordName', v_landlord.full_name,
    'companyId', p_company_id,
    'propertyIds', v_property_ids,
    'roomIds', v_room_ids,
    'officeIds', v_office_ids,
    'totalRooms', v_total_rooms,
    'occupiedRooms', v_occupied_rooms,
    'vacantRooms', v_vacant_rooms,
    'monthlyRentRoll', v_rent_roll,
    'activeTenants', v_active_tenants,
    'activeLeases', v_active_leases,
    'pendingLandlordPayments', v_pending_landlord_payments,
    'pendingApprovals', v_pending_approvals,
    'pendingTreasuryRequests', v_pending_treasury,
    'unresolvedAdvances', v_unresolved_advances,
    'unresolvedSecurityDeposits', v_unresolved_security,
    'outstandingBalance', v_unpaid_payables,
    'paymentHistoryRows', v_payment_history,
    'settlementHistoryRows', v_settlement_history,
    'roomHistoryRows', v_room_history,
    'blockers', v_blockers,
    'canDelete', jsonb_array_length(v_blockers) = 0
  );
end;
$$;

create or replace function public.ddumba_v1_permanently_delete_landlord_portfolio(
  p_company_id uuid,
  p_landlord_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_landlord public.landlords%rowtype;
  v_preview jsonb;
  v_room_ids uuid[] := array[]::uuid[];
  v_property_ids uuid[] := array[]::uuid[];
  v_room_count integer := 0;
  v_office_id uuid;
  v_deleted_room_numbers text[] := array[]::text[];
begin
  if p_confirmation <> 'DELETE' then
    raise exception 'Type DELETE to confirm permanent deletion.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Deletion reason is required.' using errcode = '22023';
  end if;

  select *
    into v_landlord
  from public.landlords
  where id = p_landlord_id
    and company_id = p_company_id
  for update;

  if v_landlord.id is null then
    raise exception 'Landlord not found.' using errcode = '22023';
  end if;

  v_preview := public.ddumba_v1_landlord_delete_preview(p_company_id, p_landlord_id);
  if coalesce((v_preview->>'canDelete')::boolean, false) is not true then
    raise exception 'Landlord cannot be permanently deleted until blockers are resolved: %', v_preview->'blockers' using errcode = '23514';
  end if;

  select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_room_ids
  from jsonb_array_elements_text(v_preview->'roomIds') as ids(value);

  select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_property_ids
  from jsonb_array_elements_text(v_preview->'propertyIds') as ids(value);

  select coalesce(array_agg(coalesce(room_number, id::text)), array[]::text[])
    into v_deleted_room_numbers
  from public.rooms
  where id = any(v_room_ids);

  v_room_count := coalesce(array_length(v_room_ids, 1), 0);
  select office_id into v_office_id from public.rooms where id = any(v_room_ids) and office_id is not null limit 1;

  delete from public.landlord_search_index where landlord_id = p_landlord_id;
  if to_regclass('public.landlord_portfolio_summaries') is not null then
    delete from public.landlord_portfolio_summaries where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;
  if to_regclass('public.landlord_payment_details') is not null then
    delete from public.landlord_payment_details where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;
  if to_regclass('public.landlord_balance_adjustments') is not null then
    delete from public.landlord_balance_adjustments where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;
  if to_regclass('public.landlord_expense_edit_requests') is not null then
    delete from public.landlord_expense_edit_requests where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;
  if to_regclass('public.landlord_commission_changes') is not null then
    delete from public.landlord_commission_changes where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;
  if to_regclass('public.landlord_room_assignment_changes') is not null then
    delete from public.landlord_room_assignment_changes
    where company_id = p_company_id
      and (previous_landlord_id = p_landlord_id or new_landlord_id = p_landlord_id or room_id = any(v_room_ids));
  end if;
  if to_regclass('public.property_landlords') is not null then
    delete from public.property_landlords where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;

  update public.properties
  set landlord_id = null, updated_at = now()
  where company_id = p_company_id
    and landlord_id = p_landlord_id;

  update public.collections
  set landlord_id = null, room_id = null, property_id = null
  where company_id = p_company_id
    and (landlord_id = p_landlord_id or room_id = any(v_room_ids) or property_id = any(v_property_ids));

  if to_regclass('public.tenant_security_deposits') is not null then
    execute 'update public.tenant_security_deposits set landlord_id = null, room_id = null, property_id = null where company_id = $1 and (landlord_id = $2 or room_id = any($3) or property_id = any($4))'
      using p_company_id, p_landlord_id, v_room_ids, v_property_ids;
  end if;
  if to_regclass('public.security_deposit_transactions') is not null then
    execute 'update public.security_deposit_transactions set landlord_id = null, room_id = null where company_id = $1 and (landlord_id = $2 or room_id = any($3))'
      using p_company_id, p_landlord_id, v_room_ids;
  end if;

  update public.tenants
  set room_id = null, property_id = null, updated_at = now()
  where company_id = p_company_id
    and room_id = any(v_room_ids);

  update public.leases
  set status = 'archived', updated_at = now()
  where company_id = p_company_id
    and room_id = any(v_room_ids);

  delete from public.rooms
  where company_id = p_company_id
    and id = any(v_room_ids);

  delete from public.landlords
  where id = p_landlord_id
    and company_id = p_company_id;

  insert into public.audit_logs(
    company_id, office_id, actor_id, action, entity_type, entity_id, before_data, after_data
  )
  values (
    p_company_id,
    v_office_id,
    p_admin_id,
    'landlord_permanently_deleted',
    'landlord',
    p_landlord_id,
    to_jsonb(v_landlord),
    jsonb_build_object(
      'deleted_landlord_id', p_landlord_id,
      'landlord_name', v_landlord.full_name,
      'deleted_by', p_admin_id,
      'deletion_reason', p_reason,
      'deleted_at', now(),
      'deleted_room_count', v_room_count,
      'deleted_room_numbers', v_deleted_room_numbers,
      'preview', v_preview
    )
  );

  return jsonb_build_object(
    'ok', true,
    'landlordId', p_landlord_id,
    'landlordName', v_landlord.full_name,
    'deletedRoomCount', v_room_count,
    'deletedRoomNumbers', v_deleted_room_numbers,
    'auditAction', 'landlord_permanently_deleted'
  );
end;
$$;

grant execute on function public.ddumba_v1_landlord_delete_preview(uuid, uuid) to authenticated, service_role;
grant execute on function public.ddumba_v1_permanently_delete_landlord_portfolio(uuid, uuid, uuid, text, text) to authenticated, service_role;
