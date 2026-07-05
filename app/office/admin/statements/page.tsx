import StatementsCentre from "@/components/office/admin/StatementsCentre";
import { getStatementsCentreShell } from "@/lib/admin-statements/data";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminStatementsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireCompanyAdminMode();
    const params = await searchParams;
    const data = await getStatementsCentreShell(params);
    return <StatementsCentre data={data} />;
}
