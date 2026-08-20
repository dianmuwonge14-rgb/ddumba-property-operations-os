"use client";

import { useEffect, useState } from "react";
import { DefaultersReportDocument, type DefaultersReportPayload } from "./DefaultersReportDocument";

type Props = {
    storageKey: string;
};

type LoadState =
    | { status: "loading" }
    | { status: "ready"; payload: DefaultersReportPayload }
    | { status: "error"; message: string };

export default function DefaultersPrintRouteClient({ storageKey }: Props) {
    const [state, setState] = useState<LoadState>({ status: "loading" });

    useEffect(() => {
        try {
            const rawPayload = window.localStorage.getItem(storageKey);
            if (!rawPayload) {
                setState({ status: "error", message: "The report payload was not found. Please reopen the Defaulters report and click Print A4 again." });
                return;
            }
            const payload = JSON.parse(rawPayload) as DefaultersReportPayload;
            setState({ status: "ready", payload });
        } catch (error) {
            setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load the report for printing." });
        }
    }, [storageKey]);

    useEffect(() => {
        if (state.status !== "ready") return;
        let cancelled = false;
        const printWhenReady = async () => {
            await document.fonts?.ready.catch(() => undefined);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            if (!cancelled) window.print();
        };
        void printWhenReady();
        return () => {
            cancelled = true;
        };
    }, [state]);

    if (state.status === "loading") {
        return <main className="print-route-status">Preparing Defaulters Report...</main>;
    }

    if (state.status === "error") {
        return <main className="print-route-status">{state.message}</main>;
    }

    return (
        <main className="print-route-page">
            <DefaultersReportDocument {...state.payload} />
            <style jsx global>{`
                @page {
                    size: A4 portrait;
                    margin: 10mm;
                }

                html,
                body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: #ffffff !important;
                }

                body {
                    min-height: auto !important;
                    display: block !important;
                }

                .print-route-page {
                    background: #ffffff;
                    color: #020617;
                    min-height: 100vh;
                    padding: 10mm 0;
                }

                .print-route-status {
                    min-height: 100vh;
                    display: grid;
                    place-items: center;
                    padding: 24px;
                    background: #ffffff;
                    color: #0f172a;
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    font-weight: 800;
                }

                .report-print-document {
                    width: 190mm;
                    margin: 0 auto;
                    background: #ffffff;
                    box-shadow: none;
                    transform: none !important;
                    zoom: 1 !important;
                    position: static !important;
                    overflow: visible !important;
                    height: auto !important;
                    max-height: none !important;
                }

                .landlord-report-heading,
                .landlord-report-summary {
                    break-inside: avoid;
                    page-break-inside: avoid;
                }

                .landlord-report-section {
                    break-inside: auto;
                    page-break-inside: auto;
                }

                .landlord-report-section thead {
                    display: table-header-group;
                }

                .landlord-report-section tr {
                    break-inside: avoid;
                    page-break-inside: avoid;
                }

                .landlord-report-section table {
                    width: 100%;
                    border-collapse: collapse;
                }

                @media screen {
                    .print-route-page {
                        background: #e2e8f0;
                    }

                    .report-print-document {
                        min-height: 297mm;
                        padding: 10mm;
                    }
                }

                @media print {
                    html,
                    body,
                    .print-route-page {
                        background: #ffffff !important;
                        width: auto !important;
                        min-height: auto !important;
                        display: block !important;
                        padding: 0 !important;
                        overflow: visible !important;
                    }

                    .report-print-document {
                        width: 190mm !important;
                        margin: 0 auto !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        box-shadow: none !important;
                        transform: none !important;
                        zoom: 1 !important;
                        position: static !important;
                        overflow: visible !important;
                        height: auto !important;
                        max-height: none !important;
                    }
                }
            `}</style>
        </main>
    );
}
