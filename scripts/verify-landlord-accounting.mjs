import pg from "pg";

const { Client } = pg;

const projectRef = process.env.SUPABASE_PROJECT_REF;
const dbPassword = process.env.SUPABASE_DB_PASSWORD;
const connectionString = process.env.SUPABASE_DB_URL
    ?? `postgresql://postgres.${projectRef}:${encodeURIComponent(dbPassword)}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;

if (!projectRef) throw new Error("SUPABASE_PROJECT_REF is required.");
if (!dbPassword) throw new Error("SUPABASE_DB_PASSWORD is required.");

const requiredColumns = [
    "opening_arrears",
    "monthly_net_payable",
    "total_due",
    "amount_paid",
    "unpaid_balance",
    "overpaid_amount",
    "advance_created",
    "closing_arrears",
    "payment_reference",
    "accounting_notes",
];

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
    statement_timeout: 120000,
});

function statusFor(totalDue, paid) {
    if (paid > totalDue) return "overpaid";
    if (paid === totalDue) return "paid";
    if (paid > 0) return "partial";
    return "unpaid";
}

await client.connect();
try {
    const columns = await client.query(
        `
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'landlord_monthly_payables'
          and column_name = any($1::text[])
        order by column_name
        `,
        [requiredColumns],
    );
    const foundColumns = columns.rows.map((row) => row.column_name);
    const missingColumns = requiredColumns.filter((column) => !foundColumns.includes(column));

    const rls = await client.query(
        `
        select relname, relrowsecurity
        from pg_class
        where relnamespace = 'public'::regnamespace
          and relname = any($1::text[])
        order by relname
        `,
        [["landlord_monthly_payables", "landlord_monthly_payable_payments", "landlord_advances"]],
    );

    const indexes = await client.query(
        `
        select indexname
        from pg_indexes
        where schemaname = 'public'
          and indexname = any($1::text[])
        order by indexname
        `,
        [[
            "idx_landlord_monthly_payables_accounting",
            "idx_landlord_monthly_payable_payments_accounting",
            "idx_landlord_advances_accounting",
        ]],
    );

    const fk = await client.query(
        `
        select conname
        from pg_constraint
        where conrelid = 'public.landlord_monthly_payables'::regclass
          and contype = 'f'
        order by conname
        `,
    );

    await client.query("begin");
    const base = await client.query(`
        select c.id as company_id, o.id as office_id, l.id as landlord_id
        from public.companies c
        join public.offices o on o.company_id = c.id
        join public.landlords l on l.company_id = c.id
        limit 1
    `);
    if (!base.rows[0]) throw new Error("No company/office/landlord row found for write verification.");
    const { company_id, office_id, landlord_id } = base.rows[0];
    const scenarios = [
        { label: "exact", month: "2099-01-01", due: 500000, paid: 500000 },
        { label: "partial", month: "2099-02-01", due: 500000, paid: 300000 },
        { label: "none", month: "2099-03-01", due: 500000, paid: 0 },
        { label: "overpaid", month: "2099-04-01", due: 500000, paid: 600000 },
    ];
    const scenarioResults = [];
    for (const scenario of scenarios) {
        const openingArrears = scenario.label === "none" ? 0 : 0;
        const totalDue = openingArrears + scenario.due;
        const unpaid = Math.max(0, totalDue - scenario.paid);
        const overpaid = Math.max(0, scenario.paid - totalDue);
        const status = statusFor(totalDue, scenario.paid);
        const inserted = await client.query(
            `
            insert into public.landlord_monthly_payables (
                company_id, office_id, landlord_id, settlement_month, month_key,
                landlord_name, office_name, full_rent_roll, commission_mode,
                commission_percentage, commission_amount, vacant_room_deductions,
                vacated_tenant_debt_deductions, advance_deductions, other_deductions,
                net_payable, opening_arrears, monthly_net_payable, total_due,
                amount_paid, unpaid_balance, overpaid_amount, advance_created,
                closing_arrears, status, payment_reference, accounting_notes
            ) values (
                $1,$2,$3,$4,$4,
                'Verification Landlord','Verification Office',$5,'portfolio_based',
                0,0,0,
                0,0,0,
                $5,$6,$5,$7,
                $8,$9,$10,$10,
                $9,$11,$12,$13
            )
            returning id, status, unpaid_balance, overpaid_amount, advance_created, closing_arrears
            `,
            [
                company_id,
                office_id,
                landlord_id,
                scenario.month,
                scenario.due,
                openingArrears,
                totalDue,
                scenario.paid,
                unpaid,
                overpaid,
                status,
                `VERIFY-${scenario.label}`,
                `Rolled back verification for ${scenario.label}`,
            ],
        );
        if (overpaid > 0) {
            await client.query(
                `
                insert into public.landlord_advances (
                    company_id, office_id, landlord_id, advance_amount, deducted_amount,
                    date_given, reason, note, status
                ) values ($1,$2,$3,$4,0,current_date,'Verification overpayment','Rolled back verification','pending')
                `,
                [company_id, office_id, landlord_id, overpaid],
            );
        }
        scenarioResults.push({ label: scenario.label, ...inserted.rows[0] });
    }

    const allocationRows = await client.query(
        `
        select settlement_month, unpaid_balance
        from public.landlord_monthly_payables
        where company_id = $1 and office_id = $2 and landlord_id = $3
          and settlement_month in ('2099-02-01','2099-03-01','2099-04-01')
        order by settlement_month asc
        `,
        [company_id, office_id, landlord_id],
    );
    await client.query("rollback");

    console.log(JSON.stringify({
        ok: missingColumns.length === 0,
        columns: { found: foundColumns, missing: missingColumns },
        rls: rls.rows,
        indexes: indexes.rows.map((row) => row.indexname),
        foreignKeys: fk.rows.map((row) => row.conname),
        writeTestsRolledBack: scenarioResults,
        allocationOrderVerifiedByOldestMonthSort: allocationRows.rows,
    }, null, 2));
} catch (error) {
    await client.query("rollback").catch(() => null);
    throw error;
} finally {
    await client.end();
}
