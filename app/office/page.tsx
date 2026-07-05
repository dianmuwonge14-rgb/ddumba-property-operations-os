import { getDashboardLiveData } from "@/lib/dashboard-live/data";
import DashboardMissionControl from "@/components/office/dashboard-live/DashboardMissionControl";

type PageProps = {
    searchParams: Promise<{ startDate?: string; endDate?: string; period?: string }>;
};

function resolvePeriod(searchParams: Awaited<PageProps["searchParams"]>) {
    if (searchParams.period === "today") {
        const today = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Africa/Kampala",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date());
        return { startDate: today, endDate: today };
    }
    return {
        startDate: searchParams.startDate ?? null,
        endDate: searchParams.endDate ?? null,
    };
}

export default async function OfficeHomePage({ searchParams }: PageProps) {
    const data = await getDashboardLiveData(resolvePeriod(await searchParams));

    return <DashboardMissionControl data={data} />;
}
