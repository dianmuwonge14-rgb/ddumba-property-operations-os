import { NextResponse } from "next/server";
import { businessErrorFromUnknown } from "@/lib/errors/business-errors";

export function businessErrorResponse(error: unknown, fallback?: string) {
    const businessError = businessErrorFromUnknown(error, fallback);
    console.error("business-error-response", {
        code: businessError.code,
        rawMessage: error instanceof Error ? error.message : String(error),
        reference: businessError.reference,
        status: businessError.status,
    });
    return NextResponse.json(businessError, { status: businessError.status });
}
