import { getAiIntelligenceData } from "@/lib/ai-intelligence/data";
import AiIntelligenceCentre from "@/components/office/ai-intelligence/AiIntelligenceCentre";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function AiIntelligencePage() {
    await requireCompanyAdminMode();
    const data = await getAiIntelligenceData();

    return <AiIntelligenceCentre data={data} />;
}
