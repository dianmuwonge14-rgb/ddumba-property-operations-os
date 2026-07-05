import { requirePermission } from "@/lib/auth/permissions";
import { getExpensesPageData } from "@/lib/expenses/data";
import ExpensesConsole from "@/components/office/expenses/ExpensesConsole";

export default async function ExpensesPage() {
    const context = await requirePermission("expenses.read");
    const data = await getExpensesPageData();

    return (
        <ExpensesConsole
            canManage={context.isCompanyAdmin || context.permissions.includes("expenses.manage")}
            data={data}
            isAdmin={context.isCompanyAdmin && !context.isOfficeMode}
        />
    );
}
