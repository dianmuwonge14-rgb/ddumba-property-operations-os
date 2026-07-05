import { getCollectionsRecordsPageData } from "@/lib/collections/data";
import CollectionsRecordsCentre from "@/components/office/collections/CollectionsRecordsCentre";

export default async function CollectionsPage() {
    const pageData = await getCollectionsRecordsPageData();

    return <CollectionsRecordsCentre initialData={pageData} />;
}
