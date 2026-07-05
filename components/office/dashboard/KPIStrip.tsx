import { EnterpriseKpiCard } from "@/components/office/shared/EnterpriseUI";

export default function KPIStrip() {
    const cards = [
        {
            title: "Today's Collections",
            value: "UGX 12.4M",
            change: "+18%",
            tone: "green" as const,
            progress: 82,
        },
        {
            title: "Outstanding Rent",
            value: "UGX 88.3M",
            change: "-4%",
            tone: "red" as const,
            progress: 64,
        },
        {
            title: "Due Today",
            value: "34",
            change: "8 High Risk",
            tone: "orange" as const,
            progress: 58,
        },
        {
            title: "Promises Due",
            value: "12",
            change: "3 Overdue",
            tone: "purple" as const,
            progress: 61,
        },
        {
            title: "Landlord Settlements",
            value: "UGX 4.8M",
            change: "Pending",
            tone: "blue" as const,
            progress: 47,
        },
        {
            title: "Staff Present",
            value: "18 / 20",
            change: "90%",
            tone: "cyan" as const,
            progress: 90,
        },
        {
            title: "AI Risk Score",
            value: "Low",
            change: "82%",
            tone: "slate" as const,
            progress: 82,
        }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-5">
            {cards.map((card) => (
                <EnterpriseKpiCard
                    key={card.title}
                    title={card.title}
                    value={card.value}
                    trend={card.change.startsWith("-") ? "down" : "up"}
                    trendLabel={card.change}
                    tone={card.tone}
                    progress={card.progress}
                />
            ))}
        </div>
    );
}
