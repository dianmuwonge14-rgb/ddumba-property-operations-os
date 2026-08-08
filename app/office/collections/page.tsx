import { getCollectionsRecordsPageData } from "@/lib/collections/data";
import type { CollectionReportFilters } from "@/lib/collections/types";
import CollectionsRecordsCentre from "@/components/office/collections/CollectionsRecordsCentre";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function CollectionsPage({ searchParams }: Props) {
    const params = await searchParams;
    const filters: CollectionReportFilters = {
        collectionSource: (scalar(params.collectionSource) as CollectionReportFilters["collectionSource"]) ?? undefined,
        employeeId: scalar(params.employeeId) ?? undefined,
        endDate: scalar(params.endDate) ?? scalar(params.dateTo) ?? undefined,
        endMonth: scalar(params.endMonth) ?? undefined,
        officeId: scalar(params.officeId) ?? undefined,
        paymentMethod: scalar(params.paymentMethod) ?? undefined,
        room: scalar(params.room) ?? undefined,
        singleDate: scalar(params.singleDate) ?? scalar(params.date) ?? undefined,
        singleMonth: scalar(params.singleMonth) ?? undefined,
        startDate: scalar(params.startDate) ?? scalar(params.dateFrom) ?? undefined,
        startMonth: scalar(params.startMonth) ?? undefined,
        tenant: scalar(params.tenant) ?? undefined,
    };
    const pageData = await getCollectionsRecordsPageData(filters);

    return <CollectionsRecordsCentre initialData={pageData} />;
}
