import { NextResponse } from "next/server";
import { loadPrintableReceipt, paperWidth } from "@/app/receipt-print/page";

export const dynamic = "force-dynamic";

const MM_TO_PT = 72 / 25.4;

type RouteProps = {
    params: Promise<{ receiptId: string }>;
};

function money(value: number | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function safe(value: string | null | undefined, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "No timestamp";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-UG", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: "Africa/Kampala",
        year: "numeric",
    });
}

function pdfEscape(value: string) {
    return value.replace(/[\\()]/g, (char) => `\\${char}`).replace(/\r?\n/g, " ");
}

function wrap(value: string, max = 24) {
    const text = value.replace(/\s+/g, " ").trim();
    if (!text) return [""];
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
        if (!current) {
            current = word;
        } else if (current.length + word.length + 1 <= max) {
            current += ` ${word}`;
        } else {
            lines.push(current);
            current = word;
        }
        while (current.length > max) {
            lines.push(current.slice(0, max));
            current = current.slice(max);
        }
    }
    if (current) lines.push(current);
    return lines;
}

function pairLines(label: string, value: string, max = 27) {
    const oneLine = `${label}: ${value}`;
    if (oneLine.length <= max) return [oneLine];
    return [label.toUpperCase(), ...wrap(value, max)];
}

function receiptTextLines(receipt: Awaited<ReturnType<typeof loadPrintableReceipt>>) {
    const snapshot = receipt.snapshot;
    const coverage = snapshot.coveragePeriods?.length
        ? snapshot.coveragePeriods.filter((period) => period.label && Number(period.amount) > 0)
        : snapshot.coveragePeriod
            ? [{ amount: snapshot.amountApplied, label: snapshot.coveragePeriod, type: "coverage" }]
            : [];

    const lines: Array<{ bold?: boolean; center?: boolean; divider?: boolean; size?: number; text: string }> = [
        { bold: true, center: true, size: 13, text: safe(snapshot.companyName, "DDUMBA OS") },
    ];
    if (safe(snapshot.companyContact)) lines.push({ center: true, size: 8, text: safe(snapshot.companyContact) });
    lines.push(
        { bold: true, center: true, size: 10, text: "TENANT PAYMENT RECEIPT" },
        { divider: true, text: "" },
        ...pairLines("Receipt", receipt.receiptNumber).map((text, index) => ({ bold: index === 0, text })),
        ...pairLines("Verify", receipt.verificationCode).map((text, index) => ({ bold: index === 0, text })),
        ...pairLines("Date", formatDateTime(snapshot.paymentDateTime)).map((text) => ({ text })),
        ...pairLines("Office", safe(snapshot.officeName, "Office")).map((text) => ({ text })),
        ...pairLines("Room", safe(snapshot.roomNumber, "No room")).map((text) => ({ text })),
        ...pairLines("Tenant", safe(snapshot.tenantName, "Unnamed tenant")).map((text) => ({ text })),
        ...pairLines("Phone", safe(snapshot.tenantPhone, "No phone")).map((text) => ({ text })),
        ...pairLines("Landlord", safe(snapshot.landlordName, "No landlord")).map((text) => ({ text })),
        { divider: true, text: "" },
        ...pairLines("Monthly rent", money(snapshot.monthlyRent)).map((text) => ({ text })),
        ...pairLines("Previous", money(snapshot.previousOutstandingBalance)).map((text) => ({ text })),
        ...pairLines("To outstanding", money(snapshot.amountAppliedToOutstanding ?? 0)).map((text) => ({ text })),
        ...pairLines("To current", money(snapshot.amountAppliedToCurrentRent ?? Math.max(0, snapshot.amountApplied - (snapshot.amountAppliedToOutstanding ?? 0)))).map((text) => ({ text })),
        ...pairLines("Advance rent", money(snapshot.advanceAmount ?? snapshot.advanceBalance)).map((text) => ({ text })),
        { divider: true, text: "" },
        ...pairLines("AMOUNT PAID", money(snapshot.amountPaid)).map((text) => ({ bold: true, size: 10, text })),
        ...pairLines("REMAINING", money(snapshot.remainingOutstandingBalance)).map((text) => ({ bold: true, size: 10, text })),
        ...pairLines("Advance bal", money(snapshot.advanceBalance)).map((text) => ({ text })),
        { divider: true, text: "" },
    );
    if (coverage.length) {
        lines.push({ bold: true, text: "COVERAGE" });
        coverage.forEach((period, index) => {
            lines.push({ bold: true, text: `Period ${index + 1}` });
            wrap(period.label, 27).forEach((text) => lines.push({ text }));
            lines.push({ text: `Amount: ${money(period.amount)}` });
        });
        lines.push({ divider: true, text: "" });
    }
    lines.push(
        ...pairLines("Method", safe(snapshot.paymentMethod?.replaceAll("_", " "), "Payment")).map((text) => ({ text })),
        ...pairLines("Reference", safe(snapshot.referenceNumber, "No reference")).map((text) => ({ text })),
        ...pairLines("Recorded by", safe(snapshot.recordedByName, "DDUMBA OS")).map((text) => ({ text })),
        ...pairLines("Approved by", safe(snapshot.approvedByName ?? snapshot.recordedByName, "DDUMBA OS")).map((text) => ({ text })),
        ...pairLines("Status", safe(snapshot.status, "issued")).map((text) => ({ text })),
    );
    if (safe(snapshot.notes)) pairLines("Notes", safe(snapshot.notes)).forEach((text) => lines.push({ text }));
    lines.push(
        { divider: true, text: "" },
        { center: true, size: 8, text: "QR verification:" },
        { center: true, size: 8, text: receipt.verificationCode },
        { center: true, text: "Thank you for your payment" },
        { center: true, size: 8, text: "DDUMBA OS" },
    );
    return lines;
}

