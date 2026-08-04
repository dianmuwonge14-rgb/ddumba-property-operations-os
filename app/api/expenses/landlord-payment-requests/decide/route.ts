import { NextResponse } from "next/server";
import { decideLandlordPaidExpenseRequest } from "@/app/actions/expenses";

function responseStatusForMessage(message: string) {
    const normalized = message.toLowerCase();
    if (normalized.includes("permission")) return 403;
    if (normalized.includes("not found") || normalized.includes("no longer exists")) return 404;
    if (
        normalized.includes("already") ||
        normalized.includes("duplicate") ||
        normalized.includes("insufficient") ||
        normalized.includes("invalid") ||
        normalized.includes("required") ||
        normalized.includes("cancelled") ||
        normalized.includes("rejected") ||
        normalized.includes("failed")
    ) return 409;
    return 500;
}

export async function POST(request: Request) {
    try {
        const body = await request.json() as {
            comment?: string;
            decision?: "approved" | "rejected";
            requestId?: string;
        };
        if (!body.requestId) {
            return NextResponse.json({ error: "Landlord payment request id is required." }, { status: 400 });
        }
        if (body.decision !== "approved" && body.decision !== "rejected") {
            return NextResponse.json({ error: "Decision must be approved or rejected." }, { status: 400 });
        }

        const data = await decideLandlordPaidExpenseRequest({
            comment: body.comment ?? "",
            decision: body.decision,
            requestId: body.requestId,
        });
        return NextResponse.json({ data, ok: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to process landlord payment request.";
        console.error("Landlord payment decision failed:", message);
        return NextResponse.json({ error: message, ok: false }, { status: responseStatusForMessage(message) });
    }
}
