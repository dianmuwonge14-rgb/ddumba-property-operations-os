"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { runMonthlyLandlordPayableSnapshot } from "@/app/actions/landlords";
import type { LandlordItem, LandlordsPageData } from "@/lib/landlords/types";
import { EnterpriseKpiCard, PageHero, SearchBox } from "@/components/office/shared/EnterpriseUI";

type Props = {
    canAdminManage: boolean;
    canManage: boolean;
    canManageCollections: boolean;
    canPostPayments: boolean;
    data: LandlordsPageData;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

function monthLabel(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-UG", { month: "short", year: "numeric" }).format(date);
}

const CARD_PAGE_SIZE = 6;
const TABLE_PAGE_SIZE = 18;
const LandlordProfile = dynamic(() => import("./LandlordProfile"), {
    loading: () => <PanelLoading label="Loading landlord portfolio..." />,
});
const LandlordCommandPanel = dynamic(() => import("./LandlordCommandPanel"), {
    loading: () => <PanelLoading label="Loading landlord tools..." />,
});

export default function LandlordsConsole({ canAdminManage, canManage, canManageCollections, canPostPayments, data: initialData }: Props) {
    const [data, setData] = useState(initialData);
    const [search, setSearch] = useState(data.pagination.search);
    const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
    const [listOfficeFilter, setListOfficeFilter] = useState("all");
    const [listPaymentFilter, setListPaymentFilter] = useState("all");
    const [listLocationFilter, setListLocationFilter] = useState("all");
    const [listSort, setListSort] = useState("name_asc");
    const [listPage, setListPage] = useState(1);
    const [propertyFilter, setPropertyFilter] = useState("all");
    const [paymentFilter, setPaymentFilter] = useState("all");
    const userEditedSearchRef = useRef(false);
    const lastSubmittedSearchRef = useRef(initialData.pagination.search.trim().toLowerCase());
    const searchSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchAbortRef = useRef<AbortController | null>(null);
    const requestSeqRef = useRef(0);
    const lastUnsearchedDataRef = useRef(initialData);
    const [isSearching, setIsSearching] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchError, setSearchError] = useState("");
    const [isSnapshotPending, startSnapshotTransition] = useTransition();
    const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
    const debouncedSearch = useDebouncedValue(search, 125);
    const normalizedSearch = debouncedSearch.trim().toLowerCase();
    const currentPaymentMonthLabel = useMemo(
        () => new Intl.DateTimeFormat("en-UG", { month: "long", year: "numeric", timeZone: "Africa/Kampala" }).format(new Date()),
        [],
    );
    const listFilterOptions = useMemo(() => {
        const offices = new Map<string, string>();
        const locations = new Set<string>();
        for (const landlord of data.landlords) {
            for (const office of landlord.offices) {
                offices.set(office.id, office.office_name ?? office.name ?? "Office");
            }
            for (const location of landlord.locations) {
                if (location) locations.add(location);
            }
            for (const property of landlord.properties) {
                const label = property.property_name ?? property.name ?? property.village ?? null;
                if (label) locations.add(label);
            }
        }
        return {
            offices: [...offices.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
            locations: [...locations].sort((a, b) => a.localeCompare(b)),
        };
    }, [data.landlords]);
    const visibleLandlords = useMemo(() => {
        const searched = rankLocalLandlordMatches(data.landlords, normalizedSearch);
        return searched
            .filter((landlord) => {
                if (listOfficeFilter !== "all" && !landlord.offices.some((office) => office.id === listOfficeFilter)) return false;
                if (listPaymentFilter !== "all" && landlord.currentMonthPayable.status !== listPaymentFilter) return false;
                if (listLocationFilter !== "all") {
                    const locations = new Set([
                        ...landlord.locations,
                        ...landlord.properties.map((property) => property.property_name ?? property.name ?? property.village ?? ""),
                    ].filter(Boolean));
                    if (!locations.has(listLocationFilter)) return false;
                }
                return true;
            })
            .sort((a, b) => {
                if (listSort === "rent_high") return b.currentMonthPayable.fullRentRoll - a.currentMonthPayable.fullRentRoll || a.full_name.localeCompare(b.full_name);
                if (listSort === "rent_low") return a.currentMonthPayable.fullRentRoll - b.currentMonthPayable.fullRentRoll || a.full_name.localeCompare(b.full_name);
                if (listSort === "outstanding_high") return b.currentMonthPayable.outstandingAmount - a.currentMonthPayable.outstandingAmount || a.full_name.localeCompare(b.full_name);
                if (listSort === "net_high") return b.currentMonthPayable.netPayable - a.currentMonthPayable.netPayable || a.full_name.localeCompare(b.full_name);
                return a.full_name.localeCompare(b.full_name);
            });
    }, [data.landlords, listLocationFilter, listOfficeFilter, listPaymentFilter, listSort, normalizedSearch]);
    const localPageSize = viewMode === "cards" ? CARD_PAGE_SIZE : TABLE_PAGE_SIZE;
    const totalLocalPages = Math.max(1, Math.ceil(visibleLandlords.length / localPageSize));
    const safeListPage = Math.min(listPage, totalLocalPages);
    const landlordCards = visibleLandlords.slice((safeListPage - 1) * localPageSize, safeListPage * localPageSize);
    const showingStart = visibleLandlords.length ? (safeListPage - 1) * localPageSize + 1 : 0;
    const showingEnd = Math.min(safeListPage * localPageSize, visibleLandlords.length);
    const selectedLandlord = data.selectedLandlordId
        ? visibleLandlords.find((landlord) => landlord.id === data.selectedLandlordId) ?? null
        : null;
    const canLoadMoreServerLandlords = data.pagination.hasNextPage;
    const recoveryReminders = useMemo(() => {
        const landlordsWithVacantRooms = data.landlords.filter((landlord) => landlord.settlementEstimate.vacantRooms > 0);
        const landlordsWithRecovery = data.landlords.filter((landlord) => landlord.settlementEstimate.previousUnrecoveredTenantDebts > 0);
        return {
            landlordsWithVacantRooms,
            landlordsWithRecovery,
            totalMoneyAtRisk: data.landlords.reduce((total, landlord) => total + landlord.settlementEstimate.previousUnrecoveredTenantDebts, 0),
            totalRecoveryPending: data.landlords.reduce((total, landlord) => total + landlord.settlementEstimate.previousUnrecoveredTenantDebts, 0),
            totalRecoveredThisMonth: data.landlords.reduce((total, landlord) => total + landlord.totalRecoveredFromLandlord, 0),
            visible: [...new Map([...landlordsWithRecovery, ...landlordsWithVacantRooms].map((landlord) => [landlord.id, landlord])).values()].slice(0, 6),
        };
    }, [data.landlords]);
    const selectedLocationOptions = Array.from(
        new Set((selectedLandlord?.rooms ?? []).map((item) => item.property?.property_name ?? item.property?.name ?? item.property?.village ?? "Unassigned")),
    ).sort((a, b) => a.localeCompare(b));
    const settlementRefresh = useMemo(() => {
        const zeroPayableLandlords = data.landlords.filter((landlord) => landlord.portfolioRoomCount > 0 && landlord.totalExpectedMonthlyCollection > 0 && landlord.settlementEstimate.netLandlordPayable <= 0);
        const landlordsNeedingReview = data.landlords.filter((landlord) =>
            landlord.settlementEstimate.expectedGrossRent <= 0 ||
            landlord.settlementEstimate.occupiedRoomLines.some((room) => room.monthlyRent <= 0) ||
            landlord.settlementEstimate.vacantRoomLines.some((room) => room.reason.toLowerCase().includes("invalid")),
        );
        return {
            month: new Intl.DateTimeFormat("en-UG", { month: "long", year: "numeric", timeZone: "Africa/Kampala" }).format(new Date()),
            landlordsRecalculated: data.landlords.length,
            zeroPayableLandlords,
            landlordsNeedingReview,
            totalLandlordPayable: data.landlords.reduce((total, landlord) => total + landlord.settlementEstimate.netLandlordPayable, 0),
            totalCompanyCommission: data.landlords.reduce((total, landlord) => total + landlord.settlementEstimate.companyCommissionAmount, 0),
        };
    }, [data.landlords]);
    const unpaidPayables = useMemo(() => {
        const landlords = data.landlords.filter((landlord) => landlord.totalUnpaidMonthlyPayables > 0);
        const oldest = landlords
            .map((landlord) => landlord.oldestUnpaidMonth)
            .filter((value): value is string => Boolean(value))
            .sort()[0] ?? null;
        return {
            total: landlords.reduce((sum, landlord) => sum + landlord.totalUnpaidMonthlyPayables, 0),
            landlords,
            oldest,
        };
    }, [data.landlords]);

    useEffect(() => () => {
        if (searchSubmitTimerRef.current) clearTimeout(searchSubmitTimerRef.current);
        if (searchLoadingTimerRef.current) clearTimeout(searchLoadingTimerRef.current);
        searchAbortRef.current?.abort();
    }, []);

    useEffect(() => {
        setListPage(1);
    }, [normalizedSearch, listOfficeFilter, listPaymentFilter, listLocationFilter, listSort, viewMode]);

    const fetchLandlords = useCallback(async ({
        append,
        page,
        query,
        selectedLandlordId,
    }: {
        append?: boolean;
        page: number;
        query: string;
        selectedLandlordId?: string | null;
    }) => {
        searchAbortRef.current?.abort();
        const controller = new AbortController();
        const requestSeq = requestSeqRef.current + 1;
        requestSeqRef.current = requestSeq;
        searchAbortRef.current = controller;
        if (searchLoadingTimerRef.current) clearTimeout(searchLoadingTimerRef.current);
        searchLoadingTimerRef.current = setTimeout(() => setIsSearching(true), 300);
        setSearchError("");

        const params = new URLSearchParams();
        params.set("page", String(Math.max(1, page)));
        const normalizedQuery = query.trim();
        if (normalizedQuery) params.set("q", normalizedQuery);
        if (selectedLandlordId) params.set("landlord", selectedLandlordId);

        try {
            const response = await fetch(`/api/landlords?${params.toString()}`, {
                cache: "no-store",
                signal: controller.signal,
                headers: { "Cache-Control": "no-cache" },
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "Landlords could not be loaded.");
            if (requestSeqRef.current !== requestSeq || controller.signal.aborted) return;
            const nextData = payload.data as LandlordsPageData;
            setData((current) => {
                const updated = append ? mergeLandlordsPageData(current, nextData) : nextData;
                if (!query.trim()) lastUnsearchedDataRef.current = updated;
                return updated;
            });
        } catch (error) {
            if (controller.signal.aborted) return;
            setSearchError(error instanceof Error ? error.message : "Landlords could not be loaded.");
        } finally {
            if (searchLoadingTimerRef.current) {
                clearTimeout(searchLoadingTimerRef.current);
                searchLoadingTimerRef.current = null;
            }
            if (requestSeqRef.current === requestSeq && !controller.signal.aborted) setIsSearching(false);
        }
    }, []);

    const handleSearchChange = useCallback((value: string) => {
        if (value === search) return;
        userEditedSearchRef.current = true;
        setSearch(value);
        if (searchSubmitTimerRef.current) clearTimeout(searchSubmitTimerRef.current);
        if (searchLoadingTimerRef.current) clearTimeout(searchLoadingTimerRef.current);
        setSearchError("");
        setIsSearching(false);

        const normalizedValue = value.trim().toLowerCase();
        if (!normalizedValue) {
            searchAbortRef.current?.abort();
            lastSubmittedSearchRef.current = "";
            userEditedSearchRef.current = false;
            setData(lastUnsearchedDataRef.current);
            return;
        }

        if (normalizedValue.length < 2) return;

        searchSubmitTimerRef.current = setTimeout(() => {
            const submittedSearch = normalizedValue;
            if (submittedSearch === lastSubmittedSearchRef.current) {
                userEditedSearchRef.current = false;
                return;
            }
            lastSubmittedSearchRef.current = submittedSearch;
            userEditedSearchRef.current = false;
            void fetchLandlords({ page: 1, query: value });
        }, 150);
    }, [data.landlords, fetchLandlords, search]);

    const selectLandlord = useCallback((landlord: LandlordItem) => {
        setPropertyFilter("all");
        setPaymentFilter("all");
        void fetchLandlords({ page: data.pagination.page, query: search, selectedLandlordId: landlord.id });
    }, [data.pagination.page, fetchLandlords, search]);

    async function loadMoreLandlords(targetPage?: number) {
        if (!data.pagination.hasNextPage || isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            await fetchLandlords({ append: true, page: data.pagination.page + 1, query: search });
            if (targetPage) setListPage(targetPage);
        } finally {
            setIsLoadingMore(false);
        }
    }

    function goToPage(nextPage: number) {
        if (nextPage > totalLocalPages && data.pagination.hasNextPage) {
            void loadMoreLandlords(nextPage);
            return;
        }
        setListPage(Math.max(1, Math.min(totalLocalPages, nextPage)));
    }

    function runSnapshot() {
        startSnapshotTransition(async () => {
            try {
                setSnapshotMessage(null);
                const result = await runMonthlyLandlordPayableSnapshot();
                setSnapshotMessage(`Monthly payable snapshot complete: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed.`);
                await fetchLandlords({ page: data.pagination.page, query: search, selectedLandlordId: data.selectedLandlordId });
            } catch (error) {
                setSnapshotMessage(error instanceof Error ? error.message : "Unable to run monthly payable snapshot.");
            }
        });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Landlords Portfolio"
                    subtitle={`${data.office?.office_name ?? data.office?.name ?? "No active office selected"}${data.company ? ` · ${data.company.name}` : ""}`}
                    badge="Settlement Desk"
                >
                    <div className="enterprise-card px-6 py-4">
                        <p className="text-sm text-slate-500">Net Payable</p>
                        <p className="text-green-600 font-bold text-3xl">{money(data.kpis.netPayable)}</p>
                    </div>
                </PageHero>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-8 gap-5 mb-8">
                    <EnterpriseKpiCard title="Total Landlords" value={data.kpis.totalLandlords.toLocaleString()} tone="slate" trend="flat" trendLabel="register" progress={100} />
                    <EnterpriseKpiCard title="Active Landlords" value={data.kpis.activeLandlords.toLocaleString()} tone="green" trend="up" trendLabel="active" progress={data.kpis.totalLandlords ? Math.round((data.kpis.activeLandlords / data.kpis.totalLandlords) * 100) : 0} />
                    <EnterpriseKpiCard title="Properties Managed" value={data.kpis.propertiesManaged.toLocaleString()} tone="blue" trend="flat" trendLabel="portfolio" progress={85} />
                    <EnterpriseKpiCard title="Outstanding Settlements" value={money(data.kpis.outstandingSettlements)} tone="red" trend="down" trendLabel="settle" progress={data.kpis.outstandingSettlements ? 70 : 0} status="Risk" />
                    <EnterpriseKpiCard title="Settlements Due" value={data.kpis.settlementsDue.toLocaleString()} tone="orange" trend="flat" trendLabel="due" progress={data.kpis.settlementsDue ? 62 : 0} />
                    <EnterpriseKpiCard title="Collection Value" value={money(data.kpis.collectionValue)} tone="blue" trend="up" trendLabel="gross" progress={78} />
                    <EnterpriseKpiCard title="Net Payable" value={money(data.kpis.netPayable)} tone="slate" trend="flat" trendLabel="payable" progress={72} />
                    <EnterpriseKpiCard
                        title="Unpaid Landlords"
                        value={money(unpaidPayables.total)}
                        tone="red"
                        trend="down"
                        trendLabel={`${unpaidPayables.landlords.length} landlords`}
                        progress={unpaidPayables.total ? 80 : 0}
                        status={unpaidPayables.oldest ? `Oldest ${monthLabel(unpaidPayables.oldest)}` : "Clear"}
                    />
                </div>

                {canAdminManage ? (
                    <div className="enterprise-panel mb-6 p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wide text-blue-600">Monthly Settlement Refresh</p>
                                <h2 className="mt-1 text-xl font-black text-slate-950">{settlementRefresh.month}</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-500">Live recalculation from rooms, rent, commission, vacant status, and recovery deductions.</p>
                                {snapshotMessage ? <p className="mt-2 text-sm font-black text-blue-700">{snapshotMessage}</p> : null}
                            </div>
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                                <SummaryTile label="Recalculated" value={settlementRefresh.landlordsRecalculated.toLocaleString()} />
                                <SummaryTile label="Zero Payable" value={settlementRefresh.zeroPayableLandlords.length.toLocaleString()} tone="text-amber-700" />
                                <SummaryTile label="Review" value={settlementRefresh.landlordsNeedingReview.length.toLocaleString()} tone="text-red-700" />
                                <SummaryTile label="Payable" value={money(settlementRefresh.totalLandlordPayable)} tone="text-emerald-700" />
                                <SummaryTile label="Commission" value={money(settlementRefresh.totalCompanyCommission)} tone="text-blue-700" />
                                <button
                                    type="button"
                                    disabled={isSnapshotPending}
                                    onClick={runSnapshot}
                                    className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSnapshotPending ? "Running..." : "Run Snapshot"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className="enterprise-panel mb-6 overflow-hidden">
                    <div className="border-b border-slate-200 bg-slate-950 p-5 text-white">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wide text-amber-300">Recovery Reminder Dashboard</p>
                                <h2 className="mt-1 text-2xl font-black">Landlord payment controls</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-300">
                                    Vacant rooms are excluded from payable, and vacated tenant debts reduce future landlord settlements.
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                                <DarkSummary label="Vacant room landlords" value={recoveryReminders.landlordsWithVacantRooms.length.toLocaleString()} />
                                <DarkSummary label="Recovery pending" value={money(recoveryReminders.totalRecoveryPending)} />
                                <DarkSummary label="Money at risk" value={money(recoveryReminders.totalMoneyAtRisk)} />
                            </div>
                        </div>
                    </div>
                    {recoveryReminders.visible.length === 0 ? (
                        <div className="p-5">
                            <p className="font-bold text-slate-700">No landlord recovery reminders are currently active.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
                            {recoveryReminders.visible.map((landlord) => (
                                <button
                                    key={landlord.id}
                                    type="button"
                                    onClick={() => selectLandlord(landlord)}
                                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-black text-slate-950">{landlord.full_name}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">
                                                {landlord.settlementEstimate.vacantRooms} vacant · {money(landlord.settlementEstimate.previousUnrecoveredTenantDebts)} recovery due
                                            </p>
                                        </div>
                                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">
                                            Review
                                        </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <CompactLine label="Net payable" value={money(landlord.settlementEstimate.netLandlordPayable)} />
                                        <CompactLine label="Carry fwd" value={money(landlord.settlementEstimate.carriedForwardRecoveryBalance)} tone="text-red-700" />
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="enterprise-panel p-5 mb-6">
                    <div className="-mx-5 -mt-5 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <h2 className="text-xl font-black text-slate-950">Landlord Search</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    Search by landlord name, room number, phone number, or office.
                                </p>
                            </div>
                            <div className="w-full lg:max-w-xl">
                                <SearchBox value={search} onChange={handleSearchChange} placeholder="Search landlord, room, phone, or office..." />
                                <div className="mt-2 min-h-5">
                                    {isSearching ? (
                                        <p className="text-xs font-bold text-blue-600">Checking full register...</p>
                                    ) : searchError ? (
                                        <p className="text-xs font-bold text-red-600">{searchError}</p>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 xl:grid-cols-[auto_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)_minmax(150px,1fr)] xl:items-end">
                            <div>
                                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">View</p>
                                <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                                    <ViewToggle active={viewMode === "cards"} onClick={() => setViewMode("cards")}>Cards</ViewToggle>
                                    <ViewToggle active={viewMode === "table"} onClick={() => setViewMode("table")}>Table</ViewToggle>
                                </div>
                            </div>
                            <ListFilterSelect
                                label="Office"
                                value={listOfficeFilter}
                                onChange={setListOfficeFilter}
                                options={[{ value: "all", label: "All offices" }, ...listFilterOptions.offices.map((office) => ({ value: office.id, label: office.name }))]}
                            />
                            <ListFilterSelect
                                label="Paid / Unpaid"
                                value={listPaymentFilter}
                                onChange={setListPaymentFilter}
                                options={[
                                    { value: "all", label: "All statuses" },
                                    { value: "paid", label: `${currentPaymentMonthLabel} Paid` },
                                    { value: "unpaid", label: `${currentPaymentMonthLabel} Unpaid` },
                                    { value: "partial", label: "Partially Paid" },
                                    { value: "snapshot_needed", label: "Snapshot Needed" },
                                ]}
                            />
                            <ListFilterSelect
                                label="Location / Property"
                                value={listLocationFilter}
                                onChange={setListLocationFilter}
                                options={[{ value: "all", label: "All locations" }, ...listFilterOptions.locations.map((location) => ({ value: location, label: location }))]}
                            />
                            <ListFilterSelect
                                label="Sort"
                                value={listSort}
                                onChange={setListSort}
                                options={[
                                    { value: "name_asc", label: "Landlord name" },
                                    { value: "rent_high", label: "Rent roll high to low" },
                                    { value: "rent_low", label: "Rent roll low to high" },
                                    { value: "outstanding_high", label: "Outstanding high to low" },
                                    { value: "net_high", label: "Net payable high to low" },
                                ]}
                            />
                        </div>
                    </div>

                    <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap gap-2">
                            <SummaryBadge label="Showing" value={`${showingStart}-${showingEnd} of ${visibleLandlords.length}`} />
                            <SummaryBadge label="Page" value={`${safeListPage} of ${totalLocalPages}`} />
                            {data.pagination.totalLandlords > visibleLandlords.length ? (
                                <SummaryBadge label="Loaded" value={`${data.landlords.length} of ${data.pagination.totalLandlords}`} />
                            ) : null}
                            <SummaryBadge label="Rooms" value={landlordCards.reduce((total, landlord) => total + landlord.portfolioRoomCount, 0).toLocaleString()} />
                            <SummaryBadge label="Monthly Rent Roll" value={money(landlordCards.reduce((total, landlord) => total + landlord.totalExpectedMonthlyCollection, 0))} />
                            <SummaryBadge label="Outstanding" value={money(landlordCards.reduce((total, landlord) => total + landlord.totalOutstandingBalance, 0))} tone="text-red-700" />
                        </div>
                        <PaginationControls
                            page={safeListPage}
                            totalPages={totalLocalPages}
                            hasPreviousPage={safeListPage > 1}
                            hasNextPage={safeListPage < totalLocalPages}
                            canLoadMore={canLoadMoreServerLandlords}
                            isLoadingMore={isLoadingMore}
                            onPageChange={goToPage}
                            onLoadMore={() => void loadMoreLandlords(totalLocalPages + 1)}
                        />
                    </div>

                    <div className="mt-4">
                        {visibleLandlords.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
                                <p className="font-bold text-slate-900">No landlord matched this search.</p>
                                <p className="mt-1 text-sm text-slate-500">Try the first letters of a landlord name or clear a filter.</p>
                            </div>
                        ) : viewMode === "cards" ? (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                                {landlordCards.map((landlord) => (
                                    <LandlordCard
                                        key={landlord.id}
                                        canAdminManage={canAdminManage}
                                        isSelected={selectedLandlord?.id === landlord.id}
                                        landlord={landlord}
                                        onSelect={selectLandlord}
                                    />
                                ))}
                            </div>
                        ) : (
                            <LandlordsTable
                                canAdminManage={canAdminManage}
                                landlords={landlordCards}
                                onSelect={selectLandlord}
                                selectedLandlordId={selectedLandlord?.id ?? null}
                            />
                        )}
                    </div>

                    <div className="mt-4 flex justify-end">
                        <PaginationControls
                            page={safeListPage}
                            totalPages={totalLocalPages}
                            hasPreviousPage={safeListPage > 1}
                            hasNextPage={safeListPage < totalLocalPages}
                            canLoadMore={canLoadMoreServerLandlords}
                            isLoadingMore={isLoadingMore}
                            onPageChange={goToPage}
                            onLoadMore={() => void loadMoreLandlords(totalLocalPages + 1)}
                        />
                    </div>
                </div>

                <div className="enterprise-panel p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Location / Property</p>
                            <select
                                value={propertyFilter}
                                onChange={(event) => setPropertyFilter(event.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
                            >
                                <option value="all">All locations</option>
                                {selectedLocationOptions.map((location) => (
                                    <option key={location} value={location}>{location}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Room Status</p>
                            <select
                                value={paymentFilter}
                                onChange={(event) => setPaymentFilter(event.target.value)}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
                            >
                                <option value="all">All rooms</option>
                                <option value="paid">Paid rooms</option>
                                <option value="partial">Partially paid rooms</option>
                                <option value="unpaid">Unpaid rooms</option>
                                <option value="vacant">Vacant rooms</option>
                            </select>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Visible Portfolio</p>
                            <p className="text-2xl font-black text-slate-900">
                                {selectedLandlord?.rooms.filter((item) => {
                                    const location = item.property?.property_name ?? item.property?.name ?? item.property?.village ?? "Unassigned";
                                    const locationMatch = propertyFilter === "all" || location === propertyFilter;
                                    const statusMatch = paymentFilter === "all" || item.paymentStatus === paymentFilter;
                                    return locationMatch && statusMatch;
                                }).length ?? 0} rooms
                            </p>
                        </div>
                    </div>
                </div>

                {selectedLandlord ? (
                    <LandlordProfile
                        canAdminManage={canAdminManage}
                        canManageCollections={canManageCollections}
                        canPostPayments={canPostPayments}
                        landlord={selectedLandlord}
                        officeOptions={data.roomAssignmentOptions}
                        propertyOptions={data.roomAssignmentOptions}
                        propertyFilter={propertyFilter}
                        paymentFilter={paymentFilter}
                        onSaved={() => fetchLandlords({ page: data.pagination.page, query: search, selectedLandlordId: data.selectedLandlordId })}
                    />
                ) : (
                    <div className="enterprise-panel p-8 text-center">
                        <h3 className="text-xl font-black text-slate-950">Portfolio not loaded yet</h3>
                        <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold text-slate-500">
                            Select “View Portfolio” on a landlord card to load room, tenant, settlement, and recovery details. This keeps the page fast while you search.
                        </p>
                    </div>
                )}

                <div className="mt-6">
                    <LandlordCommandPanel
                        canAdminManage={canAdminManage}
                        canManage={canManage}
                        selectedLandlord={selectedLandlord}
                        landlordOptions={data.landlords.map((landlord) => ({ id: landlord.id, name: landlord.full_name }))}
                        roomAssignmentOptions={data.roomAssignmentOptions}
                        unassignedProperties={data.unassignedProperties}
                        onSaved={() => fetchLandlords({ page: data.pagination.page, query: search, selectedLandlordId: data.selectedLandlordId })}
                    />
                </div>
            </div>
        </main>
    );
}

function PortfolioLoadingState() {
    return (
        <div className="enterprise-panel p-6">
            <div className="animate-pulse space-y-4">
                <div className="h-5 w-48 rounded-full bg-slate-200" />
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="h-24 rounded-2xl bg-slate-100" />
                    <div className="h-24 rounded-2xl bg-slate-100" />
                    <div className="h-24 rounded-2xl bg-slate-100" />
                </div>
                <div className="h-64 rounded-3xl bg-slate-100" />
            </div>
        </div>
    );
}

function DarkSummary({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-300">{label}</p>
            <p className="mt-1 text-sm font-black text-white">{value}</p>
        </div>
    );
}

function SummaryBadge({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}: </span>
            <span className={`text-xs font-black ${tone}`}>{value}</span>
        </div>
    );
}

function SummaryTile({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-sm font-black ${tone}`}>{value}</p>
        </div>
    );
}

function PaginationControls({
    canLoadMore,
    hasNextPage,
    hasPreviousPage,
    isLoadingMore,
    onLoadMore,
    onPageChange,
    page,
    totalPages,
}: {
    canLoadMore: boolean;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    isLoadingMore: boolean;
    onLoadMore: () => void;
    onPageChange: (page: number) => void;
    page: number;
    totalPages: number;
}) {
    return (
        <div className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm sm:w-auto sm:flex-row sm:items-center">
            <button
                type="button"
                disabled={!hasPreviousPage}
                onClick={() => onPageChange(page - 1)}
                className="whitespace-nowrap rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
                Previous
            </button>
            <span className="min-w-28 whitespace-nowrap px-2 text-center text-xs font-black text-slate-500">
                Page {page} of {totalPages}
            </span>
            <button
                type="button"
                disabled={!hasNextPage && !canLoadMore}
                onClick={() => onPageChange(page + 1)}
                className="whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
                Next
            </button>
            {canLoadMore ? (
                <button
                    type="button"
                    disabled={isLoadingMore}
                    onClick={onLoadMore}
                    className="whitespace-nowrap rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 sm:hidden"
                >
                    {isLoadingMore ? "Loading..." : "Show More Landlords"}
                </button>
            ) : null}
        </div>
    );
}

function ViewToggle({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl px-4 py-2 text-xs font-black transition ${active ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
        >
            {children}
        </button>
    );
}

function ListFilterSelect({
    label,
    onChange,
    options,
    value,
}: {
    label: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    value: string;
}) {
    return (
        <label className="block">
            <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-800 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            >
                {options.map((option) => (
                    <option key={`${label}:${option.value}`} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function LandlordsTable({
    canAdminManage,
    landlords,
    onSelect,
    selectedLandlordId,
}: {
    canAdminManage: boolean;
    landlords: LandlordItem[];
    onSelect: (landlord: LandlordItem) => void;
    selectedLandlordId: string | null;
}) {
    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[680px] overflow-auto">
                <table className="w-full min-w-[1500px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-950 text-xs uppercase tracking-wide text-slate-200">
                        <tr>
                            <th className="px-4 py-3">Landlord name</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3 text-right">Rooms</th>
                            <th className="px-4 py-3 text-right">Active rooms</th>
                            <th className="px-4 py-3 text-right">Vacant rooms</th>
                            <th className="px-4 py-3 text-right">Monthly rent roll</th>
                            <th className="px-4 py-3">Commission mode</th>
                            <th className="px-4 py-3 text-right">Commission rate</th>
                            <th className="px-4 py-3 text-right">Commission base</th>
                            <th className="px-4 py-3 text-right">Paid amount</th>
                            <th className="px-4 py-3 text-right">Outstanding amount</th>
                            <th className="px-4 py-3 text-right">Recovery deduction</th>
                            <th className="px-4 py-3 text-right">Net payable</th>
                            <th className="px-4 py-3">Current month status</th>
                            <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {landlords.map((landlord) => {
                            const selected = landlord.id === selectedLandlordId;
                            return (
                                <tr key={landlord.id} className={`border-b border-slate-100 ${selected ? "bg-blue-50" : "bg-white hover:bg-slate-50"}`}>
                                    <td className="px-4 py-3">
                                        <p className="font-black text-slate-950">{landlord.full_name ?? "Unnamed landlord"}</p>
                                        <p className="mt-1 text-xs font-bold text-slate-400">{landlord.status ?? "Active"}</p>
                                    </td>
                                    <td className="max-w-[260px] whitespace-normal px-4 py-3 text-xs font-black text-blue-700">{landlordOfficeText(landlord)}</td>
                                    <td className="px-4 py-3 text-right font-black text-slate-900">{landlord.portfolioRoomCount.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-black text-emerald-700">{landlord.settlementEstimate.occupiedRooms.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-black text-amber-700">{landlord.settlementEstimate.vacantRooms.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-black text-slate-950">{canAdminManage ? money(landlord.currentMonthPayable.fullRentRoll) : "Admin only"}</td>
                                    <td className="px-4 py-3 font-bold text-slate-600">{landlord.settlementEstimate.commissionCalculationMode === "occupied_room_based" ? "Occupied-Room-Based" : "Portfolio-Based"}</td>
                                    <td className="px-4 py-3 text-right font-black text-slate-900">{landlord.currentMonthPayable.commissionPercentage}%</td>
                                    <td className="px-4 py-3 text-right font-black text-blue-700">{money(landlord.currentMonthPayable.commissionBaseAmount)}</td>
                                    <td className="px-4 py-3 text-right font-black text-emerald-700">{money(landlord.currentMonthPayable.paidAmount)}</td>
                                    <td className="px-4 py-3 text-right font-black text-red-700">{money(landlord.currentMonthPayable.outstandingAmount)}</td>
                                    <td className="px-4 py-3 text-right font-black text-amber-700">{money(landlord.currentMonthPayable.recoveryDeduction)}</td>
                                    <td className="px-4 py-3 text-right font-black text-emerald-700">{money(landlord.currentMonthPayable.netPayable)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${paymentBadgeClass(landlord.currentMonthPayable.status)}`}>
                                            {landlord.currentMonthPayable.label}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <button
                                            type="button"
                                            onClick={() => onSelect(landlord)}
                                            className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-blue-800"
                                        >
                                            View Portfolio
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

const LandlordCard = memo(function LandlordCard({
    canAdminManage,
    isSelected,
    landlord,
    onSelect,
}: {
    canAdminManage: boolean;
    isSelected: boolean;
    landlord: LandlordItem;
    onSelect: (landlord: LandlordItem) => void;
}) {
    const officeText = landlordOfficeText(landlord);
    return (
        <div className={`flex h-full min-h-[180px] flex-col rounded-2xl border p-3 transition ${isSelected ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-blue-300"}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{landlord.full_name}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                        {landlord.status ?? "Active"}
                    </p>
                    <p className={`mt-1 text-[11px] font-black leading-snug break-words ${officeText.includes("Needs review") ? "text-amber-700" : "text-blue-700"}`}>
                        {officeText}
                    </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${paymentBadgeClass(landlord.currentMonthPayable.status)}`}>
                    {landlord.currentMonthPayable.label}
                </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                <MiniStat label="Rooms" value={landlord.portfolioRoomCount.toLocaleString()} />
                <MiniStat label="Occupied" value={landlord.settlementEstimate.occupiedRooms.toLocaleString()} tone="text-emerald-700" />
                <MiniStat label="Vacant" value={landlord.settlementEstimate.vacantRooms.toLocaleString()} tone="text-amber-700" />
            </div>
            <div className="mt-3 flex-1 space-y-1.5 text-xs">
                <CompactLine label="Rent Roll" value={canAdminManage ? money(landlord.currentMonthPayable.fullRentRoll) : "Admin only"} />
                <CompactLine label="Paid" value={money(landlord.currentMonthPayable.paidAmount)} tone="text-emerald-700" />
                <CompactLine label="Outstanding" value={money(landlord.currentMonthPayable.outstandingAmount)} tone="text-red-700" />
                <CompactLine label="Net Payable" value={money(landlord.currentMonthPayable.netPayable)} tone="text-emerald-700" />
                {landlord.currentMonthPayable.source === "live_fallback" ? (
                    <p className="rounded-xl bg-blue-50 px-3 py-2 text-[11px] font-black text-blue-800">
                        Snapshot needed: calculated live from rooms and commission.
                    </p>
                ) : null}
                {landlord.currentMonthPayable.netPayable <= 0 ? (
                    <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-black text-amber-800">
                        Zero reason: {zeroPayableReason(landlord)}
                    </p>
                ) : null}
            </div>
            <button
                onClick={() => onSelect(landlord)}
                className="mt-3 w-full rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-blue-800"
            >
                View Portfolio
            </button>
        </div>
    );
});

function landlordOfficeText(landlord: LandlordItem) {
    const officeNames = Array.from(new Set(landlord.offices.map((office) => office.office_name ?? office.name).filter(Boolean)));
    if (officeNames.length === 0) return "Office: Needs review";
    if (officeNames.length === 1) return `Office: ${officeNames[0]}`;
    return `Offices: ${officeNames.join(", ")}`;
}

function mergeLandlordsPageData(current: LandlordsPageData, next: LandlordsPageData): LandlordsPageData {
    const landlordById = new Map(current.landlords.map((landlord) => [landlord.id, landlord]));
    for (const landlord of next.landlords) landlordById.set(landlord.id, landlord);
    return {
        ...next,
        landlords: [...landlordById.values()],
    };
}

function CompactLine({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-slate-500">{label}:</span>
            <span className={`font-black ${tone}`}>{value}</span>
        </div>
    );
}

function MiniStat({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`text-xs font-black ${tone}`}>{value}</p>
        </div>
    );
}

function PanelLoading({ label }: { label: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-black text-slate-500 shadow-sm">
            {label}
        </div>
    );
}

function paymentBadgeClass(status: LandlordItem["currentMonthPayable"]["status"]) {
    if (status === "paid") return "bg-emerald-100 text-emerald-800";
    if (status === "partial") return "bg-blue-100 text-blue-800";
    if (status === "unpaid") return "bg-red-100 text-red-800";
    return "bg-amber-100 text-amber-800";
}

function zeroPayableReason(landlord: LandlordItem) {
    if (!Number.isFinite(landlord.settlementEstimate.companyCommissionRate)) return "missing commission data";
    if (landlord.portfolioRoomCount > 0 && landlord.settlementEstimate.expectedGrossRent <= 0) return "missing rent data";
    if (landlord.portfolioRoomCount > 0 && landlord.settlementEstimate.occupiedRooms === 0) return "all rooms not payable this month";
    const payableBeforeRecovery = Math.max(
        0,
        landlord.settlementEstimate.expectedGrossRent -
            landlord.settlementEstimate.companyCommissionAmount -
            landlord.settlementEstimate.emptyRoomDeductions,
    );
    if (landlord.settlementEstimate.previousUnrecoveredTenantDebts >= payableBeforeRecovery) return "deductions exceed payable";
    return "under review";
}

function searchableLandlordName(landlord: LandlordItem) {
    return normalizeLandlordName([
        landlord.full_name,
        landlord.phone,
        landlord.landlord_code,
        ...landlord.offices.map((office) => office.office_name ?? office.name),
        ...landlord.locations,
        ...landlord.properties.map((property) => property.property_name ?? property.name ?? property.village),
    ].filter(Boolean).join(" "));
}

function rankLocalLandlordMatches(landlords: LandlordItem[], search: string) {
    const query = normalizeLandlordName(search);
    if (!query) return landlords;

    const exact: LandlordItem[] = [];
    const startsWith: LandlordItem[] = [];
    const contains: LandlordItem[] = [];
    for (const landlord of landlords) {
        const name = normalizeLandlordName(landlord.full_name ?? "");
        const searchable = searchableLandlordName(landlord);
        if (name === query) exact.push(landlord);
        else if (name.startsWith(query) || searchable.split(" ").some((part) => part.startsWith(query))) startsWith.push(landlord);
        else if (searchable.includes(query)) contains.push(landlord);
    }
    return [...exact, ...startsWith, ...contains];
}

function normalizeLandlordName(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function useDebouncedValue<T>(value: T, delayMs: number) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timeout = window.setTimeout(() => setDebounced(value), delayMs);
        return () => window.clearTimeout(timeout);
    }, [delayMs, value]);
    return debounced;
}
