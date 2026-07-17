-- Optional database-side hourly tenant billing schedule.
-- Vercel Hobby projects cannot run hourly crons, so schedule inside Supabase when pg_cron is available.

do $$
begin
    create extension if not exists pg_cron with schema extensions;
exception when others then
    raise notice 'pg_cron extension is not available or cannot be installed by this role: %', sqlerrm;
end $$;

do $$
begin
    if exists (select 1 from pg_namespace where nspname = 'cron') then
        begin
            perform cron.unschedule('ddumba_tenant_billing_hourly');
        exception when others then
            null;
        end;

        perform cron.schedule(
            'ddumba_tenant_billing_hourly',
            '0 * * * *',
            $job$
            do $billing$
            declare
                company_row record;
                v_business_date date := ((now() at time zone 'Africa/Kampala')::date);
            begin
                for company_row in
                    select id
                    from public.companies
                    order by created_at nulls last
                loop
                    perform public.run_monthly_rent_rollover(
                        company_row.id,
                        null,
                        v_business_date,
                        null,
                        'scheduled_hourly_pg_cron'
                    );
                end loop;
            end
            $billing$;
            $job$
        );
    else
        raise notice 'pg_cron schema is not available; use /api/billing/run from an external scheduler.';
    end if;
exception when others then
    raise notice 'Could not schedule ddumba_tenant_billing_hourly: %', sqlerrm;
end $$;
