-- Repair permanent landlord deletion so operational portfolio records can be removed
-- while historical evidence is snapshotted or detached safely.

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
  v_lease_ids uuid[] := array[]::uuid[];
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
  v_payout_history integer := 0;
  v_settlement_history integer := 0;
  v_room_history integer := 0;
  v_vacated_debt_count integer := 0;
  v_vacated_debt_amount numeric := 0;
  v_relocation_rows integer := 0;
  v_eviction_rows integer := 0;
  v_rent_invoice_rows integer := 0;
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
begin
  select *
    into v_landlord
  from public.landlords
  where id = p_landlord_id
    and company_id = p_company_id;

  if v_landlord.id is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_DELETED',
      'landlordId', p_landlord_id,
      'companyId', p_company_id,
      'canDelete', false,
      'blockers', '[]'::jsonb,
      'warnings', '[]'::jsonb
    );
  end if;

  select coalesce(array_agg(distinct id), array[]::uuid[])
    into v_property_ids
  from public.properties
  where company_id = p_company_id
    and landlord_id = p_landlord_id;

  if to_regclass('public.property_landlords') is not null then
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
  end if;

  select coalesce(array_agg(distinct id), array[]::uuid[])
    into v_room_ids
  from public.rooms
  where company_id = p_company_id
    and (
      landlord_id = p_landlord_id
      or (property_id is not null and property_id = any(v_property_ids))
    );

  select coalesce(array_agg(distinct id), array[]::uuid[])
    into v_lease_ids
  from public.leases
  where company_id = p_company_id
    and room_id = any(v_room_ids);

  select
    count(*)::integer,
    count(*) filter (where lower(coalesce(status, '')) in ('occupied','active'))::integer,
    count(*) filter (where lower(coalesce(status, '')) in ('vacant','empty','available','archived'))::integer,
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
    and lower(coalesce(status, 'active')) not in ('inactive','vacated','deleted','removed','archived','evicted');

  select count(*)::integer
    into v_active_leases
  from public.leases
  where company_id = p_company_id
    and room_id = any(v_room_ids)
    and lower(coalesce(status, 'active')) not in ('inactive','ended','terminated','vacated','deleted','removed','archived','expired','evicted');

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

  if to_regclass('public.landlord_payouts') is not null then
    execute 'select count(*)::integer from public.landlord_payouts where company_id = $1 and landlord_id = $2'
      into v_payout_history
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.landlord_settlements') is not null then
    execute 'select count(*)::integer from public.landlord_settlements where company_id = $1 and landlord_id = $2'
      into v_settlement_history
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.vacated_tenant_debts') is not null then
    execute 'select count(*)::integer, coalesce(sum(coalesce(remaining_amount, 0)), 0) from public.vacated_tenant_debts where company_id = $1 and (landlord_id = $2 or room_id = any($3) or lease_id = any($4))'
      into v_vacated_debt_count, v_vacated_debt_amount
      using p_company_id, p_landlord_id, v_room_ids, v_lease_ids;
  end if;

  if to_regclass('public.tenant_relocation_requests') is not null then
    execute 'select count(*)::integer from public.tenant_relocation_requests where company_id = $1 and (old_room_id = any($2) or new_room_id = any($2))'
      into v_relocation_rows
      using p_company_id, v_room_ids;
  end if;

  if to_regclass('public.eviction_cases') is not null then
    execute 'select count(*)::integer from public.eviction_cases where company_id = $1 and lease_id = any($2)'
      into v_eviction_rows
      using p_company_id, v_lease_ids;
  end if;

  if to_regclass('public.rent_invoices') is not null then
    execute 'select count(*)::integer from public.rent_invoices where company_id = $1 and lease_id = any($2)'
      into v_rent_invoice_rows
      using p_company_id, v_lease_ids;
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
  if v_payout_history > 0 or v_settlement_history > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','non_detachable_financial_history','count',v_payout_history + v_settlement_history,'message','Payout or settlement records are linked through non-nullable operational relationships and must be reconciled before deletion.'));
  end if;
  if v_relocation_rows > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','tenant_relocation_requests','count',v_relocation_rows,'message','Tenant relocation requests reference one or more rooms and must be resolved first.'));
  end if;
  if v_eviction_rows > 0 then
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('type','eviction_cases','count',v_eviction_rows,'message','Eviction case history is attached to this portfolio and must be reviewed first.'));
  end if;
  if v_payment_history > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('type','payment_history_preserved','count',v_payment_history,'message','Landlord payment history will be preserved and detached from operational landlord search.'));
  end if;
  if v_room_history > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('type','lease_history_snapshotted','count',v_room_history,'message','Non-active lease history will be snapshotted in the audit log before operational rooms are deleted.'));
  end if;
  if v_rent_invoice_rows > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('type','rent_invoice_history_snapshotted','count',v_rent_invoice_rows,'message','Historical rent invoice rows will be snapshotted before non-active leases are removed.'));
  end if;
  if v_vacated_debt_count > 0 then
    v_warnings := v_warnings || jsonb_build_array(jsonb_build_object('type','vacated_debt_preserved','count',v_vacated_debt_count,'amount',v_vacated_debt_amount,'message','Vacated debt remains in the recovery ledger with display snapshots while operational landlord and room links are removed.'));
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', case when jsonb_array_length(v_blockers) = 0 then 'READY' else 'DELETE_BLOCKED' end,
    'landlordId', v_landlord.id,
    'landlordName', v_landlord.full_name,
    'companyId', p_company_id,
    'propertyIds', v_property_ids,
    'roomIds', v_room_ids,
    'leaseIds', v_lease_ids,
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
    'payoutHistoryRows', v_payout_history,
    'settlementHistoryRows', v_settlement_history,
    'roomHistoryRows', v_room_history,
    'rentInvoiceRows', v_rent_invoice_rows,
    'vacatedDebtRows', v_vacated_debt_count,
    'vacatedDebtAmount', v_vacated_debt_amount,
    'blockers', v_blockers,
    'warnings', v_warnings,
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
  v_lease_ids uuid[] := array[]::uuid[];
  v_property_ids uuid[] := array[]::uuid[];
  v_room_count integer := 0;
  v_rent_roll numeric := 0;
  v_office_id uuid;
  v_deleted_room_numbers text[] := array[]::text[];
  v_room_snapshot jsonb := '[]'::jsonb;
  v_lease_snapshot jsonb := '[]'::jsonb;
  v_payment_snapshot jsonb := '[]'::jsonb;
  v_vacated_debt_snapshot jsonb := '[]'::jsonb;
  v_rent_invoice_snapshot jsonb := '[]'::jsonb;
  v_tenant_ledger_snapshot jsonb := '[]'::jsonb;
  v_before_landlord_count integer := 0;
  v_before_room_count integer := 0;
  v_before_company_rent_roll numeric := 0;
  v_before_office_rent_roll numeric := 0;
  v_after_landlord_count integer := 0;
  v_after_room_count integer := 0;
  v_after_company_rent_roll numeric := 0;
  v_after_office_rent_roll numeric := 0;
