"use client";

import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";

type OverflowSafeTextProps = {
    children: ReactNode;
    className?: string;
    contentClassName?: string;
    mode?: "wrap" | "truncate" | "marquee";
    title?: string;
};

function textValue(children: ReactNode) {
    if (typeof children === "string" || typeof children === "number") return String(children);
    return undefined;
}

export function OverflowSafeText({
    children,
    className = "",
    contentClassName = "",
    mode = "wrap",
    title,
}: OverflowSafeTextProps) {
    const frameRef = useRef<HTMLSpanElement | null>(null);
    const contentRef = useRef<HTMLSpanElement | null>(null);
    const [overflowDistance, setOverflowDistance] = useState(0);

    useEffect(() => {
        const frame = frameRef.current;
        const content = contentRef.current;
        if (!frame || !content || mode !== "marquee") {
            setOverflowDistance(0);
            return;
        }

        const measure = () => {
            setOverflowDistance(Math.max(0, content.scrollWidth - frame.clientWidth + 18));
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(frame);
        observer.observe(content);
        return () => observer.disconnect();
    }, [children, mode]);

    const shouldMarquee = mode === "marquee" && overflowDistance > 1;
    const resolvedTitle = title ?? textValue(children);
    const style = shouldMarquee ? ({ "--overflow-safe-distance": `${overflowDistance}px` } as CSSProperties) : undefined;

    return (
        <span
            ref={frameRef}
            className={[
                "overflow-safe-text",
                mode === "truncate" ? "overflow-safe-text--truncate" : "",
                mode === "marquee" ? "overflow-safe-text--marquee" : "overflow-safe-text--wrap",
                shouldMarquee ? "overflow-safe-text--marquee-active" : "",
                className,
            ].filter(Boolean).join(" ")}
            title={resolvedTitle}
            style={style}
        >
            <span ref={contentRef} className={["overflow-safe-text__content", contentClassName].filter(Boolean).join(" ")}>
                {children}
            </span>
        </span>
    );
}
