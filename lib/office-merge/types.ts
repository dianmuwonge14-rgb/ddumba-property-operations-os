export type OfficeMergeSourceOffice = {
    id: string;
    name: string;
    code: string;
    location: string;
    status: string;
    rentRoll: number;
    counts: Record<string, number>;
};

export type OfficeMergeHistoryRow = {
    id: string;
    newOfficeName: string;
    sourceOfficeNames: string[];
    status: string;
    createdAt: string;
    completedAt: string | null;
    affectedCounts: Record<string, number>;
};

export type OfficeMergeData = {
    companyName: string;
    offices: OfficeMergeSourceOffice[];
    history: OfficeMergeHistoryRow[];
    warnings: string[];
};
