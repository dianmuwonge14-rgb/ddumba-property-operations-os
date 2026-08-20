"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote, Bell, Building2, FileText, Loader2, ReceiptText, Search, UserCog, UsersRound, WalletCards, X } from "lucide-react";

type SearchResult = {
    id: string;
    type: string;
    title: string;
    subtitle: string;
    details: string[];
    href: string;
    amount?: number;
};

type Props = {
    isAdmin: boolean;
    isCollector: boolean;
    isReadOnlyManager: boolean;
    offices: Array<{ id: string; name: string }>;
};

type PageItem = {
    label: string;
    href: string;
    officeHref?: string;
    collectorHref?: string;
    keywords: string;
};

const pageCatalog: PageItem[] = [
    { label: "Dashboard", href: "/office", keywords: "dashboard home overview" },
    { label: "Payments Entry", href: "/office/admin/payments", officeHref: "/office/payments", collectorHref: "/office/collector/payments", keywords: "payments entry rent tenant room collection" },
    { label: "Receipt History", href: "/office/receipts", keywords: "receipt history receipts print verify" },
    { label: "Security Deposits", href: "/office/security-deposits", keywords: "security deposits deposit" },
    { label: "Collections", href: "/office/collections", collectorHref: "/office/collector/daily", keywords: "collections ledger cash" },
    { label: "Defaulters", href: "/office/admin/defaulters", officeHref: "/office/defaulters", collectorHref: "/office/collector/defaulters", keywords: "defaulters arrears outstanding debt" },
    { label: "Promise Centre", href: "/office/promises", collectorHref: "/office/collector/promises", keywords: "promise promises centre recovery" },
    { label: "Expenses", href: "/office/expenses", keywords: "expenses landlord payment salary payment" },
    { label: "Notifications", href: "/office/notifications", keywords: "notifications approvals requests" },
    { label: "Cash Banking", href: "/office/admin/cash-banking", officeHref: "/office/cash-banking", collectorHref: "/office/collector/banking", keywords: "cash banking bank deposits" },
    { label: "Properties", href: "/office/properties", keywords: "properties property portfolio" },
    { label: "Vacant Rooms", href: "/office/admin/vacant-rooms", officeHref: "/office/vacant-rooms", collectorHref: "/office/collector/vacant-rooms", keywords: "vacant rooms available" },
    { label: "Landlord Payments", href: "/office/landlord-payments", keywords: "landlord payments settlement payable" },
    { label: "Landlords Portfolio", href: "/office/landlords", keywords: "landlords portfolio landlord" },
    { label: "Employees", href: "/office/admin/employees", officeHref: "/office/employees", keywords: "employees staff receptionist collector" },
    { label: "Attendance", href: "/office/admin/attendance", officeHref: "/office/attendance", keywords: "attendance check in" },
    { label: "Reports", href: "/office/reports", keywords: "reports executive reporting" },
    { label: "Data Integrity", href: "/office/admin/data-integrity", keywords: "data integrity audit mismatch" },
    { label: "AI Intelligence", href: "/office/ai", keywords: "ai intelligence assistant" },
    { label: "Settings", href: "/admin/settings", keywords: "settings configuration" },
];

