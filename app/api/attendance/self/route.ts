import { NextResponse } from "next/server";
import { recordSelfAttendanceEvent } from "@/app/actions/attendance";

export async function POST(request: Request) {
    const body = await request.json().catch(() => null);
    const eventType = body?.eventType === "check_out" ? "check_out" : "check_in";

    try {
        const result = await recordSelfAttendanceEvent(eventType);
        return NextResponse.json({ ok: true, ...result });
    } catch (error) {
        return NextResponse.json(
            { ok: false, error: error instanceof Error ? error.message : "Attendance action failed." },
            { status: 400 },
        );
    }
}
