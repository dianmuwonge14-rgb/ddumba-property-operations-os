import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LandlordPortfolioAuditRow = {
    landlordName: string;
    landlordId: string | null;
    expectedRooms: number;
    currentRooms: number;
    missingRooms: string[];
    extraRooms: string[];
    expectedRentRoll: number;
    currentRentRoll: number;
    rentRollDifference: number;
    status: "reconciled" | "missing_rooms" | "extra_rooms" | "rent_roll_mismatch" | "review";
};

export type LandlordPortfolioAuditData = {
    generatedAt: string;
    totals: {
        landlords: number;
        reconciled: number;
        missingRooms: number;
        extraRooms: number;
        rentRollDifference: number;
    };
    alexCosta: LandlordPortfolioAuditRow | null;
    rows: LandlordPortfolioAuditRow[];
    reviewRooms: Array<{
        roomNumber: string;
        landlordName: string;
        officeName: string | null;
        monthlyRent: number;
        reason: string;
    }>;
};

type LooseDb = {
    from: (table: string) => {
        select: (columns: string) => QueryBuilder;
    };
};

type QueryBuilder = {
    eq: (column: string, value: string) => QueryBuilder;
    neq: (column: string, value: string) => QueryBuilder;
} & Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;

export async function getLandlordPortfolioAuditData(): Promise<LandlordPortfolioAuditData> {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) return emptyData();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;

    const [sourceResult, landlordsResult, roomsResult] = await Promise.all([
        db.from("landlord_portfolio_source_rooms").select("*").eq("company_id", context.activeCompany.id),
        db.from("landlords").select("*").eq("company_id", context.activeCompany.id).neq("status", "archived"),
        db.from("rooms").select("*").eq("company_id", context.activeCompany.id),
    ]);
    for (const result of [sourceResult, landlordsResult, roomsResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const landlords = landlordsResult.data ?? [];
    const rooms = roomsResult.data ?? [];
    const sourceRows = sourceResult.data ?? [];
    const landlordByName = new Map(landlords.map((landlord) => [normalize(String(landlord.full_name ?? "")), landlord]));
    const roomsByLandlordId = groupBy(rooms.filter((room) => typeof room.landlord_id === "string"), (room) => String(room.landlord_id));
    const sourceByLandlordName = groupBy(sourceRows, (row) => normalize(String(row.landlord_name ?? "")));
    const sourceRoomKeys = new Set(sourceRows.map((row) => `${normalize(String(row.landlord_name ?? ""))}::${normalize(String(row.room_number ?? ""))}`));

    const rows: LandlordPortfolioAuditRow[] = Array.from(sourceByLandlordName.entries()).map(([normalizedLandlordName, expectedRows]) => {
        const landlord = landlordByName.get(normalizedLandlordName) ?? null;
        const currentRooms = landlord ? roomsByLandlordId.get(String(landlord.id)) ?? [] : [];
        const currentRoomNumbers = new Set(currentRooms.map((room) => normalize(String(room.room_number ?? ""))));
        const expectedRoomNumbers = new Set(expectedRows.map((row) => normalize(String(row.room_number ?? ""))));
        const missingRooms = expectedRows
            .filter((row) => !currentRoomNumbers.has(normalize(String(row.room_number ?? ""))))
            .map((row) => String(row.room_number ?? "Room"));
        const extraRooms = currentRooms
            .filter((room) => !sourceRoomKeys.has(`${normalizedLandlordName}::${normalize(String(room.room_number ?? ""))}`))
            .map((room) => String(room.room_number ?? "Room"));
        const expectedRentRoll = expectedRows.reduce((total, row) => total + numeric(row.monthly_rent), 0);
        const currentRentRoll = currentRooms.reduce((total, room) => total + numeric(room.monthly_rent), 0);
        const rentRollDifference = currentRentRoll - expectedRentRoll;
        return {
            landlordName: String(expectedRows[0]?.landlord_name ?? landlord?.full_name ?? "Unknown landlord"),
            landlordId: landlord ? String(landlord.id) : null,
            expectedRooms: expectedRows.length,
            currentRooms: currentRooms.length,
            missingRooms,
            extraRooms,
            expectedRentRoll,
            currentRentRoll,
            rentRollDifference,
            status: statusFor({ landlord, missingRooms, extraRooms, rentRollDifference }),
        };
    }).sort((a, b) => {
        const priority = statusWeight(b.status) - statusWeight(a.status);
        return priority || Math.abs(b.rentRollDifference) - Math.abs(a.rentRollDifference);
    });

    const roomNumberSet = new Set(rooms.map((room) => normalize(String(room.room_number ?? ""))));
    const reviewRooms = sourceRows
        .filter((row) => !roomNumberSet.has(normalize(String(row.room_number ?? ""))))
        .map((row) => ({
            roomNumber: String(row.room_number ?? "Room"),
            landlordName: String(row.landlord_name ?? "Landlord"),
            officeName: typeof row.office_name === "string" ? row.office_name : null,
            monthlyRent: numeric(row.monthly_rent),
            reason: numeric(row.monthly_rent) <= 0
                ? "Missing in Supabase and workbook rent is zero; needs manual review."
                : "Missing in Supabase; property/location confidence is not high enough for automatic creation.",
        }))
        .slice(0, 80);

    return {
        generatedAt: new Date().toISOString(),
        totals: {
            landlords: rows.length,
            reconciled: rows.filter((row) => row.status === "reconciled").length,
            missingRooms: rows.reduce((total, row) => total + row.missingRooms.length, 0),
            extraRooms: rows.reduce((total, row) => total + row.extraRooms.length, 0),
            rentRollDifference: rows.reduce((total, row) => total + row.rentRollDifference, 0),
        },
        alexCosta: rows.find((row) => normalize(row.landlordName) === "alex costa") ?? null,
        rows,
        reviewRooms,
    };
}

function statusFor(input: { landlord: Record<string, unknown> | null; missingRooms: string[]; extraRooms: string[]; rentRollDifference: number }): LandlordPortfolioAuditRow["status"] {
    if (!input.landlord) return "review";
    if (input.missingRooms.length) return "missing_rooms";
    if (input.extraRooms.length) return "extra_rooms";
    if (Math.abs(input.rentRollDifference) > 1) return "rent_roll_mismatch";
    return "reconciled";
}

function statusWeight(status: LandlordPortfolioAuditRow["status"]) {
    if (status === "review") return 5;
    if (status === "missing_rooms") return 4;
    if (status === "extra_rooms") return 3;
    if (status === "rent_roll_mismatch") return 2;
    return 1;
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
    const map = new Map<string, T[]>();
    for (const row of rows) {
        const key = keyFn(row);
        map.set(key, [...(map.get(key) ?? []), row]);
    }
    return map;
}

function normalize(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function numeric(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function emptyData(): LandlordPortfolioAuditData {
    return {
        generatedAt: new Date().toISOString(),
        totals: { landlords: 0, reconciled: 0, missingRooms: 0, extraRooms: 0, rentRollDifference: 0 },
        alexCosta: null,
        rows: [],
        reviewRooms: [],
    };
}
