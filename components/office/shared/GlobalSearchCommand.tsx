"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    AlertTriangle,
    Banknote,
    Bell,
    Bot,
    BriefcaseBusiness,
    Building2,
    CalendarCheck,
    FileText,
    Home,
    Landmark,
    Loader2,
    ReceiptText,
    Search,
    ShieldCheck,
    UserCog,
    UsersRound,
    Vault,
    WalletCards,
    X,
} from "lucide-react";

type SearchResult = {
    id: string;
    type: string;
    title: string;
    subtitle: string;
    details: string[];
    href: string;
    amount?: number;
};

type ResultGroup = {
    key: string;
    label: string;
    icon: React.ReactNode;
    items: SearchResult[];
};

type Props = {
    isAdmin: boolean;
    isCollector: boolean;
    isReadOnlyManager: boolean;
    offices: Array<{ id: string; name: string }>;
};

const pageCatalog = [
    { label: "Dashboard", href: "/office", keywords: "home overview dashboard command centre", icon: <Home size={16} /> },
    { label: "Payments Entry", href: "/office/admin/payments", officeHref: "/office/payments", collectorHref: "/office/collector/payments", keywords: "tenant payments rent collection room pay", icon: <Banknote size={16} /> },
    { label: "Receipt History", href: "/office/receipts", keywords: "receipts receipt history print verify", icon: <ReceiptText size={16} /> },
    { label: "Security Deposits", href: "/office/security-deposits", keywords: "deposit security tenant money", icon: <Vault size={16} /> },
    { label: "Collections", href: "/office/collections", collectorHref: "/office/collector/daily", keywords: "collections ledger cash receipts", icon: <WalletCards size={16} /> },
    { label: "Defaulters", href: "/office/admin/defaulters", officeHref: "/office/defaulters", collectorHref: "/office/collector/defaulters", keywords: "defaulters arrears outstanding debt tenants", icon: <AlertTriangle size={16} /> },
    { label: "Promise Centre", href: "/office/promises", collectorHref: "/office/collector/promises", keywords: "promises promise recovery due follow up", icon: <CalendarCheck size={16} /> },
    { label: "Expenses", href: "/office/expenses", keywords: "expenses landlord payment salary payment office costs", icon: <FileText size={16} /> },
    { label: "Notifications", href: "/office/notifications", keywords: "notifications approvals requests queue", icon: <Bell size={16} /> },
    { label: "Cash Banking", href: "/office/admin/cash-banking", officeHref: "/office/cash-banking", collectorHref: "/office/collector/banking", keywords: "cash banking bank deposits handover", icon: <Landmark size={16} /> },
    { label: "Instructions", href: "/office/instructions", collectorHref: "/office/collector/instructions", keywords: "instructions tasks work orders", icon: <FileText size={16} /> },
    { label: "Properties", href: "/office/properties", keywords: "properties property rooms portfolio", icon: <Building2 size={16} /> },
    { label: "Vacant Rooms", href: "/office/admin/vacant-rooms", officeHref: "/office/vacant-rooms", collectorHref: "/office/collector/vacant-rooms", keywords: "vacant rooms available occupancy", icon: <Building2 size={16} /> },
    { label: "Landlord Payments", href: "/office/landlord-payments", keywords: "landlord payments payables settlement", icon: <WalletCards size={16} /> },
    { label: "Landlords Portfolio", href: "/office/landlords", keywords: "landlords landlord portfolio properties rooms", icon: <UsersRound size={16} /> },
    { label: "Employees", href: "/office/admin/employees", officeHref: "/office/employees", keywords: "employees staff receptionist manager collector", icon: <UserCog size={16} /> },
    { label: "Attendance", href: "/office/admin/attendance", officeHref: "/office/attendance", keywords: "attendance check in staff", icon: <ShieldCheck size={16} /> },
    { label: "Reports", href: "/office/reports", keywords: "reports executive reporting statements spreadsheet", icon: <BriefcaseBusiness size={16} /> },
    { label: "Cash Position Centre", href: "/office/admin/cash-position", keywords: "cash position centre company cash", icon: <Landmark size={16} /> },
    { label: "Data Integrity", href: "/office/admin/data-integrity", keywords: "data integrity audit formula mismatch", icon: <ShieldCheck size={16} /> },
    { label: "AI Intelligence", href: "/office/ai", keywords: "ai intelligence insights assistant", icon: <Bot size={16} /> },
    { label: "Settings", href: "/admin/settings", keywords: "settings configuration", icon: <UserCog size={16} /> },
    { label: "Office Management", href: "/office/admin/office-merge", keywords: "office management merge offices", icon: <Building2 size={16} /> },
    { label: "Roles & Permissions", href: "/office/admin", keywords: "roles permissions admin administration", icon: <ShieldCheck size={16} /> },
];

