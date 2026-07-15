"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type NavigationMemoryContextValue = {
    clearCurrentDraft: (formId?: string) => void;
    discardCurrentDraft: () => void;
    hasUnsavedDraft: boolean;
    markSubmitted: (formId?: string) => void;
    previousRoute: string | null;
    rememberDraft: (formId: string, data: Record<string, unknown>) => void;
    restoreDraft: <T extends Record<string, unknown>>(formId: string, fallback: T) => T;
    smartBack: () => void;
};

type ProviderProps = {
    accountId?: string | null;
    children: React.ReactNode;
    companyId?: string | null;
    officeId?: string | null;
};

type StoredDraft = {
    dirty: boolean;
    fields: Record<string, string | boolean>;
    formId: string;
    route: string;
    savedAt: string;
};

type StoredRouteState = {
    currentRoute: string;
    draftIds: string[];
    filters?: Record<string, string>;
    pageNumber?: string | null;
    previousRoute: string | null;
    scrollX: number;
    scrollY: number;
    searchText?: string | null;
    selectedTab?: string | null;
    updatedAt: string;
};

const NavigationMemoryContext = createContext<NavigationMemoryContextValue | null>(null);

const TAB_ID_KEY = "ddumba:navigation:tab-id";
const PREVIOUS_ROUTE_KEY = "ddumba:navigation:previous-route";
const CURRENT_ROUTE_KEY = "ddumba:navigation:current-route";
const DRAFT_PREFIX = "ddumba:draft:v1";
const ROUTE_PREFIX = "ddumba:route-memory:v1";
const SENSITIVE_MATCHER = /(pin|password|passcode|otp|token|secret|service[_-]?role|api[_-]?key|credential)/i;

function canUseStorage() {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function safeGet(key: string) {
    if (!canUseStorage()) return null;
    try {
        return window.sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function safeSet(key: string, value: string) {
    if (!canUseStorage()) return;
    try {
        window.sessionStorage.setItem(key, value);
    } catch {
        // Session storage can be unavailable in strict browser privacy modes.
    }
}

function safeRemove(key: string) {
    if (!canUseStorage()) return;
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // Ignore storage cleanup failures.
    }
}

function parseJson<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function createId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getTabId() {
    const existing = safeGet(TAB_ID_KEY);
    if (existing) return existing;
    const next = createId();
    safeSet(TAB_ID_KEY, next);
    return next;
}

function normalizeRoute(pathname: string, search: string) {
    return `${pathname}${search ? `?${search}` : ""}`;
}

function routeMemoryKey(tabId: string, companyId: string, accountId: string, route: string) {
    return `${ROUTE_PREFIX}:${tabId}:${companyId}:${accountId}:${route}`;
}

function draftKey(tabId: string, companyId: string, accountId: string, officeId: string, route: string, formId: string) {
    return `${DRAFT_PREFIX}:${tabId}:${companyId}:${accountId}:${officeId}:${route}:${formId}`;
}

function elementIdentity(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, index: number) {
    return element.name || element.id || element.getAttribute("data-draft-field") || element.getAttribute("aria-label") || element.getAttribute("placeholder") || `${element.tagName.toLowerCase()}-${index}`;
}

function formIdentity(form: HTMLFormElement | null, route: string) {
    if (!form) return `page:${route}`;
    return form.getAttribute("data-draft-form") || form.id || form.getAttribute("name") || `form:${route}:${Array.from(document.forms).indexOf(form)}`;
}

function isSensitiveElement(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
    const type = element instanceof HTMLInputElement ? element.type.toLowerCase() : "";
    if (["password", "file", "hidden"].includes(type)) return true;
    const descriptor = [
        element.name,
        element.id,
        element.getAttribute("autocomplete"),
        element.getAttribute("aria-label"),
        element.getAttribute("placeholder"),
        element.getAttribute("data-sensitive"),
    ].join(" ");
    return SENSITIVE_MATCHER.test(descriptor);
}

function isDraftableElement(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return false;
    if (target.disabled) return false;
    if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.readOnly) return false;
    if (isSensitiveElement(target)) return false;
    if (target.closest("[data-no-draft='true']")) return false;
    return true;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string | boolean) {
    if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) {
        element.checked = Boolean(value);
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return;
    }
    const prototype = element instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : element instanceof HTMLSelectElement
            ? window.HTMLSelectElement.prototype
            : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    descriptor?.set?.call(element, String(value));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

function collectFormDraft(form: HTMLFormElement | null, route: string): StoredDraft | null {
    const container = form ?? document.body;
    const fields: Record<string, string | boolean> = {};
    const elements = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"));
    elements.forEach((element, index) => {
        if (!isDraftableElement(element)) return;
        const key = elementIdentity(element, index);
        if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) fields[key] = element.checked;
        else fields[key] = element.value;
    });
    const hasValue = Object.values(fields).some((value) => typeof value === "boolean" ? value : value.trim().length > 0);
    if (!hasValue) return null;
    return {
        dirty: true,
        fields,
        formId: formIdentity(form, route),
        route,
        savedAt: new Date().toISOString(),
    };
}

