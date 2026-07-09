import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type { VacancyAssistant, VacantRoomItem, VacantRoomsKpis, VacantRoomsPageData } from "./types";
import type { Database } from "@/types/database.types";

type DynamicDb = {
    from: (table: string) => any;
};

type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];

function amount(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}

function isVacantStatus(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty") || status === "available";
}

function daysBetween(start: string | null, end = new Date()) {
    if (!start) return 0;
    const date = new Date(start);
    if (Number.isNaN(date.getTime())) return 0;
    return Math.max(0, Math.floor((end.getTime() - date.getTime()) / 86_400_000));
}

function dateOnly(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function commissionRate(landlord: LandlordRow | null, fallback: number) {
    const value = amount((landlord as (LandlordRow & { commission_rate?: number | string | null }) | null)?.commission_rate);
    return value > 0 ? value : fallback;
}

function commissionMode(landlord: LandlordRow | null): "portfolio_based" | "occupied_room_based" {
    const value = String((landlord as (LandlordRow & { commission_calculation_mode?: string | null }) | null)?.commission_calculation_mode ?? "");
    return value === "occupied_room_based" ? "occupied_room_based" : "portfolio_based";
}

function propertyLabel(property: PropertyRow | null) {
    if (!property) return "No property";
    return property.property_name ?? property.name ?? property.village ?? property.address ?? "Property";
}

function propertyLocation(property: PropertyRow | null) {
    if (!property) return "No location";
    return [property.village, property.address, property.city, property.region].filter(Boolean).join(", ") || propertyLabel(property);
}

function officeName(office: OfficeRow | null | undefined) {
    return office?.office_name ?? office?.name ?? "No office";
}

export async function getVacantRoomsPageData(options: { admin?: boolean } = {}): Promise<VacantRoomsPageData> {
    const context = await requireAuth();
    const { supabase } = await getScopedSupabase();
    const db = supabase as unknown as DynamicDb;
    const companyId = context.activeCompany?.id;
    const activeOfficeId = context.activeOffice?.id;
    const isAdmin = Boolean(options.admin && context.isCompanyAdmin && !context.isOfficeMode);
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
    const canViewAllOffices = isAdmin || isCollector;

    if (!companyId || (!canViewAllOffices && !activeOfficeId)) {
        return emptyData(isAdmin);
    }

    const companySettings = await supabase
        .from("company_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "default_landlord_commission_rate")
        .maybeSingle();
    const defaultCommissionRate = amount(companySettings.data?.value) || 10;

    let roomQuery = supabase
        .from("rooms")
        .select("*")
        .eq("company_id", companyId)
        .order("room_number", { ascending: true, nullsFirst: false });
    if (!canViewAllOffices && activeOfficeId) {
        roomQuery = roomQuery.eq("office_id", activeOfficeId);
    }

    const [roomsResult, officesResult, propertiesResult, landlordsResult, historyResult, tenantsResult] = await Promise.all([
        roomQuery,
        supabase.from("offices").select("id, office_name, name").eq("company_id", companyId),
        supabase.from("properties").select("*").eq("company_id", companyId),
        supabase.from("landlords").select("*").eq("company_id", companyId),
        db.from("room_status_history").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5000),
        db.from("tenants").select("id, full_name, previous_room_id, room_id, status, vacated_at, updated_at, company_id").eq("company_id", companyId).order("vacated_at", { ascending: false, nullsFirst: false }).limit(5000),
    ]);

    for (const result of [roomsResult, officesResult, propertiesResult, landlordsResult, historyResult, tenantsResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const rooms = ((roomsResult.data ?? []) as RoomRow[]).filter((room) => isVacantStatus(room.status));
    const offices = (officesResult.data ?? []) as OfficeRow[];
    const properties = (propertiesResult.data ?? []) as PropertyRow[];
    const landlords = (landlordsResult.data ?? []) as LandlordRow[];
    const histories = (historyResult.data ?? []) as Array<Record<string, unknown>>;
    const tenants = (tenantsResult.data ?? []) as Array<Record<string, unknown>>;

    const officeById = new Map(offices.map((office) => [office.id, office]));
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const landlordById = new Map(landlords.map((landlord) => [landlord.id, landlord]));
    const vacantHistoryByRoom = new Map<string, Record<string, unknown>>();
    for (const row of histories) {
        const roomId = String(row.room_id ?? "");
        if (!roomId || vacantHistoryByRoom.has(roomId)) continue;
        if (isVacantStatus(String(row.new_status ?? ""))) {
            vacantHistoryByRoom.set(roomId, row);
        }
    }
    const lastTenantByRoom = new Map<string, string>();
    for (const tenant of tenants) {
        const roomId = String(tenant.previous_room_id ?? tenant.room_id ?? "");
        if (!roomId || lastTenantByRoom.has(roomId)) continue;
        if (String(tenant.status ?? "").toLowerCase().includes("vacat") || tenant.previous_room_id) {
            lastTenantByRoom.set(roomId, String(tenant.full_name ?? "Previous tenant"));
        }
    }

    const items: VacantRoomItem[] = rooms.map((room) => {
        const property = room.property_id ? propertyById.get(room.property_id) ?? null : null;
        const office = room.office_id ? officeById.get(room.office_id) ?? null : null;
        const landlord = room.landlord_id ? landlordById.get(room.landlord_id) ?? null : null;
        const history = vacantHistoryByRoom.get(room.id);
        const vacantSince = typeof history?.created_at === "string" ? history.created_at.slice(0, 10) : room.updated_at?.slice(0, 10) ?? room.created_at?.slice(0, 10) ?? null;
        const rent = amount(room.monthly_rent);
        const rate = commissionRate(landlord, defaultCommissionRate);
        const mode = commissionMode(landlord);

        return {
            id: room.id,
            roomNumber: room.room_number ?? "Unnumbered",
            officeId: room.office_id,
            officeName: officeName(office),
            propertyName: propertyLabel(property),
            location: propertyLocation(property),
            landlordId: room.landlord_id,
            landlordName: landlord?.full_name ?? "No landlord",
            monthlyRent: rent,
            vacantSince,
            daysVacant: daysBetween(vacantSince),
            lastTenantName: lastTenantByRoom.get(room.id) ?? null,
            status: room.status ?? "vacant",
            commissionRate: rate,
            commissionMode: mode,
            companyProfitLost: Math.round(rent * rate / 100),
            yearlyProjectedLoss: Math.round(rent * 12),
            suggestedActions: suggestVacancyActions({
                daysVacant: daysBetween(vacantSince),
                monthlyRent: rent,
                companyProfitLost: Math.round(rent * rate / 100),
            }),
            rawRoom: room,
        };
    });
    const assistant = buildAssistant(items);

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        isAdmin,
        canFilterOffices: canViewAllOffices,
        canManageOccupancy: !isCollector && (context.isCompanyAdmin || hasPermission(context, "properties.manage") || hasPermission(context, "collections.manage") || hasPermission(context, "landlords.manage")),
        offices: offices.map((office) => ({ id: office.id, name: officeName(office) })).sort((a, b) => a.name.localeCompare(b.name)),
        landlords: landlords.map((landlord) => ({ id: landlord.id, name: landlord.full_name ?? "No landlord" })).sort((a, b) => a.name.localeCompare(b.name)),
        locations: [...new Set(items.map((item) => item.location).filter(Boolean))].sort(),
        rooms: items,
        assistant,
        kpis: buildKpis(items),
        generatedAt: new Date().toISOString(),
    };
}

function buildKpis(items: VacantRoomItem[]): VacantRoomsKpis {
    const officeCounts = new Map<string, number>();
    for (const item of items) {
        officeCounts.set(item.officeName, (officeCounts.get(item.officeName) ?? 0) + 1);
    }
    const officeWithMostVacantRooms = [...officeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No vacancies";
    const totalMonthlyRentLost = items.reduce((total, item) => total + item.monthlyRent, 0);
    const totalCompanyProfitLost = items.reduce((total, item) => total + item.companyProfitLost, 0);
    return {
        totalVacantRooms: items.length,
        totalMonthlyRentLost,
        totalCompanyCollectionsLost: totalMonthlyRentLost,
        totalCompanyProfitLost,
        averageDaysVacant: items.length ? Math.round(items.reduce((total, item) => total + item.daysVacant, 0) / items.length) : 0,
        highestVacantRentLoss: items.reduce((max, item) => Math.max(max, item.monthlyRent), 0),
        officeWithMostVacantRooms,
    };
}

function suggestVacancyActions(input: { daysVacant: number; monthlyRent: number; companyProfitLost: number }) {
    const actions = new Set<string>();
    actions.add("Call potential tenant");
    actions.add("Assign tenant");
    if (input.daysVacant >= 2) actions.add("WhatsApp available room list");
    if (input.daysVacant >= 7) actions.add("Promote room");
    if (input.daysVacant >= 14) actions.add("Visit property");
    if (input.daysVacant >= 30) actions.add("Notify landlord");
    if (input.daysVacant >= 45 || input.monthlyRent >= 500_000) actions.add("Escalate to Admin");
    if (input.daysVacant >= 60) actions.add("Reduce rent recommendation");
    if (input.companyProfitLost >= 100_000) actions.add("Promote room");
    return [...actions];
}

function buildAssistant(items: VacantRoomItem[]): VacancyAssistant {
    const byDays = [...items].sort((a, b) => b.daysVacant - a.daysVacant || b.monthlyRent - a.monthlyRent);
    const byRent = [...items].sort((a, b) => b.monthlyRent - a.monthlyRent || b.daysVacant - a.daysVacant);
    const byProfit = [...items].sort((a, b) => b.companyProfitLost - a.companyProfitLost || b.monthlyRent - a.monthlyRent);
    const landlordGroups = groupLosses(items, "landlord");
    const officeGroups = groupLosses(items, "office");
    const lowRentLimit = percentile(items.map((item) => item.monthlyRent), 0.35);
    const highRentLimit = percentile(items.map((item) => item.monthlyRent), 0.75);
    const recentlyVacated = items.filter((item) => item.daysVacant <= 7).sort((a, b) => a.daysVacant - b.daysVacant).slice(0, 8);
    const stayedVacantTooLong = items.filter((item) => item.daysVacant >= 30).sort((a, b) => b.daysVacant - a.daysVacant).slice(0, 8);
    const marketFirst = [...new Map([...stayedVacantTooLong, ...byRent.slice(0, 6), ...byProfit.slice(0, 6)].map((item) => [item.id, item])).values()].slice(0, 10);
    const insights: VacancyAssistant["insights"] = [];

    if (byDays[0]) {
        insights.push({
            id: "longest-vacant",
            title: "Longest vacant room",
            message: `Room ${byDays[0].roomNumber} in ${byDays[0].officeName} has been vacant for ${byDays[0].daysVacant} days.`,
            severity: byDays[0].daysVacant >= 30 ? "critical" : "warning",
        });
    }
    if (byRent[0]) {
        insights.push({
            id: "highest-rent-vacancy",
            title: "Highest rent vacancy",
            message: `Room ${byRent[0].roomNumber} is tying up UGX ${Math.round(byRent[0].monthlyRent).toLocaleString()} monthly rent.`,
            severity: byRent[0].monthlyRent >= 500_000 ? "critical" : "warning",
        });
    }
    if (landlordGroups[0]) {
        insights.push({
            id: "landlord-loss-leader",
            title: "Landlord losing most",
            message: `${landlordGroups[0].landlordName} has ${landlordGroups[0].roomCount} vacant room(s), losing UGX ${Math.round(landlordGroups[0].monthlyLoss).toLocaleString()} monthly.`,
            severity: landlordGroups[0].roomCount >= 3 ? "critical" : "warning",
        });
    }
    if (officeGroups[0]) {
        insights.push({
            id: "office-vacancy-risk",
            title: "Highest office vacancy risk",
            message: `${officeGroups[0].officeName} has ${officeGroups[0].roomCount} vacant rooms and UGX ${Math.round(officeGroups[0].monthlyLoss).toLocaleString()} monthly collection exposure.`,
            severity: officeGroups[0].roomCount >= 5 ? "critical" : "warning",
        });
    }
    if (recentlyVacated.length) {
        insights.push({
            id: "recent-vacancies",
            title: "Recently vacated rooms",
            message: `${recentlyVacated.length} room${recentlyVacated.length === 1 ? " is" : "s are"} newly vacant and should be marketed quickly.`,
            severity: "info",
        });
    }
    if (stayedVacantTooLong.length) {
        insights.push({
            id: "stale-vacancies",
            title: "Vacant too long",
            message: `${stayedVacantTooLong.length} room${stayedVacantTooLong.length === 1 ? " has" : "s have"} stayed vacant for 30+ days.`,
            severity: "critical",
        });
    }

    return {
        roomsVacantLongest: byDays.slice(0, 8),
        highestRentRooms: byRent.slice(0, 8),
        landlordsLosingMost: landlordGroups.slice(0, 8),
        companyProfitLossLeaders: byProfit.slice(0, 8),
        officesWithHighestRisk: officeGroups.slice(0, 8),
        marketFirst,
        lowRentTenantRooms: items.filter((item) => item.monthlyRent <= lowRentLimit).sort((a, b) => a.monthlyRent - b.monthlyRent).slice(0, 8),
        highValueTenantRooms: items.filter((item) => item.monthlyRent >= highRentLimit).sort((a, b) => b.monthlyRent - a.monthlyRent).slice(0, 8),
        recentlyVacated,
        stayedVacantTooLong,
        insights,
    };
}

function percentile(values: number[], ratio: number) {
    const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
    return sorted[index];
}

function groupLosses(items: VacantRoomItem[], mode: "landlord"): Array<{ landlordId: string | null; landlordName: string; roomCount: number; monthlyLoss: number; companyProfitLoss: number }>;
function groupLosses(items: VacantRoomItem[], mode: "office"): Array<{ officeId: string | null; officeName: string; roomCount: number; monthlyLoss: number; companyProfitLoss: number; averageDaysVacant: number }>;
function groupLosses(items: VacantRoomItem[], mode: "landlord" | "office") {
    const map = new Map<string, any>();
    for (const item of items) {
        const id = mode === "landlord" ? item.landlordId : item.officeId;
        const name = mode === "landlord" ? item.landlordName : item.officeName;
        const key = id ?? name;
        const current = map.get(key) ?? (mode === "landlord"
            ? { landlordId: item.landlordId, landlordName: item.landlordName, roomCount: 0, monthlyLoss: 0, companyProfitLoss: 0 }
            : { officeId: item.officeId, officeName: item.officeName, roomCount: 0, monthlyLoss: 0, companyProfitLoss: 0, totalDays: 0, averageDaysVacant: 0 });
        current.roomCount += 1;
        current.monthlyLoss += item.monthlyRent;
        current.companyProfitLoss += item.companyProfitLost;
        if (mode === "office") {
            current.totalDays += item.daysVacant;
            current.averageDaysVacant = Math.round(current.totalDays / current.roomCount);
        }
        map.set(key, current);
    }
    return [...map.values()].sort((a, b) => b.monthlyLoss - a.monthlyLoss || b.roomCount - a.roomCount);
}

async function syncVacancyNotifications(input: { companyId: string; currentDate: string; db: DynamicDb; rooms: VacantRoomItem[] }) {
    if (!input.rooms.length) return;
    const { data: existing, error } = await input.db
        .from("notifications")
        .select("message")
        .eq("company_id", input.companyId)
        .ilike("message", "%[vacancy:%")
        .limit(10000);
    if (error) throw new Error(error.message);

    const existingKeys = new Set((existing ?? []).map((row: { message?: string | null }) => {
        const match = String(row.message ?? "").match(/\[vacancy:[^\]]+\]/);
        return match?.[0] ?? "";
    }).filter(Boolean));
    const inserts: Array<Record<string, unknown>> = [];

    function queue(room: VacantRoomItem, key: string, title: string, message: string, recipientType: "admin" | "office") {
        const fullKey = `[vacancy:${recipientType}:${room.officeId ?? "company"}:${key}]`;
        if (existingKeys.has(fullKey)) return;
        existingKeys.add(fullKey);
        inserts.push({
            channel: "in_app",
            company_id: input.companyId,
            created_at: new Date().toISOString(),
            delivery_status: "pending",
            is_read: false,
            message: `${message} ${fullKey}`,
            office_id: room.officeId,
            recipient_type: recipientType,
            title,
        });
    }

    for (const room of input.rooms) {
        const base = `${room.id}:${room.vacantSince ?? "unknown"}`;
        if (room.daysVacant <= 1) {
            queue(room, `${base}:became`, "Room became vacant", `Room ${room.roomNumber} in ${room.officeName} is now vacant.`, "office");
            queue(room, `${base}:became`, "Room became vacant", `Room ${room.roomNumber} in ${room.officeName} is now vacant.`, "admin");
        }
        for (const milestone of [7, 14, 30]) {
            if (room.daysVacant >= milestone) {
                queue(room, `${base}:${milestone}d`, `Room vacant ${milestone} days`, `Room ${room.roomNumber} has been vacant for ${room.daysVacant} days, losing UGX ${Math.round(room.monthlyRent).toLocaleString()} monthly.`, "office");
                queue(room, `${base}:${milestone}d`, `Room vacant ${milestone} days`, `Room ${room.roomNumber} in ${room.officeName} has been vacant for ${room.daysVacant} days.`, "admin");
            }
        }
        if (room.monthlyRent >= 500_000) {
            queue(room, `${base}:high-rent`, "High-rent room vacant", `Room ${room.roomNumber} is a high-rent vacancy worth UGX ${Math.round(room.monthlyRent).toLocaleString()} monthly.`, "office");
            queue(room, `${base}:high-rent`, "High-rent room vacant", `Room ${room.roomNumber} in ${room.officeName} is a high-rent vacancy.`, "admin");
        }
    }

    for (const landlord of groupLosses(input.rooms, "landlord")) {
        if (landlord.roomCount < 3) continue;
        const fullKey = `[vacancy:admin:landlord-risk:${landlord.landlordId ?? landlord.landlordName}:${input.currentDate}]`;
        if (existingKeys.has(fullKey)) continue;
        existingKeys.add(fullKey);
        inserts.push({
            channel: "in_app",
            company_id: input.companyId,
            created_at: new Date().toISOString(),
            delivery_status: "pending",
            is_read: false,
            message: `${landlord.landlordName} has ${landlord.roomCount} vacant rooms losing UGX ${Math.round(landlord.monthlyLoss).toLocaleString()} monthly. ${fullKey}`,
            office_id: null,
            recipient_type: "admin",
            title: "Landlord has many vacant rooms",
        });
    }
    for (const office of groupLosses(input.rooms, "office")) {
        if (office.roomCount < 5 && office.companyProfitLoss < 500_000) continue;
        const fullKey = `[vacancy:admin:office-risk:${office.officeId ?? office.officeName}:${input.currentDate}]`;
        if (existingKeys.has(fullKey)) continue;
        existingKeys.add(fullKey);
        inserts.push({
            channel: "in_app",
            company_id: input.companyId,
            created_at: new Date().toISOString(),
            delivery_status: "pending",
            is_read: false,
            message: `${office.officeName} has ${office.roomCount} vacant rooms and UGX ${Math.round(office.companyProfitLoss).toLocaleString()} commission/profit exposure. ${fullKey}`,
            office_id: office.officeId,
            recipient_type: "admin",
            title: "Office vacancy risk increasing",
        });
    }

    const totalProfitLoss = input.rooms.reduce((total, room) => total + room.companyProfitLost, 0);
    if (totalProfitLoss >= 1_000_000) {
        const fullKey = `[vacancy:admin:company-profit-loss:${input.currentDate}]`;
        if (!existingKeys.has(fullKey)) {
            inserts.push({
                channel: "in_app",
                company_id: input.companyId,
                created_at: new Date().toISOString(),
                delivery_status: "pending",
                is_read: false,
                message: `Current vacancies expose the company to UGX ${Math.round(totalProfitLoss).toLocaleString()} monthly commission/profit loss. ${fullKey}`,
                office_id: null,
                recipient_type: "admin",
                title: "Company profit loss increasing",
            });
        }
    }

    if (!inserts.length) return;
    const { error: insertError } = await input.db.from("notifications").insert(inserts.slice(0, 120));
    if (insertError) throw new Error(insertError.message);
}

function emptyData(isAdmin: boolean): VacantRoomsPageData {
    return {
        company: null,
        activeOffice: null,
        isAdmin,
        canFilterOffices: isAdmin,
        canManageOccupancy: false,
        offices: [],
        landlords: [],
        locations: [],
        rooms: [],
        assistant: buildAssistant([]),
        kpis: buildKpis([]),
        generatedAt: new Date().toISOString(),
    };
}
