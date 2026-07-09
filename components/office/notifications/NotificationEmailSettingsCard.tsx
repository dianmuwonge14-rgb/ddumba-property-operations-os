"use client";

import { useState, useTransition } from "react";
import { MailCheck, MailWarning } from "lucide-react";
import { updateAccountNotificationEmail, updateMyNotificationEmail } from "@/app/actions/notification-email-settings";
import type { AdminNotificationEmailSettingsData, MyNotificationEmailSettings } from "@/lib/notifications/email-settings";

export function MyNotificationEmailSettingsCard({ settings }: { settings: MyNotificationEmailSettings | null }) {
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    if (!settings) return null;
    return (
        <section className="enterprise-panel p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-white">
                        {settings.providerConfigured ? <MailCheck size={20} /> : <MailWarning size={20} />}
                    </span>
                    <div>
                        <p className="text-xs font-black uppercase tracking-wide text-blue-700">Email Notifications</p>
                        <h2 className="text-lg font-black text-slate-950">Notification email</h2>
                        <p className="text-xs font-semibold text-slate-500">
                            Provider: {settings.providerConfigured ? settings.providerName : `not configured (${settings.providerRequired})`}
                        </p>
                    </div>
                </div>
                <form
                    action={(formData) => {
                        setMessage(null);
                        startTransition(async () => {
                            try {
                                await updateMyNotificationEmail(formData);
                                setMessage("Notification email updated.");
                            } catch (error) {
                                setMessage(error instanceof Error ? error.message : "Could not update notification email.");
                            }
                        });
                    }}
                    className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_auto_auto]"
                >
                    <input
                        name="notificationEmail"
                        type="email"
                        defaultValue={settings.notificationEmail ?? ""}
                        placeholder="notification@email.com"
                        className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none focus:border-blue-500"
                    />
                    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                        <input name="emailEnabled" type="checkbox" defaultChecked={settings.emailEnabled} />
                        Enabled
                    </label>
                    <button disabled={isPending} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                        {isPending ? "Saving..." : "Update notification email"}
                    </button>
                </form>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-black uppercase">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Verification: {settings.verificationStatus}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Last updated: {settings.updatedAt ? new Date(settings.updatedAt).toLocaleString() : "Not updated"}</span>
                {message ? <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{message}</span> : null}
            </div>
        </section>
    );
}

export function AdminNotificationEmailSettingsPanel({ data }: { data: AdminNotificationEmailSettingsData }) {
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    return (
        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-white">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">System Email Notifications</p>
                    <h2 className="mt-1 text-xl font-black">Notification Email Control</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-400">
                        Provider: {data.providerConfigured ? data.providerName : `not configured. Required: ${data.providerRequired}`}
                    </p>
                </div>
                {message ? <p className="rounded-full bg-cyan-400/10 px-3 py-2 text-xs font-black text-cyan-100">{message}</p> : null}
            </div>
            <div className="mt-4 overflow-x-auto">
                <table className="min-w-[760px] w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-950 text-white">
                        <tr>
                            <th className="px-3 py-2">Account</th>
                            <th className="px-3 py-2">Type</th>
                            <th className="px-3 py-2">Notification Email</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.settings.slice(0, 30).map((item) => (
                            <tr key={item.account_id} className="border-t border-white/10">
                                <td className="px-3 py-2 font-bold">{item.full_name ?? item.email ?? "Unnamed account"}</td>
                                <td className="px-3 py-2 font-bold uppercase text-slate-300">{item.account_type ?? "account"}</td>
                                <td className="px-3 py-2">
                                    <form
                                        id={`notification-email-${item.account_id}`}
                                        action={(formData) => {
                                            setMessage(null);
                                            startTransition(async () => {
                                                try {
                                                    await updateAccountNotificationEmail(formData);
                                                    setMessage("Account notification email updated.");
                                                } catch (error) {
                                                    setMessage(error instanceof Error ? error.message : "Could not update account email.");
                                                }
                                            });
                                        }}
                                        className="flex gap-2"
                                    >
                                        <input type="hidden" name="accountId" value={item.account_id} />
                                        <input
                                            name="notificationEmail"
                                            type="email"
                                            defaultValue={item.notification_email ?? ""}
                                            className="min-w-[220px] rounded-xl border border-white/10 bg-slate-950 px-3 py-2 font-bold text-white outline-none"
                                        />
                                        <input name="emailEnabled" type="hidden" value={item.email_enabled === false ? "off" : "on"} />
                                    </form>
                                </td>
                                <td className="px-3 py-2">
                                    <span className="rounded-full bg-white/10 px-2 py-1 font-black uppercase text-slate-200">{item.verification_status ?? "unverified"}</span>
                                </td>
                                <td className="px-3 py-2">
                                    <button form={`notification-email-${item.account_id}`} disabled={isPending} className="rounded-xl bg-cyan-500 px-3 py-2 font-black text-slate-950 disabled:opacity-50">
                                        Save
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {data.recentLogs.map((log, index) => (
                    <div key={`${log.created_at}-${index}`} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="text-xs font-black uppercase text-slate-300">{log.email_status}</p>
                        <p className="mt-1 truncate text-sm font-bold">{log.notification_email ?? "No email"}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">{log.error_message ?? log.provider ?? "Delivery logged"}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}