function createReceiptPdf(receipt: Awaited<ReturnType<typeof loadPrintableReceipt>>, widthMm: 58 | 80) {
    const widthPt = widthMm * MM_TO_PT;
    const margin = widthMm === 58 ? 7 : 9;
    const maxLineWidth = widthPt - margin * 2;
    const lines = receiptTextLines(receipt);
    const lineHeight = widthMm === 58 ? 10 : 11;
    const topPadding = 10;
    const bottomPadding = 12;
    const heightPt = Math.max(120, topPadding + bottomPadding + lines.length * lineHeight);
    let y = heightPt - topPadding;
    const operations: string[] = ["0 0 0 rg", "1 w"];

    for (const line of lines) {
        if (line.divider) {
            y -= lineHeight * 0.35;
            operations.push(`${margin.toFixed(2)} ${y.toFixed(2)} m ${(widthPt - margin).toFixed(2)} ${y.toFixed(2)} l S`);
            y -= lineHeight * 0.65;
            continue;
        }
        const size = line.size ?? 9;
        const font = line.bold ? "F2" : "F1";
        const textWidthEstimate = Math.min(maxLineWidth, line.text.length * size * 0.48);
        const x = line.center ? (widthPt - textWidthEstimate) / 2 : margin;
        operations.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${pdfEscape(line.text)}) Tj ET`);
        y -= lineHeight;
    }

    const stream = operations.join("\n");
    const objects = [
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`,
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
        `6 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`,
    ];
    let body = "%PDF-1.4\n";
    const offsets = [0];
    for (const object of objects) {
        offsets.push(Buffer.byteLength(body, "utf8"));
        body += object;
    }
    const xrefOffset = Buffer.byteLength(body, "utf8");
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index <= objects.length; index += 1) {
        body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(body, "utf8");
}

export async function GET(request: Request, { params }: RouteProps) {
    const { receiptId } = await params;
    const url = new URL(request.url);
    const widthMm = paperWidth(url.searchParams.get("width") ?? url.searchParams.get("paper") ?? "58");
    const receipt = await loadPrintableReceipt(receiptId);
    const pdf = createReceiptPdf(receipt, widthMm);
    return new NextResponse(pdf, {
        headers: {
            "Cache-Control": "private, no-store",
            "Content-Disposition": `inline; filename="${receipt.receiptNumber}-${widthMm}mm.pdf"`,
            "Content-Type": "application/pdf",
        },
    });
}