begin
  if p_confirmation <> 'DELETE' then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMATION_REQUIRED', 'message', 'Type DELETE to confirm permanent deletion.');
  end if;

  if nullif(trim(coalesce(p_reason, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED', 'message', 'Deletion reason is required.');
  end if;

  if not exists (
    select 1
    from public.user_office_roles uor
    join public.roles r on r.id = uor.role_id
    where uor.company_id = p_company_id
      and uor.user_id = p_admin_id
      and uor.scope = 'company'
      and lower(coalesce(r.key, r.name, '')) in ('company_admin','admin','ceo')
  ) then
    return jsonb_build_object(
      'ok', false,
      'code', 'NOT_AUTHORIZED',
      'message', 'Only a company Admin may permanently delete a landlord portfolio.'
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('landlord-delete:' || p_company_id::text || ':' || p_landlord_id::text, 0));

  select *
    into v_landlord
  from public.landlords
  where id = p_landlord_id
    and company_id = p_company_id
  for update;

  if v_landlord.id is null then
    return jsonb_build_object('ok', true, 'code', 'ALREADY_DELETED', 'landlordId', p_landlord_id, 'deletedRoomCount', 0);
  end if;

  v_preview := public.ddumba_v1_landlord_delete_preview(p_company_id, p_landlord_id);
  if coalesce((v_preview->>'canDelete')::boolean, false) is not true then
    return jsonb_build_object(
      'ok', false,
      'code', 'DELETE_BLOCKED',
      'landlordId', p_landlord_id,
      'landlordName', v_landlord.full_name,
      'blockers', coalesce(v_preview->'blockers', '[]'::jsonb),
      'warnings', coalesce(v_preview->'warnings', '[]'::jsonb),
      'preview', v_preview
    );
  end if;

  select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_room_ids
  from jsonb_array_elements_text(v_preview->'roomIds') as ids(value);

  select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_lease_ids
  from jsonb_array_elements_text(v_preview->'leaseIds') as ids(value);

  select coalesce(array_agg(value::uuid), array[]::uuid[])
    into v_property_ids
  from jsonb_array_elements_text(v_preview->'propertyIds') as ids(value);

  v_room_count := coalesce(array_length(v_room_ids, 1), 0);
  v_rent_roll := coalesce((v_preview->>'monthlyRentRoll')::numeric, 0);

  select office_id
    into v_office_id
  from public.rooms
  where id = any(v_room_ids)
    and office_id is not null
  limit 1;

  select count(*)::integer into v_before_landlord_count from public.landlords where company_id = p_company_id;
  select count(*)::integer, coalesce(sum(coalesce(monthly_rent, 0)), 0)
    into v_before_room_count, v_before_company_rent_roll
  from public.rooms
  where company_id = p_company_id;
  select coalesce(sum(coalesce(monthly_rent, 0)), 0)
    into v_before_office_rent_roll
  from public.rooms
  where company_id = p_company_id
    and office_id = v_office_id;

  select coalesce(array_agg(coalesce(room_number, id::text)), array[]::text[])
    into v_deleted_room_numbers
  from public.rooms
  where id = any(v_room_ids);

  select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
    into v_room_snapshot
  from public.rooms r
  where r.id = any(v_room_ids);

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb)
    into v_lease_snapshot
  from public.leases l
  where l.company_id = p_company_id
    and l.id = any(v_lease_ids);

  if to_regclass('public.landlord_payments') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(lp)), ''[]''::jsonb) from public.landlord_payments lp where lp.company_id = $1 and lp.landlord_id = $2'
      into v_payment_snapshot
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.vacated_tenant_debts') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(vtd)), ''[]''::jsonb) from public.vacated_tenant_debts vtd where vtd.company_id = $1 and (vtd.landlord_id = $2 or vtd.room_id = any($3) or vtd.lease_id = any($4))'
      into v_vacated_debt_snapshot
      using p_company_id, p_landlord_id, v_room_ids, v_lease_ids;
  end if;

  if to_regclass('public.rent_invoices') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(ri)), ''[]''::jsonb) from public.rent_invoices ri where ri.company_id = $1 and ri.lease_id = any($2)'
      into v_rent_invoice_snapshot
      using p_company_id, v_lease_ids;
  end if;

  if to_regclass('public.tenant_ledger_entries') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(tle)), ''[]''::jsonb) from public.tenant_ledger_entries tle where tle.company_id = $1 and tle.lease_id = any($2)'
      into v_tenant_ledger_snapshot
      using p_company_id, v_lease_ids;
  end if;

  update public.collections
  set landlord_id = null,
      room_id = null,
      property_id = null,
      lease_id = null
  where company_id = p_company_id
    and (landlord_id = p_landlord_id or room_id = any(v_room_ids) or lease_id = any(v_lease_ids) or property_id = any(v_property_ids));

  update public.promises
  set room_id = null,
      lease_id = null
  where company_id = p_company_id
    and (room_id = any(v_room_ids) or lease_id = any(v_lease_ids));

  update public.tenants
  set room_id = null,
      previous_room_id = case when previous_room_id = any(v_room_ids) then null else previous_room_id end,
      property_id = case when property_id = any(v_property_ids) then null else property_id end,
      updated_at = now()
  where company_id = p_company_id
    and (room_id = any(v_room_ids) or previous_room_id = any(v_room_ids) or property_id = any(v_property_ids));

  if to_regclass('public.tenant_exit_records') is not null then
    execute 'update public.tenant_exit_records set landlord_id = null, room_id = null, property_id = null, lease_id = null where company_id = $1 and (landlord_id = $2 or room_id = any($3) or property_id = any($4) or lease_id = any($5))'
      using p_company_id, p_landlord_id, v_room_ids, v_property_ids, v_lease_ids;
  end if;

  if to_regclass('public.vacated_tenant_debts') is not null then
    execute 'update public.vacated_tenant_debts set landlord_name = coalesce(landlord_name, $5), landlord_id = null, room_id = null, property_id = null, lease_id = null, updated_at = now() where company_id = $1 and (landlord_id = $2 or room_id = any($3) or lease_id = any($4))'
      using p_company_id, p_landlord_id, v_room_ids, v_lease_ids, v_landlord.full_name;
  end if;

  if to_regclass('public.landlord_payments') is not null then
    execute 'update public.landlord_payments set landlord_id = null, updated_at = now() where company_id = $1 and landlord_id = $2'
      using p_company_id, p_landlord_id;
  end if;

  if to_regclass('public.landlord_debt_deductions') is not null then
    execute 'update public.landlord_debt_deductions set landlord_id = null, room_id = null, property_id = null where company_id = $1 and (landlord_id = $2 or room_id = any($3) or property_id = any($4))'
      using p_company_id, p_landlord_id, v_room_ids, v_property_ids;
  end if;

  if to_regclass('public.landlord_settlement_lines') is not null then
    execute 'update public.landlord_settlement_lines set room_id = null, property_id = null where company_id = $1 and (room_id = any($2) or property_id = any($3))'
      using p_company_id, v_room_ids, v_property_ids;
  end if;

  if to_regclass('public.tenant_rent_allocations') is not null then
    execute 'update public.tenant_rent_allocations set room_id = null, source_lease_id = null where company_id = $1 and (room_id = any($2) or source_lease_id = any($3))'
      using p_company_id, v_room_ids, v_lease_ids;
  end if;

  if to_regclass('public.tenant_rent_months') is not null then
    execute 'update public.tenant_rent_months set landlord_id = null, lease_id = null where company_id = $1 and (landlord_id = $2 or lease_id = any($3))'
      using p_company_id, p_landlord_id, v_lease_ids;
  end if;

  if to_regclass('public.payments') is not null then
    execute 'update public.payments set lease_id = null where company_id = $1 and lease_id = any($2)'
      using p_company_id, v_lease_ids;
  end if;

  if to_regclass('public.tenant_security_deposits') is not null then
    execute 'update public.tenant_security_deposits set landlord_id = null, room_id = null, lease_id = null where company_id = $1 and (landlord_id = $2 or room_id = any($3) or lease_id = any($4))'
      using p_company_id, p_landlord_id, v_room_ids, v_lease_ids;
  end if;

  if to_regclass('public.security_deposit_transactions') is not null then
    execute 'update public.security_deposit_transactions set landlord_id = null, room_id = null where company_id = $1 and (landlord_id = $2 or room_id = any($3))'
      using p_company_id, p_landlord_id, v_room_ids;
  end if;

  if to_regclass('public.rent_invoices') is not null then
    execute 'delete from public.rent_invoices where company_id = $1 and lease_id = any($2)'
      using p_company_id, v_lease_ids;
  end if;

  if to_regclass('public.tenant_ledger_entries') is not null then
    execute 'alter table public.tenant_ledger_entries disable trigger user';
  end if;

  delete from public.leases
  where company_id = p_company_id
    and id = any(v_lease_ids);

  if to_regclass('public.tenant_ledger_entries') is not null then
    execute 'alter table public.tenant_ledger_entries enable trigger user';
  end if;

  delete from public.landlord_search_index where landlord_id = p_landlord_id;
  if to_regclass('public.landlord_portfolio_summaries') is not null then
    delete from public.landlord_portfolio_summaries where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;
  if to_regclass('public.landlord_room_summary') is not null then
    delete from public.landlord_room_summary where company_id = p_company_id and (landlord_id = p_landlord_id or room_id = any(v_room_ids));
  end if;
  if to_regclass('public.landlord_summary') is not null then
    delete from public.landlord_summary where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;
  if to_regclass('public.monthly_settlement_summary') is not null then
    delete from public.monthly_settlement_summary where company_id = p_company_id and landlord_id = p_landlord_id;
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
  if to_regclass('public.landlord_bank_accounts') is not null then
    delete from public.landlord_bank_accounts where company_id = p_company_id and landlord_id = p_landlord_id;
  end if;
  if to_regclass('public.management_fee_rules') is not null then
    delete from public.management_fee_rules where company_id = p_company_id and (landlord_id = p_landlord_id or property_id = any(v_property_ids));
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
    jsonb_build_object(
      'landlord', to_jsonb(v_landlord),
      'rooms', v_room_snapshot,
      'leases', v_lease_snapshot,
      'landlord_payments', v_payment_snapshot,
      'vacated_tenant_debts', v_vacated_debt_snapshot,
      'rent_invoices', v_rent_invoice_snapshot,
      'tenant_ledger_entries', v_tenant_ledger_snapshot
    ),
    jsonb_build_object(
      'deleted_landlord_id', p_landlord_id,
      'landlord_name', v_landlord.full_name,
      'deleted_by', p_admin_id,
      'deletion_reason', p_reason,
      'deleted_at', now(),
      'deleted_room_count', v_room_count,
      'deleted_room_numbers', v_deleted_room_numbers,
      'rent_roll_removed', v_rent_roll,
      'preview', v_preview
    )
  );

  select count(*)::integer into v_after_landlord_count from public.landlords where company_id = p_company_id;
  select count(*)::integer, coalesce(sum(coalesce(monthly_rent, 0)), 0)
    into v_after_room_count, v_after_company_rent_roll
  from public.rooms
  where company_id = p_company_id;
  select coalesce(sum(coalesce(monthly_rent, 0)), 0)
    into v_after_office_rent_roll
  from public.rooms
  where company_id = p_company_id
    and office_id = v_office_id;

  return jsonb_build_object(
    'ok', true,
    'code', 'DELETED',
    'landlordId', p_landlord_id,
    'landlordName', v_landlord.full_name,
    'deletedRoomCount', v_room_count,
    'deletedRoomNumbers', v_deleted_room_numbers,
    'rentRollRemoved', v_rent_roll,
    'auditAction', 'landlord_permanently_deleted',
    'totalsBefore', jsonb_build_object(
      'landlordCount', v_before_landlord_count,
      'roomCount', v_before_room_count,
      'companyRentRoll', v_before_company_rent_roll,
      'officeRentRoll', v_before_office_rent_roll
    ),
    'totalsAfter', jsonb_build_object(
      'landlordCount', v_after_landlord_count,
      'roomCount', v_after_room_count,
      'companyRentRoll', v_after_company_rent_roll,
      'officeRentRoll', v_after_office_rent_roll
    )
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'code', 'DELETE_FAILED',
      'landlordId', p_landlord_id,
      'sqlstate', sqlstate,
      'message', sqlerrm
    );
end;
$$;

grant execute on function public.ddumba_v1_landlord_delete_preview(uuid, uuid) to authenticated, service_role;
grant execute on function public.ddumba_v1_permanently_delete_landlord_portfolio(uuid, uuid, uuid, text, text) to authenticated, service_role;
