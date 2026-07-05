"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectionTenantResult } from "@/lib/collections/types";

type Props = {
    onTenantFound?: (tenant: CollectionTenantResult) => void;
};

function roomLabel(result: CollectionTenantResult) {
    const propertyName = result.property?.property_name ?? result.property?.name ?? "Property";
    const roomNumber = result.room?.room_number ?? "No room";
    return `${propertyName} · ${roomNumber}`;
}

export default function CollectionSearch({ onTenantFound }: Props) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CollectionTenantResult[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const requestSeqRef = useRef(0);
    const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const searchTenants = useCallback((forceQuery?: string) => {
        abortRef.current?.abort();
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);

        const requestSeq = requestSeqRef.current + 1;
        requestSeqRef.current = requestSeq;
        const searchValue = query.trim();
        const lookup = (forceQuery ?? searchValue).trim();
        if (lookup.length < 2) {
            setResults([]);
            setIsPending(false);
            setMessage(lookup.length ? "Enter at least 2 characters." : null);
            return;
        }

        const controller = new AbortController();
        abortRef.current = controller;
        loadingTimerRef.current = setTimeout(() => setIsPending(true), 180);
        setMessage(null);

        void (async () => {
            try {
                const response = await fetch(`/api/collections/search?q=${encodeURIComponent(lookup)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const payload = await response.json();

                if (controller.signal.aborted || requestSeqRef.current !== requestSeq) return;

                if (!response.ok) {
                    setMessage(payload.error ?? "Search failed.");
                    setResults([]);
                    return;
                }

                const nextResults = sortRoomMatchesFirst(payload.results ?? [], lookup);
                setResults(nextResults);
                if (!nextResults.length) {
                    setMessage("No tenant/room found.");
                    return;
                }

                const exactRoomMatch = findExactRoomMatch(nextResults, lookup);
                if (exactRoomMatch) {
                    onTenantFound?.(exactRoomMatch);
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                setMessage(error instanceof Error ? error.message : "Search failed.");
                setResults([]);
            } finally {
                if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
                if (requestSeqRef.current === requestSeq && !controller.signal.aborted) {
                    setIsPending(false);
                }
            }
        })();
    }, [onTenantFound, query]);

    useEffect(() => {
        const lookup = query.trim();
        if (!lookup) {
            abortRef.current?.abort();
            if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
            requestSeqRef.current += 1;
            setResults([]);
            setMessage(null);
            setIsPending(false);
            return;
        }

        const timer = setTimeout(() => searchTenants(lookup), 220);
        return () => clearTimeout(timer);
    }, [query, searchTenants]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
        };
    }, []);

    return (
        <div className="enterprise-panel p-5">
            <h2 className="mb-4 text-xl font-black">Tenant Search</h2>

            <div className="flex gap-2">
                <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") searchTenants();
                    }}
                    placeholder="Room number, tenant name, phone, or landlord"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold"
                />

                <button
                    onClick={() => searchTenants()}
                    disabled={isPending}
                    className="rounded-xl bg-blue-700 px-4 font-black text-white shadow-lg shadow-blue-100 disabled:opacity-60"
                >
                    {isPending ? "..." : "Refresh"}
                </button>
            </div>

            {message && <p className="text-sm text-slate-500 mt-3">{message}</p>}

            <div className="mt-5 space-y-3">
                {results.map((result) => (
                    <button
                        key={result.tenant.id}
                        onClick={() => onTenantFound?.(result)}
                        className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-500 hover:bg-blue-50 hover:shadow-md"
                    >
                        <div className="font-bold">{result.tenant.full_name ?? "Unnamed tenant"}</div>
                        <div className="text-sm text-slate-500">{roomLabel(result)}</div>
                        <div className="text-sm text-red-600 font-semibold mt-1">
                            Balance UGX {result.outstandingBalance.toLocaleString()}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

function normalize(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
}

function findExactRoomMatch(results: CollectionTenantResult[], query: string) {
    const lookup = normalize(query);
    return results.find((result) => normalize(result.room?.room_number) === lookup) ?? null;
}

function sortRoomMatchesFirst(results: CollectionTenantResult[], query: string) {
    const lookup = normalize(query);
    return [...results].sort((left, right) => scoreResult(left, lookup) - scoreResult(right, lookup));
}

function scoreResult(result: CollectionTenantResult, lookup: string) {
    const roomNumber = normalize(result.room?.room_number);
    const tenantName = normalize(result.tenant.full_name);
    const tenantPhone = normalize(result.tenant.phone);
    const landlordName = normalize(result.landlord?.full_name);

    if (roomNumber === lookup) return 0;
    if (roomNumber.startsWith(lookup)) return 1;
    if (tenantName.startsWith(lookup)) return 2;
    if (tenantPhone.startsWith(lookup)) return 3;
    if (landlordName.startsWith(lookup)) return 4;
    if (roomNumber.includes(lookup)) return 5;
    return 6;
}
