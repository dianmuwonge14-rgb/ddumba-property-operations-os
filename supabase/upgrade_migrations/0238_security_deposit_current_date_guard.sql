-- Phase 238: Ensure security-deposit inserts use the current Kampala business date.

do $$
begin
  if to_regclass('public.tenant_security_deposits') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tenant_security_deposits' and column_name = 'date_received') then
    drop trigger if exists trg_current_date_tenant_security_deposits on public.tenant_security_deposits;
    create trigger trg_current_date_tenant_security_deposits
      before insert on public.tenant_security_deposits
      for each row execute function public.ddumba_enforce_current_entry_date('date_received', 'Security deposits can only be recorded for the current date.');
  end if;
end $$;