function restoreFormDraft(draft: StoredDraft) {
    const forms = Array.from(document.forms);
    const form = forms.find((candidate) => formIdentity(candidate, draft.route) === draft.formId) ?? null;
    const container = form ?? document.body;
    const elements = Array.from(container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"));
    elements.forEach((element, index) => {
        if (!isDraftableElement(element)) return;
        const key = elementIdentity(element, index);
        if (!(key in draft.fields)) return;
        setNativeValue(element, draft.fields[key]);
    });
}

function captureFilters() {
    const params = new URLSearchParams(window.location.search);
    const filters: Record<string, string> = {};
    params.forEach((value, key) => {
        if (/filter|search|query|office|page|tab|status|mode|month|date/i.test(key)) filters[key] = value;
    });
    return filters;
}

export function NavigationMemoryProvider({ accountId, children, companyId, officeId }: ProviderProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const route = normalizeRoute(pathname, searchParams.toString());
    const ids = useMemo(() => ({
        account: accountId ?? "anonymous",
        company: companyId ?? "company",
        office: officeId ?? "all-offices",
        tab: typeof window === "undefined" ? "server" : getTabId(),
    }), [accountId, companyId, officeId]);
    const [previousRoute, setPreviousRoute] = useState<string | null>(null);
    const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
    const currentDraftKeysRef = useRef<Set<string>>(new Set());
    const restoredRouteRef = useRef<string | null>(null);

    const routeKey = useMemo(() => routeMemoryKey(ids.tab, ids.company, ids.account, route), [ids.account, ids.company, ids.tab, route]);

    const rememberRoute = useCallback(() => {
        const state: StoredRouteState = {
            currentRoute: route,
            draftIds: Array.from(currentDraftKeysRef.current),
            filters: captureFilters(),
            pageNumber: new URLSearchParams(window.location.search).get("page"),
            previousRoute,
            scrollX: window.scrollX,
            scrollY: window.scrollY,
            searchText: new URLSearchParams(window.location.search).get("search") ?? new URLSearchParams(window.location.search).get("query"),
            selectedTab: new URLSearchParams(window.location.search).get("tab"),
            updatedAt: new Date().toISOString(),
        };
        safeSet(routeKey, JSON.stringify(state));
    }, [previousRoute, route, routeKey]);

    const rememberCurrentForms = useCallback(() => {
        const forms = Array.from(document.forms);
        const draftTargets = forms.length ? forms : [null];
        let foundDraft = false;
        draftTargets.forEach((form) => {
            const draft = collectFormDraft(form, route);
            if (!draft) return;
            const key = draftKey(ids.tab, ids.company, ids.account, ids.office, route, draft.formId);
            currentDraftKeysRef.current.add(key);
            safeSet(key, JSON.stringify(draft));
            foundDraft = true;
        });
        setHasUnsavedDraft(foundDraft);
        rememberRoute();
    }, [ids.account, ids.company, ids.office, ids.tab, rememberRoute, route]);

    const clearCurrentDraft = useCallback((formId = "all") => {
        if (formId === "all") {
            currentDraftKeysRef.current.forEach((key) => safeRemove(key));
            currentDraftKeysRef.current.clear();
        } else {
            const key = draftKey(ids.tab, ids.company, ids.account, ids.office, route, formId);
            safeRemove(key);
            currentDraftKeysRef.current.delete(key);
        }
        setHasUnsavedDraft(false);
        rememberRoute();
    }, [ids.account, ids.company, ids.office, ids.tab, rememberRoute, route]);

    const rememberDraft = useCallback((formId: string, data: Record<string, unknown>) => {
        const key = draftKey(ids.tab, ids.company, ids.account, ids.office, route, formId);
        currentDraftKeysRef.current.add(key);
        safeSet(key, JSON.stringify({
            dirty: true,
            fields: data,
            formId,
            route,
            savedAt: new Date().toISOString(),
        }));
        setHasUnsavedDraft(true);
        rememberRoute();
    }, [ids.account, ids.company, ids.office, ids.tab, rememberRoute, route]);

    const restoreDraft = useCallback(<T extends Record<string, unknown>>(formId: string, fallback: T) => {
        const key = draftKey(ids.tab, ids.company, ids.account, ids.office, route, formId);
        const draft = parseJson<{ fields?: Record<string, unknown> } | null>(safeGet(key), null);
        return { ...fallback, ...(draft?.fields ?? {}) } as T;
    }, [ids.account, ids.company, ids.office, ids.tab, route]);

    const discardCurrentDraft = useCallback(() => clearCurrentDraft("all"), [clearCurrentDraft]);
    const markSubmitted = useCallback((formId?: string) => clearCurrentDraft(formId ?? "all"), [clearCurrentDraft]);

    const smartBack = useCallback(() => {
        rememberCurrentForms();
        const previous = safeGet(PREVIOUS_ROUTE_KEY);
        if (previous && previous !== route) {
            window.history.back();
            return;
        }
        window.history.back();
    }, [rememberCurrentForms, route]);

    useEffect(() => {
        const lastCurrent = safeGet(CURRENT_ROUTE_KEY);
        if (lastCurrent && lastCurrent !== route) {
            safeSet(PREVIOUS_ROUTE_KEY, lastCurrent);
            setPreviousRoute(lastCurrent);
        } else {
            setPreviousRoute(safeGet(PREVIOUS_ROUTE_KEY));
        }
        safeSet(CURRENT_ROUTE_KEY, route);
        const restored = parseJson<StoredRouteState | null>(safeGet(routeKey), null);
        if (restored && restoredRouteRef.current !== route) {
            restoredRouteRef.current = route;
            window.setTimeout(() => {
                restored.draftIds.forEach((key) => {
                    const draft = parseJson<StoredDraft | null>(safeGet(key), null);
                    if (draft) {
                        currentDraftKeysRef.current.add(key);
                        restoreFormDraft(draft);
                    }
                });
                window.scrollTo(restored.scrollX ?? 0, restored.scrollY ?? 0);
                setHasUnsavedDraft(restored.draftIds.length > 0);
            }, 80);
        }
    }, [route, routeKey]);

    useEffect(() => {
        const onInput = (event: Event) => {
            if (!isDraftableElement(event.target)) return;
            rememberCurrentForms();
        };
        const onPageHide = () => rememberCurrentForms();
        const onVisibilityChange = () => {
            if (document.visibilityState === "hidden") rememberCurrentForms();
        };
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            rememberCurrentForms();
            if (!hasUnsavedDraft) return;
            event.preventDefault();
            event.returnValue = "";
        };
        const onClick = (event: MouseEvent) => {
            const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
            if (!anchor || anchor.target || anchor.download || anchor.origin !== window.location.origin) return;
            if (!hasUnsavedDraft || anchor.hasAttribute("data-skip-unsaved-guard")) return;
            const action = window.confirm("You have unsaved changes. Leave this page and keep the draft?");
            if (!action) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            rememberCurrentForms();
        };
        document.addEventListener("input", onInput, true);
        document.addEventListener("change", onInput, true);
        document.addEventListener("click", onClick, true);
        window.addEventListener("pagehide", onPageHide);
        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("beforeunload", onBeforeUnload);
        window.history.scrollRestoration = "manual";
        return () => {
            document.removeEventListener("input", onInput, true);
            document.removeEventListener("change", onInput, true);
            document.removeEventListener("click", onClick, true);
            window.removeEventListener("pagehide", onPageHide);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, [hasUnsavedDraft, rememberCurrentForms]);

    const value = useMemo<NavigationMemoryContextValue>(() => ({
        clearCurrentDraft,
        discardCurrentDraft,
        hasUnsavedDraft,
        markSubmitted,
        previousRoute,
        rememberDraft,
        restoreDraft,
        smartBack,
    }), [clearCurrentDraft, discardCurrentDraft, hasUnsavedDraft, markSubmitted, previousRoute, rememberDraft, restoreDraft, smartBack]);

    return <NavigationMemoryContext.Provider value={value}>{children}</NavigationMemoryContext.Provider>;
}

export function useNavigationMemory() {
    const context = useContext(NavigationMemoryContext);
    if (!context) throw new Error("useNavigationMemory must be used inside NavigationMemoryProvider.");
    return context;
}

export function useFormDraft<T extends Record<string, unknown>>(formId: string, initialState: T) {
    const memory = useNavigationMemory();
    const [state, setState] = useState<T>(() => memory.restoreDraft(formId, initialState));
    const update = useCallback((patch: Partial<T>) => {
        setState((current) => {
            const next = { ...current, ...patch };
            memory.rememberDraft(formId, next);
            return next;
        });
    }, [formId, memory]);
    const clear = useCallback(() => {
        memory.clearCurrentDraft(formId);
        setState(initialState);
    }, [formId, initialState, memory]);
    return { clear, setState: update, state };
}

export function UnsavedChangesGuard({ className = "" }: { className?: string }) {
    const { discardCurrentDraft, hasUnsavedDraft } = useNavigationMemory();
    if (!hasUnsavedDraft) return null;
    return (
        <div className={`rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 shadow-sm ${className}`}>
            <span>You have unsaved changes. Draft is kept for this tab.</span>
            <button type="button" onClick={discardCurrentDraft} className="ml-3 rounded-full bg-amber-900 px-3 py-1 text-xs font-black uppercase text-white">
                Discard draft
            </button>
        </div>
    );
}

export function SmartBackButton({ className = "", label = "Back" }: { className?: string; label?: string }) {
    const { smartBack } = useNavigationMemory();
    return (
        <button type="button" onClick={smartBack} className={className || "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm"}>
            {label}
        </button>
    );
}

export function SmartBackLink({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    const { previousRoute } = useNavigationMemory();
    return (
        <Link href={previousRoute || "/office"} className={className} data-skip-unsaved-guard>
            {children}
        </Link>
    );
}