const groupConfig = [
    { key: "pages", label: "Pages", icon: <FileText size={16} /> },
    { key: "rooms", label: "Rooms", icon: <Building2 size={16} /> },
    { key: "tenants", label: "Tenants", icon: <UsersRound size={16} /> },
    { key: "landlords", label: "Landlords", icon: <WalletCards size={16} /> },
    { key: "employees", label: "Employees", icon: <UserCog size={16} /> },
    { key: "payments", label: "Payments", icon: <Banknote size={16} /> },
    { key: "receipts", label: "Receipts", icon: <ReceiptText size={16} /> },
    { key: "expenses", label: "Expenses", icon: <FileText size={16} /> },
    { key: "promises", label: "Promises", icon: <CalendarCheck size={16} /> },
    { key: "vacantRooms", label: "Vacant Rooms", icon: <Building2 size={16} /> },
    { key: "securityDeposits", label: "Security Deposits", icon: <Vault size={16} /> },
    { key: "landlordPayments", label: "Landlord Payments", icon: <WalletCards size={16} /> },
];

function normalize(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

function pageHref(page: typeof pageCatalog[number], props: Props) {
    if (props.isCollector && page.collectorHref) return page.collectorHref;
    if (!props.isAdmin && !props.isReadOnlyManager && page.officeHref) return page.officeHref;
    return page.href;
}

function pageResults(query: string, props: Props): SearchResult[] {
    const term = normalize(query);
    const allowed = pageCatalog.filter((page) => {
        if (!props.isAdmin && !props.isReadOnlyManager && page.href.startsWith("/office/admin") && !page.officeHref) return false;
        if (!props.isCollector && page.collectorHref?.startsWith("/office/collector")) return true;
        return true;
    });
    const source = term
        ? allowed.filter((page) => `${page.label} ${page.keywords}`.toLowerCase().includes(term))
        : allowed.filter((page) => ["Dashboard", "Payments Entry", "Expenses", "Defaulters", "Notifications"].includes(page.label));
    return source.slice(0, 8).map((page) => ({
        id: `page:${page.label}`,
        type: "page",
        title: page.label,
        subtitle: "System page",
        details: [pageHref(page, props)],
        href: pageHref(page, props),
    }));
}

function flattenGroups(groups: ResultGroup[]) {
    return groups.flatMap((group) => group.items);
}

export default function GlobalSearchCommand(props: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [officeId, setOfficeId] = useState("");
    const [results, setResults] = useState<Record<string, SearchResult[]>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [recent, setRecent] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setRecent(JSON.parse(window.localStorage.getItem("ddumba-global-search-recent") || "[]"));
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                setOpen(true);
            }
            if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    useEffect(() => {
        if (!open) return;
        window.setTimeout(() => inputRef.current?.focus(), 40);
    }, [open]);

    useEffect(() => {
        if (!open || query.trim().length < 2) {
            setResults({});
            setLoading(false);
            setError(null);
            return;
        }
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        const debounce = window.setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const params = new URLSearchParams({ q: query.trim() });
                if (officeId) params.set("officeId", officeId);
                const response = await fetch(`/api/global-search?${params.toString()}`, { cache: "no-store", signal: controller.signal });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || "Search failed.");
                setResults(payload.results ?? {});
            } catch (searchError) {
                if (controller.signal.aborted) return;
                setError(searchError instanceof Error ? searchError.message : "Search could not be completed.");
                setResults({});
            } finally {
                window.clearTimeout(timeout);
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 220);
        return () => {
            window.clearTimeout(debounce);
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [officeId, open, query]);

    const groups = useMemo<ResultGroup[]>(() => {
        const pages = pageResults(query, props);
        return groupConfig
            .map((group) => ({
                ...group,
                items: group.key === "pages" ? pages : results[group.key] ?? [],
            }))
            .filter((group) => group.items.length > 0);
    }, [props, query, results]);
    const flat = flattenGroups(groups);
    const hasTyped = query.trim().length >= 2;
    const showEmpty = hasTyped && !loading && !error && flat.length === 0;

    useEffect(() => {
        setActiveIndex(0);
    }, [query, officeId, flat.length]);

    function remember(value: string) {
        const next = [value, ...recent.filter((item) => item !== value)].slice(0, 6);
        setRecent(next);
        window.localStorage.setItem("ddumba-global-search-recent", JSON.stringify(next));
    }

    function openResult(result: SearchResult) {
        remember(query.trim() || result.title);
        setOpen(false);
        setQuery("");
        router.push(result.href);
    }

    function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(flat.length - 1, 0)));
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
        }
        if (event.key === "Enter" && flat[activeIndex]) {
            event.preventDefault();
            openResult(flat[activeIndex]);
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mobile-nowrap inline-flex h-9 shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 text-xs font-black text-white shadow-sm transition hover:bg-white hover:text-slate-950 sm:h-10 sm:px-4"
            >
                <Search size={15} />
                <span className="hidden sm:inline">Search anything...</span>
                <span className="sm:hidden">Search</span>
                <kbd className="hidden rounded-lg bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300 sm:inline">⌘K</kbd>
            </button>

            {open ? (
                <div className="fixed inset-0 z-[220] bg-slate-950/80 p-3 backdrop-blur-md sm:p-6" onClick={() => setOpen(false)}>
                    <div
                        className="mx-auto max-h-[calc(100vh-2rem)] max-w-4xl overflow-hidden rounded-[30px] border border-white/10 bg-slate-950 text-white shadow-2xl shadow-black/50"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Search Ddumba OS"
                    >
                        <div className="border-b border-white/10 p-4 sm:p-5">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-wide text-cyan-200">Search Ddumba OS</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-400">Pages, rooms, tenants, landlords, employees, payments, receipts and operations.</p>
                                </div>
                                <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white hover:text-slate-950" aria-label="Close search">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-cyan-300/20 bg-white px-4 py-3 text-slate-950 shadow-xl shadow-cyan-950/20">
                                <Search size={20} className="text-slate-400" />
                                <input
                                    ref={inputRef}
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    onKeyDown={handleInputKeyDown}
                                    placeholder="Search pages, rooms, tenants, landlords, employees, payments, receipts..."
                                    className="min-w-0 flex-1 bg-transparent text-lg font-black outline-none placeholder:text-slate-400"
                                />
                                {loading ? <Loader2 size={18} className="animate-spin text-cyan-600" /> : null}
                            </div>
                            {props.isAdmin || props.isReadOnlyManager ? (
                                <label className="mt-3 block max-w-xs">
                                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Scope</span>
                                    <select value={officeId} onChange={(event) => setOfficeId(event.target.value)} className="mt-1 h-10 w-full rounded-2xl border border-white/10 bg-white/10 px-3 text-xs font-black text-white outline-none">
                                        <option value="">All Offices</option>
                                        {props.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                                    </select>
                                </label>
                            ) : null}
                        </div>

                        <div className="max-h-[62vh] overflow-auto p-4 sm:p-5">
                            {!query.trim() ? (
                                <section>
                                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Quick Links</p>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        {pageResults("", props).map((item) => <ResultButton key={item.id} item={item} onClick={() => openResult(item)} />)}
                                    </div>
                                    {recent.length ? (
                                        <div className="mt-5">
                                            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Recent Searches</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {recent.map((item) => (
                                                    <button key={item} type="button" onClick={() => setQuery(item)} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-slate-200 hover:bg-white hover:text-slate-950">{item}</button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </section>
                            ) : (
                                <section className="space-y-5">
                                    {error ? <div className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm font-bold text-rose-100">{error}</div> : null}
                                    {loading ? <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-sm font-black text-slate-300">Searching...</div> : null}
                                    {groups.map((group) => (
                                        <div key={group.key}>
                                            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide text-cyan-100">
                                                {group.icon}
                                                {group.label}
                                            </div>
                                            <div className="grid gap-2">
                                                {group.items.map((item) => {
                                                    const selected = flat[activeIndex]?.id === item.id;
                                                    return <ResultButton key={item.id} item={item} selected={selected} onClick={() => openResult(item)} />;
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                    {showEmpty ? (
                                        <div className="rounded-2xl border border-dashed border-white/15 bg-white/8 p-6 text-center">
                                            <p className="text-lg font-black">No results found</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-400">Try room number, tenant name, landlord, phone, receipt number or page name.</p>
                                        </div>
                                    ) : null}
                                </section>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

function ResultButton({ item, onClick, selected = false }: { item: SearchResult; onClick: () => void; selected?: boolean }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-2xl border p-3 text-left transition ${selected ? "border-cyan-300 bg-cyan-300/15 shadow-lg shadow-cyan-950/20" : "border-white/10 bg-white/8 hover:border-cyan-300/30 hover:bg-white/12"}`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-black text-white">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-300">{item.subtitle}</p>
                    {item.details.length ? <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-400">{item.details.join(" · ")}</p> : null}
                </div>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">{item.type.replaceAll("_", " ")}</span>
            </div>
        </button>
    );
}
