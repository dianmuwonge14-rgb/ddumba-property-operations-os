import { NextRequest, NextResponse } from "next/server";
import { getScopedSupabase } from "@/lib/auth/query";
import { canAccessOffice, requireAuth } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function cleanText(value: unknown, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : "";
    return text ? text.slice(0, maxLength) : null;
}

export async function PATCH(request: NextRequest) {
    try {
        const context = await requireAuth();
        const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
        const scoped = await getScopedSupabase();
        const supabase = isCollector ? createSupabaseAdminClient() : scoped.supabase;
        const body = await request.json();
        const tenantId = cleanText(body.tenantId, 80);
        const fullName = cleanText(body.fullName, 160);
        const phone = cleanText(body.phone, 48);
        const companyId = context.activeCompany?.id;

        if (!companyId || !tenantId) {
            return NextResponse.json({ error: "Tenant and company are required." }, { status: 400 });
        }

        const { data: tenant, error: tenantError } = await supabase
            .from("tenants")
            .select("id, company_id, office_id, room_id, full_name, phone")
            .eq("id", tenantId)
            .eq("company_id", companyId)
            .maybeSingle();

        if (tenantError) throw new Error(tenantError.message);
        if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

        let resolvedOfficeId = tenant.office_id;
        if (!resolvedOfficeId && tenant.room_id) {
            const { data: room, error: roomError } = await supabase
                .from("rooms")
                .select("office_id")
                .eq("id", tenant.room_id)
                .eq("company_id", companyId)
                .maybeSingle();
            if (roomError) throw new Error(roomError.message);
            resolvedOfficeId = room?.office_id ?? null;
        }

        if (!isCollector && !(context.isCompanyAdmin || context.canAccessAllOffices) && !canAccessOffice(context, resolvedOfficeId)) {
            return NextResponse.json({ error: "Tenant is outside your office." }, { status: 403 });
        }

        const { data: updatedTenant, error: updateError } = await supabase
            .from("tenants")
            .update({
                full_name: fullName,
                phone,
            })
            .eq("id", tenant.id)
            .eq("company_id", companyId)
            .select("id, full_name, phone")
            .single();

        if (updateError) throw new Error(updateError.message);

        return NextResponse.json({ tenant: updatedTenant }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Tenant contact could not be saved.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
