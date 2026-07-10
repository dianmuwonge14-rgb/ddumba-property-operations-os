import { NextResponse } from "next/server";
import { decideLandlordPaidExpenseRequest } from "@/app/actions/expenses";

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
        return NextResponse.json({ error: message, ok: false }, { status: 500 });
    }
}
