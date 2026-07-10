import type React from "react";

type Props = {
    children: React.ReactNode;
    eyebrow?: string;
    title: string;
    subtitle?: string;
};

export default function CollectorPageShell({ children, eyebrow = "Field Collector", title, subtitle }: Props) {
    return (
        <main className="collector-page-shell">
            <section className="collector-page-hero">
                <div className="min-w-0">
                    <p className="collector-page-eyebrow">{eyebrow}</p>
                    <h1>{title}</h1>
                    {subtitle ? <p className="collector-page-subtitle">{subtitle}</p> : null}
                </div>
            </section>
            <div className="collector-page-body">
                {children}
            </div>
        </main>
    );
}
