import DefaultersPrintRouteClient from "@/components/office/defaulters/DefaultersPrintRouteClient";

export const dynamic = "force-dynamic";

function scalar(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function DefaultersPrintPage({ searchParams }: { searchParams: Promise<{ key?: string | string[] }> }) {
    const params = await searchParams;
    return <DefaultersPrintRouteClient storageKey={scalar(params.key) ?? ""} />;
}
