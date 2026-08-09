import { canSubmitOperationalExpenses, requireOperationalExpenseEntryAccess } from "@/lib/auth/permissions";
import { getExpensesPageData } from "@/lib/expenses/data";
import type { ExpenseBalanceFilters, ExpensePeriodMode } from "@/lib/expenses/types";
import ExpensesConsole from "@/components/office/expenses/ExpensesConsole";

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function ExpensesPage({ searchParams }: Props) {
    const context = await requireOperationalExpenseEntryAccess();
    const params = await searchParams;
    const mode = scalar(params.mode) as ExpensePeriodMode | undefined;
    const data = await getExpensesPageData();
    const initialFilters: ExpenseBalanceFilters = {
        endDate: scalar(params.endDate) ?? scalar(params.dateTo) ?? undefined,
        endMonth: scalar(params.endMonth) ?? undefined,
        mode,
        officeId: scalar(params.officeId) ?? undefined,
        singleDate: scalar(params.singleDate) ?? scalar(params.date) ?? undefined,
        singleMonth: scalar(params.singleMonth) ?? undefined,
        startDate: scalar(params.startDate) ?? scalar(params.dateFrom) ?? undefined,
        startMonth: scalar(params.startMonth) ?? undefined,
    };

    return (
        <ExpensesConsole
            canManage={canSubmitOperationalExpenses(context)}
            data={data}
            initialFilters={initialFilters}
            isAdmin={context.isCompanyAdmin && !context.isOfficeMode}
            isManager={context.isCompanyReadOnlyManager && !context.isOfficeMode}
        />
    );
}
