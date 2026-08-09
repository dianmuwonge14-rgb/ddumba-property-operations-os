import { NextResponse } from "next/server";
import { createDesktopSession, requestUserAgent, verifyDesktopLogin } from "@/lib/offline/desktop-session";

function cors(response: NextResponse) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "content-type, authorization");
    return response;
}

export function OPTIONS() {
    return cors(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
    const userAgent = await requestUserAgent();
    const body = await request.json().catch(() => null) as {
        deviceId?: string;
        deviceName?: string;
        identifier?: string;
        pin?: string;
        platform?: string;
    } | null;
    const identifier = String(body?.identifier ?? "").trim();
    const secret = String(body?.pin ?? "").trim();
    const deviceId = String(body?.deviceId ?? "").trim();
    if (!deviceId) {
        return cors(NextResponse.json({ success: false, code: "DEVICE_ID_REQUIRED", message: "Desktop device ID is required." }, { status: 400 }));
    }

    try {
        const identity = await verifyDesktopLogin({ identifier, secret, userAgent });
        const loginStatus = identity?.login_status ?? (identity?.email ? "success" : "invalid");
        if (loginStatus === "merged_office") {
            return cors(NextResponse.json({ success: false, code: "MERGED_OFFICE", message: `This office was merged into ${identity?.office_name ?? "the new office"}. Please use the new office account.` }, { status: 403 }));
        }
        if (loginStatus === "locked" || identity?.locked) {
            return cors(NextResponse.json({ success: false, code: "ACCOUNT_LOCKED", message: "Account locked after 3 failed attempts. Please contact admin for password reset." }, { status: 423 }));
        }
        if (!identity?.email || loginStatus === "invalid" || loginStatus === "invalid_limit") {
            const attempts = Math.max(0, identity?.attempts_remaining ?? 2);
            return cors(NextResponse.json({ success: false, code: "INVALID_LOGIN", message: attempts ? `Wrong password. You have ${attempts} attempts remaining.` : "Account locked after 3 failed attempts. Please contact admin for password reset." }, { status: attempts ? 401 : 423 }));
        }

        const session = await createDesktopSession({
            deviceId,
            deviceName: String(body?.deviceName ?? "Desktop device"),
            identity,
            platform: String(body?.platform ?? "desktop"),
            userAgent,
        });
        return cors(NextResponse.json({
            success: true,
            desktopToken: session.token,
            expiresAt: session.expiresAt,
            bootstrap: {
                company: session.context.activeCompany,
                employeeId: (session.context.profile as unknown as { employee_id?: string | null } | null)?.employee_id ?? null,
                offices: session.context.offices,
                permissions: session.context.permissions,
                profile: {
                    accountType: (session.context.profile as unknown as { account_type?: string | null } | null)?.account_type ?? null,
                    fullName: session.context.profile?.full_name,
                    id: session.context.profile?.id,
                },
                roleKeys: session.context.roles.map((role) => role.role?.key).filter(Boolean),
                syncedAt: new Date().toISOString(),
            },
        }));
    } catch (error) {
        const message = error instanceof Error ? error.message : "Desktop login failed.";
        return cors(NextResponse.json({ success: false, code: "DESKTOP_LOGIN_FAILED", message }, { status: 500 }));
    }
}
