"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeNotificationFeedFilters, type NotificationFeedFilters } from "@/lib/notifications/data";

type Db = {
    from: (table: string) => any;
};

function scopeNotificationUpdate(query: any, context: Awaited<ReturnType<typeof requireAuth>>) {
    let scoped = query.eq("company_id", context.activeCompany?.id);
    if (context.isCompanyAdmin && !context.isOfficeMode) return scoped.eq("recipient_type", "admin");
    return scoped.eq("recipient_type", "office").eq("office_id", context.activeOffice?.id);
}

function applyReadAllFilters(query: any, filters: NotificationFeedFilters) {
    let scoped = query;
    if (filters.officeId !== "all") scoped = scoped.eq("office_id", filters.officeId);
    if (filters.status === "unread") scoped = scoped.eq("is_read", false);
    if (filters.status === "read") scoped = scoped.eq("is_read", true);
    if (filters.status === "pending") scoped = scoped.or("title.ilike.%pending%,message.ilike.%pending%,delivery_status.ilike.%pending%");
    if (filters.status === "approved") scoped = scoped.or("title.ilike.%approved%,message.ilike.%approved%,delivery_status.ilike.%approved%");
    if (filters.status === "rejected") scoped = scoped.or("title.ilike.%rejected%,message.ilike.%rejected%,delivery_status.ilike.%rejected%");
    if (filters.query) {
        const escaped = filters.query.replaceAll("%", "\\%").replaceAll("_", "\\_");
        scoped = scoped.or([
            `title.ilike.%${escaped}%`,
            `message.ilike.%${escaped}%`,
            `action_url.ilike.%${escaped}%`,
            `entity_type.ilike.%${escaped}%`,
        ].join(","));
    }
    return scoped;
}

export async function markNotificationsRead(input: { ids: string[] }) {
    const context = await requireAuth();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const ids = [...new Set(input.ids.filter(Boolean))].slice(0, 100);
    if (!ids.length) return { updated: 0 };
    const db = await createSupabaseServerClient() as unknown as Db;
    const { data, error } = await scopeNotificationUpdate(
        db.from("notifications").update({ is_read: true }).in("id", ids).select("id"),
        context,
    );
    if (error) throw new Error(error.message);
    revalidatePath("/office/notifications");
    return { updated: data?.length ?? 0 };
}

export async function markMatchingNotificationsRead(input: { filters?: Record<string, string | string[] | undefined> }) {
    const context = await requireAuth();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const db = await createSupabaseServerClient() as unknown as Db;
    const filters = normalizeNotificationFeedFilters(input.filters);
    let query = scopeNotificationUpdate(db.from("notifications").update({ is_read: true }).select("id"), context);
    query = applyReadAllFilters(query, filters).eq("is_read", false);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    revalidatePath("/office/notifications");
    return { updated: data?.length ?? 0 };
}
