export type IntegrityDuplicateType =
    | "room_number"
    | "landlord_identity"
    | "tenant_identity"
    | "tenant_phone"
    | "payment_record";

export type IntegrityDuplicateRecord = {
    id: string;
    type: IntegrityDuplicateType;
    title: string;
    description: string;
    key: string;
    severity: "critical" | "high" | "medium" | "low";
    records: IntegrityEntityRecord[];
};

export type IntegrityEntityRecord = {
    id: string;
    label: string;
    status: string | null;
    officeName: string | null;
    details: string[];
    isArchived: boolean;
    isRecommendedSurvivor?: boolean;
};

export type ArchivedIntegrityRecord = {
    id: string;
    entityType: "room";
    label: string;
    officeName: string | null;
    archivedAt: string | null;
    duplicateOfId: string | null;
    comment: string | null;
};

export type DataIntegrityCentreData = {
    generatedAt: string;
    summary: {
        duplicateGroups: number;
        criticalGroups: number;
        archivedDuplicates: number;
        orphanWarnings: number;
    };
    duplicates: IntegrityDuplicateRecord[];
    archivedRecords: ArchivedIntegrityRecord[];
};
