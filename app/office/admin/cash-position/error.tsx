"use client";

import { useEffect, useMemo } from "react";
import { BusinessErrorNotice } from "@/components/shared/BusinessErrorNotice";
import { businessErrorFromUnknown } from "@/lib/errors/business-errors";

export default function CashPositionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const businessError = useMemo(() => businessErrorFromUnknown(error), [error]);

    useEffect(() => {
        const rawMessage = String(error);
        console.error("Cash Position data could not be loaded", { digest: error.digest, rawMessage, businessError });
    }, [businessError, error]);

    return <BusinessErrorNotice context="Cash Position Centre" error={businessError} reset={reset} returnHref="/office" />;
}
