import pg from "pg";

const { Client } = pg;

const projectRef = process.env.SUPABASE_PROJECT_REF ?? "nkypietptxwzdfesyawx";
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const dbUrl = process.env.SUPABASE_DB_URL
    ?? (dbPassword ? `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres` : null);

if (!dbUrl) throw new Error("SUPABASE_DB_PASSWORD or SUPABASE_DB_URL is required.");

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

const requiredAdvanceColumns = [
    "principal_amount",
    "interest_type",
    "interest_rate",
    "interest_amount",
    "total_repayable",
    "deduction_start_date",
    "payment_plan",
    "monthly_deduction_amount",
    "expected_end_date",
    "actual_cleared_date",
    "approved_by",
    "lifecycle_status",
    "paused_at",
    "paused_by",
    "pause_reason",
    "resumed_at",
    "resumed_by",
    "resume_note",
    "early_settlement_policy",
    "early_settlement_discount",
    "revision_number",
    "last_revised_at",
    "last_revised_by",
    "repayment_type",
    "interest_calculation_mode",
    "fixed_interest_amount",
    "deduction_end_date",
    "principal_clearance_method",
    "remaining_principal_balance",
    "remaining_interest_balance",
    "remaining_total_balance",
    "principal_cleared_at",
    "principal_cleared_by",
];

await client.connect();
try {
    const columns = await client.query(
        `select column_name
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'landlord_advances'
            and column_name = any($1)
          order by column_name`,
        [requiredAdvanceColumns],
    );
    const found = new Set(columns.rows.map((row) => row.column_name));
    const missing = requiredAdvanceColumns.filter((column) => !found.has(column));
    if (missing.length > 0) throw new Error(`Missing landlord_advances columns: ${missing.join(", ")}`);

    const tables = await client.query(
        `select c.relname, c.relrowsecurity
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = any($1)
          order by c.relname`,
        [["landlord_advance_repayment_schedule", "landlord_advance_deductions", "landlord_advance_revisions", "landlord_advance_principal_clearances", "landlord_advance_interest_events"]],
    );
    if (tables.rowCount !== 5) throw new Error("Expected repayment schedule, deduction, revision, principal clearance, and interest event tables to exist.");
    const noRls = tables.rows.filter((row) => !row.relrowsecurity).map((row) => row.relname);
    if (noRls.length > 0) throw new Error(`RLS not enabled on: ${noRls.join(", ")}`);

    const policies = await client.query(
        `select tablename, count(*)::int as count
           from pg_policies
          where schemaname = 'public'
            and tablename = any($1)
          group by tablename`,
        [["landlord_advance_repayment_schedule", "landlord_advance_deductions", "landlord_advance_revisions", "landlord_advance_principal_clearances", "landlord_advance_interest_events"]],
    );
    const policyCounts = Object.fromEntries(policies.rows.map((row) => [row.tablename, row.count]));
    for (const table of ["landlord_advance_repayment_schedule", "landlord_advance_deductions", "landlord_advance_revisions", "landlord_advance_principal_clearances", "landlord_advance_interest_events"]) {
        if (!policyCounts[table]) throw new Error(`No RLS policies found for ${table}`);
    }

    const scope = await client.query(
        `select c.id as company_id, o.id as office_id, l.id as landlord_id
           from public.companies c
           join public.offices o on o.company_id = c.id
           join public.landlords l on l.company_id = c.id
          limit 1`,
    );
    if (scope.rowCount === 0) throw new Error("No live company/office/landlord scope available for rollback write test.");
    const { company_id: companyId, office_id: officeId, landlord_id: landlordId } = scope.rows[0];

    await client.query("begin");
    const advance = await client.query(
        `insert into public.landlord_advances (
            company_id, office_id, landlord_id, advance_amount, principal_amount,
            interest_type, interest_rate, interest_amount, total_repayable,
            deducted_amount, date_given, deduction_start_date, payment_plan,
            monthly_deduction_amount, expected_end_date, reason, status,
            lifecycle_status, revision_number, repayment_type, interest_calculation_mode,
            fixed_interest_amount, deduction_end_date, principal_clearance_method,
            remaining_principal_balance, remaining_interest_balance, remaining_total_balance
         ) values ($1,$2,$3,550000,500000,'percentage',10,50000,550000,0,current_date,current_date,'monthly',100000,current_date + interval '5 months','rollback verification', 'pending', 'active', 1,
            'principal_fixed_interest','fixed_principal',0,current_date + interval '5 months','deducted_monthly',500000,50000,550000)
         returning id`,
        [companyId, officeId, landlordId],
    );
    const advanceId = advance.rows[0].id;
    await client.query(
        `insert into public.landlord_advance_repayment_schedule (
            company_id, office_id, landlord_id, advance_id, month_key,
            opening_balance, opening_principal_balance, interest_charged, scheduled_deduction, interest_portion, principal_portion, closing_principal_balance, closing_balance, remaining_total_balance, status
         ) values ($1,$2,$3,$4,current_date,550000,500000,50000,100000,50000,50000,450000,450000,450000,'pending')`,
        [companyId, officeId, landlordId, advanceId],
    );
    await client.query(
        `insert into public.landlord_advance_deductions (
            company_id, office_id, landlord_id, advance_id, amount, interest_portion, principal_portion, remaining_balance, deduction_month, status, notes, reference
         ) values ($1,$2,$3,$4,100000,50000,50000,450000,current_date,'deducted','rollback verification','verify-ref')`,
        [companyId, officeId, landlordId, advanceId],
    );
    await client.query(
        `insert into public.landlord_advance_revisions (
            company_id, office_id, landlord_id, advance_id, revision_number, action, before_data, after_data, reason
         ) values ($1,$2,$3,$4,1,'rollback_verify','{}'::jsonb,'{}'::jsonb,'rollback verification')`,
        [companyId, officeId, landlordId, advanceId],
    );
    await client.query(
        `insert into public.landlord_advance_principal_clearances (
            company_id, office_id, landlord_id, advance_id, amount, clearance_method, clearance_date, reference, notes
         ) values ($1,$2,$3,$4,100000,'cleared_manually',current_date,'verify-principal','rollback verification')`,
        [companyId, officeId, landlordId, advanceId],
    );
    await client.query(
        `insert into public.landlord_advance_interest_events (
            company_id, office_id, landlord_id, advance_id, month_key, opening_principal_balance, interest_mode, interest_rate, interest_charged, interest_recovered, status
         ) values ($1,$2,$3,$4,current_date,500000,'fixed_principal',10,50000,0,'projected')`,
        [companyId, officeId, landlordId, advanceId],
    );
    await client.query("rollback");

    process.stdout.write(JSON.stringify({
        ok: true,
        columnsVerified: requiredAdvanceColumns.length,
        tablesVerified: tables.rows.map((row) => row.relname),
        rlsVerified: true,
        rollbackWriteTest: "passed",
    }, null, 2));
} catch (error) {
    try {
        await client.query("rollback");
    } catch {
        // ignore rollback errors when no transaction is open
    }
    throw error;
} finally {
    await client.end();
}