function normalize(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

function compact(value: unknown) {
    return normalize(value).replace(/[^a-z0-9]+/g, "");
}

function pageHref(page: PageItem, props: Props) {
    if (props.isCollector && page.collectorHref) return page.collectorHref;
    if (!props.isAdmin && !props.isReadOnlyManager && page.officeHref) return page.officeHref;
    return page.href;
}

function allowedPages(props: Props) {
    return pageCatalog.filter((page) => {
        if (!props.isAdmin && !props.isReadOnlyManager && page.href.startsWith("/office/admin") && !page.officeHref) return false;
        return true;
    });
}

function pageMatches(query: string, props: Props) {
    const term = normalize(query);
    const compactTerm = compact(query);
    if (!term) return [];
    return allowedPages(props)
        .filter((page) => normalize(`${page.label} ${page.keywords}`).includes(term) || compact(page.label) === compactTerm)
        .map((page): SearchResult => ({
            id: `page:${page.label}`,
            type: "page",
            title: page.label,
            subtitle: "Open page",
            details: [],
            href: pageHref(page, props),
        }))
        .slice(0, 4);
}

function exactPageMatch(query: string, props: Props) {
    const term = normalize(query);
    const compactTerm = compact(query);
    return allowedPages(props).find((page) => normalize(page.label) === term || compact(page.label) === compactTerm);
}

function iconFor(type: string) {
    if (type === "room" || type === "vacant_room") return <Building2 size={14} />;
    if (type === "tenant" || type === "employee") return <UserCog size={14} />;
    if (type === "landlord" || type === "landlord_payment") return <WalletCards size={14} />;
    if (type === "payment") return <Banknote size={14} />;
    if (type === "receipt") return <ReceiptText size={14} />;
    if (type === "expense" || type === "page") return <FileText size={14} />;
    if (type === "promise") return <AlertTriangle size={14} />;
    return <Bell size={14} />;
}

export default function GlobalSearchCommand(props: Props) {
    const router = useRouter();
    const rootRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [query, setQuery] = useState("");
    const [focused, setFocused] = useState(false);
    const [results, setResults] = useState<Record<string, SearchResult[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [mobileActive, setMobileActive] = useState(false);

    const pages = useMemo(() => pageMatches(query, props), [props, query]);
    const liveItems = useMemo(() => {
        const order = ["rooms", "receipts", "payments", "tenants", "landlords", "employees", "vacantRooms", "expenses", "promises", "landlordPayments"];
        return order.flatMap((key) => results[key] ?? []).slice(0, 6);
    }, [results]);
    const exactRoomQuery = compact(query).replace(/^room/, "");
    const exactOccupiedRoom = liveItems.find((item) => item.type === "room" && compact(item.title).replace(/^room/, "") === exactRoomQuery);
    const exactVacantRoom = liveItems.find((item) => item.type === "vacant_room" && compact(item.title).replace(/^room/, "") === exactRoomQuery);
    const exactRoom = exactOccupiedRoom ?? exactVacantRoom;
    const suggestions = exactRoom ? [exactRoom] : [...pages, ...liveItems].slice(0, 6);
    const showPopover = focused && (mobileActive || query.trim().length > 0 || loading || Boolean(error));
    const showRoomMenu = Boolean(exactRoom);
    const isVacantRoom = exactRoom?.type === "vacant_room";
    const hasOutstanding = typeof exactRoom?.amount === "number" && exactRoom.amount > 0;

    useEffect(() => {
        const handleDocumentPointer = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setFocused(false);
                setMobileActive(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setFocused(true);
                window.setTimeout(() => inputRef.current?.focus(), 20);
            }
            if (event.key === "Escape") {
                setFocused(false);
                setMobileActive(false);
            }
        };
        document.addEventListener("mousedown", handleDocumentPointer);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleDocumentPointer);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            setResults({});
            setLoading(false);
            setError(null);
            return;
        }
        if (exactPageMatch(term, props)) {
            setResults({});
            setLoading(false);
            setError(null);
            return;
        }
        const controller = new AbortController();
        const debounce = window.setTimeout(async () => {
            const timeout = window.setTimeout(() => controller.abort(), 6000);
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/global-search?q=${encodeURIComponent(term)}`, { cache: "no-store", signal: controller.signal });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || "Search unavailable.");
                setResults(payload.results ?? {});
            } catch (searchError) {
                if (!controller.signal.aborted) {
                    setError("Search unavailable. Try again.");
                    setResults({});
                }
            } finally {
                window.clearTimeout(timeout);
                setLoading(false);
            }
        }, 250);
        return () => {
            window.clearTimeout(debounce);
            controller.abort();
            setLoading(false);
        };
    }, [props, query]);

    useEffect(() => setActiveIndex(0), [query, suggestions.length]);

    function navigate(href: string) {
        setFocused(false);
        setMobileActive(false);
        setQuery("");
        router.push(href);
        window.setTimeout(() => {
            const target = new URL(href, window.location.origin);
            const currentPath = `${window.location.pathname}${window.location.search}`;
            const targetPath = `${target.pathname}${target.search}`;
            if (currentPath !== targetPath) window.location.assign(href);
        }, 350);
    }

    function openRoomDestination(destination: "payments" | "defaulters" | "vacant" | "properties") {
        if (!exactRoom) return;
        const room = exactRoom.title.replace(/^Room\s+/i, "").trim() || query.trim();
        if (destination === "payments") navigate(`/office/admin/payments?room=${encodeURIComponent(room)}`);
        if (destination === "defaulters") navigate(`/office/admin/defaulters?search=${encodeURIComponent(room)}`);
        if (destination === "vacant") navigate(`/office/admin/vacant-rooms?room=${encodeURIComponent(room)}`);
        if (destination === "properties") navigate(`/office/properties?room=${encodeURIComponent(room)}`);
    }

    function openBestMatch(currentQuery: string) {
        const exact = exactPageMatch(currentQuery, props);
        if (exact) {
            navigate(pageHref(exact, props));
            return;
        }
        if (showRoomMenu) return;
        const selected = suggestions[activeIndex] ?? suggestions[0];
        if (selected) navigate(selected.href);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "Enter") {
            event.preventDefault();
            openBestMatch(event.currentTarget.value);
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(suggestions.length - 1, 0)));
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
        }
    }

    function handleKeyUp(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        openBestMatch(event.currentTarget.value);
    }

    return (
        <div ref={rootRef} className="relative shrink-0">
            <div className="hidden h-10 w-[min(29vw,320px)] min-w-[260px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.07] px-3 text-white shadow-sm ring-1 ring-transparent transition focus-within:border-cyan-300/30 focus-within:bg-white/[0.1] focus-within:ring-cyan-300/20 lg:flex">
                <Search size={15} className="shrink-0 text-slate-400" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setFocused(true);
                    }}
                    onFocus={() => setFocused(true)}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    placeholder="Search page, room, tenant..."
                    className="min-w-0 flex-1 bg-transparent text-xs font-black text-white outline-none placeholder:text-slate-400"
                />
                {loading ? <Loader2 size={14} className="shrink-0 animate-spin text-cyan-200" /> : query ? (
                    <button type="button" onClick={() => { setQuery(""); setResults({}); }} className="shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Clear search">
                        <X size={13} />
                    </button>
                ) : <kbd className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-black text-slate-400">⌘K</kbd>}
            </div>
            <button
                type="button"
                onClick={() => {
                    setFocused(true);
                    setMobileActive(true);
                    window.setTimeout(() => inputRef.current?.focus(), 20);
                }}
                className="grid h-9 w-9 place-items-center rounded-2xl border border-white/10 bg-white/10 text-white lg:hidden"
                aria-label="Search"
            >
                <Search size={16} />
            </button>
            {showPopover ? (
                <div className="absolute right-0 top-12 z-[220] w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-white shadow-2xl shadow-black/50">
                    <div className="border-b border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-cyan-100">
                        Search Ddumba OS
                    </div>
                    {mobileActive ? (
                        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 lg:hidden">
                            <Search size={14} className="text-slate-400" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                onKeyDown={handleKeyDown}
                                onKeyUp={handleKeyUp}
                                placeholder="Search page, room, tenant..."
                                className="min-w-0 flex-1 bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-500"
                            />
                        </div>
                    ) : null}
                    {showRoomMenu && exactRoom ? (
                        <div className="p-3">
                            <p className="text-sm font-black">{exactRoom.title} found</p>
                            <p className="mt-1 text-xs font-bold text-slate-400">{exactRoom.subtitle} · {exactRoom.details.slice(0, 2).join(" · ")}</p>
                            <div className="mt-3 grid grid-cols-2 gap-2">
                                {!isVacantRoom ? <button type="button" onClick={() => openRoomDestination("payments")} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950">Payments Entry</button> : null}
                                {!isVacantRoom && hasOutstanding ? <button type="button" onClick={() => openRoomDestination("defaulters")} className="rounded-xl bg-rose-400/15 px-3 py-2 text-xs font-black text-rose-100 ring-1 ring-rose-300/20">Defaulters</button> : null}
                                {isVacantRoom ? <button type="button" onClick={() => openRoomDestination("vacant")} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950">Vacant Rooms</button> : null}
                                <button type="button" onClick={() => openRoomDestination("properties")} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-slate-100">Properties</button>
                            </div>
                        </div>
                    ) : (
                        <div className="max-h-[360px] overflow-auto p-2">
                            {loading ? <p className="px-3 py-2 text-xs font-bold text-slate-400">Searching...</p> : null}
                            {error ? <p className="px-3 py-2 text-xs font-bold text-rose-200">{error}</p> : null}
                            {!loading && !error && suggestions.length === 0 && query.trim().length >= 2 ? (
                                <p className="px-3 py-3 text-xs font-bold text-slate-400">No result. Try room, tenant, landlord, phone, receipt or page.</p>
                            ) : null}
                            {suggestions.map((item, index) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => navigate(item.href)}
                                    className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition ${activeIndex === index ? "bg-cyan-300/15" : "hover:bg-white/10"}`}
                                >
                                    <span className="mt-0.5 text-cyan-100">{iconFor(item.type)}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-black">{item.title}</span>
                                        <span className="block truncate text-xs font-bold text-slate-400">{item.subtitle}</span>
                                        {item.details.length ? <span className="block truncate text-[11px] font-semibold text-slate-500">{item.details.slice(0, 2).join(" · ")}</span> : null}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}
