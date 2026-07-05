import type { Database } from "@/types/database.types";

export type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];
export type PromiseFollowupRow = Database["public"]["Tables"]["promise_followups"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type CollectionActionRow = Database["public"]["Tables"]["collection_actions"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];

export type PromiseStatus = "open" | "followed_up" | "fulfilled" | "broken" | "rescheduled";

export type PromiseItem = PromiseRow & {
    tenantName: string | null;
    tenantPhone: string | null;
    tenantBalance: number;
    roomNumber: string | null;
    officeName: string | null;
    createdByName: string | null;
    lastCollectionAmount: number | null;
    lastCollectionAt: string | null;
    followups: PromiseFollowupRow[];
    actionCount: number;
};

export type PromiseKpis = {
    dueToday: number;
    dueTomorrow: number;
    overdue: number;
    fulfilled: number;
    broken: number;
    recoveryRate: number;
};

export type PromiseCentreData = {
    kpis: PromiseKpis;
    ledger: PromiseItem[];
    dueToday: PromiseItem[];
    dueTomorrow: PromiseItem[];
    overdue: PromiseItem[];
    fulfilled: PromiseItem[];
    broken: PromiseItem[];
    recentFollowups: Array<PromiseFollowupRow & { tenantName: string | null }>;
};

export type PromiseTenantOption = {
    id: string;
    fullName: string;
    phone: string | null;
    roomId: string | null;
    roomNumber: string | null;
    landlordName: string | null;
    officeName: string | null;
    roomStatus: string | null;
    balance: number;
};

export type CreatePromiseInput = {
    tenantId: string;
    promisedAmount: number;
    promisedDate: string;
    notes?: string;
};

export type EditPromiseInput = {
    promiseId: string;
    promisedAmount: number;
    promisedDate: string;
    notes?: string;
};

export type PromiseFollowupInput = {
    promiseId: string;
    actionType: string;
    outcome?: string;
    notes?: string;
};

export type PromiseStateInput = {
    promiseId: string;
    notes?: string;
};

export type ReschedulePromiseInput = {
    promiseId: string;
    promisedDate: string;
    notes?: string;
};
