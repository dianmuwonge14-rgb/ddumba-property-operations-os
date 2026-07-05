import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { getLandlordsPageData } from "@/lib/landlords/data";
import LandlordsConsole from "@/components/office/landlords/LandlordsConsole";

export default async function LandlordsPage({
    searchParams,
}: {
    searchParams?: Promise<{ page?: string; q?: string; landlord?: string }>;
}) {
    const context = await requireAuth();

    if (
        !hasPermission(context, "landlords.read") &&
        !hasPermission(context, "landlords.view") &&
        !hasPermission(context, "collections.read")
    ) {
        redirect("/office");
    }

    const params = await searchParams;
    const page = parseSafePage(params?.page);
    const search = typeof params?.q === "string" ? params.q.slice(0, 80) : "";
    const selectedLandlordId = isUuid(params?.landlord) ? params?.landlord ?? null : null;
    const data = await getLandlordsPageData({
        page,
        search,
        selectedLandlordId,
    }).catch((error: unknown) => {
        console.error("Landlords loader failed", error);
        return null;
    });

    if (!data) {
        return <LandlordsLoadFallback message="The landlord register could not load from Supabase. No business data was changed. Retry the page after the connection settles." />;
    }

    return (
        <LandlordsConsole
            canAdminManage={context.isCompanyAdmin && !context.isOfficeMode}
            canManage={context.isCompanyAdmin || context.permissions.includes("landlords.manage")}
            canManageCollections={context.isCompanyAdmin || context.permissions.includes("collections.manage")}
            canPostPayments={context.isCompanyAdmin || context.permissions.includes("collections.payment.post")}
            data={data}
        />
    );
}

function parseSafePage(value: string | undefined) {
    const parsed = Number(value ?? 1);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
}

function isUuid(value: string | undefined) {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function LandlordsLoadFallback({ message }: { message: string }) {
    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="enterprise-panel border-amber-200 bg-white p-6">
                    <p className="text-xs font-black uppercase tracking-wide text-amber-600">Landlords recovery mode</p>
                    <h1 className="mt-2 text-2xl font-black text-slate-950">Landlords page is temporarily in safe mode.</h1>
                    <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-600">{message}</p>
                    <a
                        href="/office/landlords?page=1"
                        className="mt-5 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
                    >
                        Retry Landlords
                    </a>
                </section>
            </div>
        </main>
    );
}
