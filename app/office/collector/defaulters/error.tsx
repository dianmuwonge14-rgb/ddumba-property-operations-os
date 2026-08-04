"use client";

import { useMemo } from "react";
import { BusinessErrorNotice } from "@/components/shared/BusinessErrorNotice";
import { businessErrorFromUnknown } from "@/lib/errors/business-errors";

export default function CollectorDefaultersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const businessError = useMemo(() => businessErrorFromUnknown(error), [error]);

    return <BusinessErrorNotice context="Collector defaulters" error={businessError} reset={reset} returnHref="/office/collector/defaulters" />;
}
