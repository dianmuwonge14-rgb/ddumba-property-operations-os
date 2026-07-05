import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAuth } from "./permissions";
import type { AuthContext } from "./types";

type ScopedQuery = {
    eq: (column: string, value: string) => ScopedQuery;
};

export function applyCompanyOfficeScope<TQuery extends ScopedQuery>(
    query: TQuery,
    context: Pick<AuthContext, "activeCompany" | "activeOffice" | "canAccessAllOffices">,
    options: { companyColumn?: string; officeColumn?: string; requireOffice?: boolean } = {},
) {
    const companyColumn = options.companyColumn ?? "company_id";
    const officeColumn = options.officeColumn ?? "office_id";

    if (context.activeCompany) {
        query.eq(companyColumn, context.activeCompany.id);
    }

    if ((options.requireOffice || !context.canAccessAllOffices) && context.activeOffice) {
        query.eq(officeColumn, context.activeOffice.id);
    }

    return query as TQuery;
}

export async function getScopedSupabase() {
    const context = await requireAuth();
    const supabase = await createSupabaseServerClient();

    return {
        supabase,
        context,
        scope<TQuery extends ScopedQuery>(
            query: TQuery,
            options?: { companyColumn?: string; officeColumn?: string; requireOffice?: boolean },
        ) {
            return applyCompanyOfficeScope(query, context, options);
        },
    };
}
