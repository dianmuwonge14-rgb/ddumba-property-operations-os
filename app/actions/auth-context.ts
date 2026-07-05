"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_COMPANY_COOKIE, ACTIVE_OFFICE_COOKIE, getAuthContext } from "@/lib/auth/context";
import { logUserAction } from "@/lib/auth/audit";

const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
};

export async function setActiveCompany(companyId: string) {
    const context = await getAuthContext();
    const allowed = context.companies.some((company) => company.id === companyId);

    if (!allowed) {
        throw new Error("You do not have access to this company.");
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, cookieOptions);
    cookieStore.delete(ACTIVE_OFFICE_COOKIE);

    await logUserAction({
        action: "active_company_selected",
        entityType: "company",
        entityId: companyId,
        companyId,
        afterData: { selected_company_id: companyId },
    });

    revalidatePath("/", "layout");
}

export async function setActiveOffice(officeId: string) {
    const context = await getAuthContext();
    const office = context.offices.find((item) => item.id === officeId);

    if (!office) {
        throw new Error("You do not have access to this office.");
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_OFFICE_COOKIE, officeId, cookieOptions);

    await logUserAction({
        action: "active_office_selected",
        entityType: "office",
        entityId: officeId,
        companyId: office.company_id ?? context.activeCompany?.id ?? undefined,
        officeId,
        afterData: { selected_office_id: officeId },
    });

    revalidatePath("/", "layout");
}
