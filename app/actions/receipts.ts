"use server";

import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { getPaymentReceipt, logReceiptDelivery, receiptEmailHtml } from "@/lib/receipts/payment-receipts";

type ReceiptPermissionContext = Awaited<ReturnType<typeof requireAuth>>;

function canUseReceipt(context: ReceiptPermissionContext, receipt: Awaited<ReturnType<typeof getPaymentReceipt>>) {
    if (context.activeCompany?.id !== receipt.companyId) return false;
    if (context.isCompanyAdmin) return true;
    if (context.authMode === "collector") return true;
    if (!hasPermission(context, "collections.read") && !hasPermission(context, "collections.view") && !hasPermission(context, "landlords.read")) return false;
    if (context.activeOffice?.id && receipt.officeId && context.activeOffice.id !== receipt.officeId) return false;
    return true;
}

function assertReceiptPermission(context: ReceiptPermissionContext, receipt: Awaited<ReturnType<typeof getPaymentReceipt>>) {
    if (!canUseReceipt(context, receipt)) throw new Error("You do not have permission to use this receipt.");
}

function emailProvider() {
    return String(process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
}

function providerStatus() {
    const provider = emailProvider();
    if (provider === "resend") {
        return {
            configured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS),
            provider,
            required: "RESEND_API_KEY and EMAIL_FROM_ADDRESS",
        };
    }
    if (provider === "sendgrid") {
        return {
            configured: Boolean(process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM_ADDRESS),
            provider,
            required: "SENDGRID_API_KEY and EMAIL_FROM_ADDRESS",
        };
    }
    return {
        configured: false,
        provider: provider || "not_configured",
        required: "EMAIL_PROVIDER=resend or EMAIL_PROVIDER=sendgrid plus provider API key and EMAIL_FROM_ADDRESS",
    };
}

async function sendProviderEmail(input: { html: string; subject: string; to: string }) {
    const status = providerStatus();
    if (!status.configured) return { ok: false, error: `Email provider not configured. Required: ${status.required}`, provider: status.provider };
    if (status.provider === "resend") {
        const response = await fetch("https://api.resend.com/emails", {
            body: JSON.stringify({
                from: process.env.EMAIL_FROM_ADDRESS,
                html: input.html,
                subject: input.subject,
                to: [input.to],
            }),
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            method: "POST",
        });
        const body = await response.json().catch(() => ({}));
        return response.ok
            ? { ok: true, id: String(body?.id ?? ""), provider: "resend" }
            : { ok: false, error: String(body?.message ?? response.statusText), provider: "resend" };
    }
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        body: JSON.stringify({
            content: [{ type: "text/html", value: input.html }],
            from: { email: process.env.EMAIL_FROM_ADDRESS },
            personalizations: [{ to: [{ email: input.to }] }],
            subject: input.subject,
        }),
        headers: {
            Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
            "Content-Type": "application/json",
        },
        method: "POST",
    });
    return response.ok
        ? { ok: true, id: response.headers.get("x-message-id") ?? "", provider: "sendgrid" }
        : { ok: false, error: response.statusText, provider: "sendgrid" };
}

export async function getReceiptForModal(receiptId: string) {
    const context = await requireAuth();
    const receipt = await getPaymentReceipt(receiptId);
    assertReceiptPermission(context, receipt);
    return receipt;
}

export async function logReceiptPrintOrDownload(input: { channel: "download_pdf" | "print"; receiptId: string }) {
    const context = await requireAuth();
    const receipt = await getPaymentReceipt(input.receiptId);
    assertReceiptPermission(context, receipt);
    await logReceiptDelivery({
        channel: input.channel,
        receipt,
        sentBy: context.profile?.id ?? null,
        status: "sent",
    });
    return { ok: true };
}

export async function sendReceiptByEmail(input: { email: string; receiptId: string }) {
    const context = await requireAuth();
    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Enter a valid email address.");
    const receipt = await getPaymentReceipt(input.receiptId);
    assertReceiptPermission(context, receipt);
    const result = await sendProviderEmail({
        html: receiptEmailHtml(receipt),
        subject: `DDUMBA OS Receipt ${receipt.receiptNumber}`,
        to: email,
    });
    await logReceiptDelivery({
        channel: "email",
        error: result.ok ? null : result.error,
        receipt,
        recipientEmail: email,
        sentBy: context.profile?.id ?? null,
        status: result.ok ? "sent" : "failed",
    });
    if (!result.ok) throw new Error(result.error ?? "Email could not be sent.");
    return { ok: true, provider: result.provider };
}

export async function logReceiptShareLink(input: { channel: "sms" | "whatsapp"; phone: string; receiptId: string }) {
    const context = await requireAuth();
    const receipt = await getPaymentReceipt(input.receiptId);
    assertReceiptPermission(context, receipt);
    await logReceiptDelivery({
        channel: input.channel,
        receipt,
        recipientPhone: input.phone,
        sentBy: context.profile?.id ?? null,
        status: "sent",
    });
    return { ok: true };
}
