"use client";

import { useEffect, useMemo } from "react";
import { BusinessErrorNotice } from "@/components/shared/BusinessErrorNotice";
import { businessErrorFromUnknown } from "@/lib/errors/business-errors";

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const businessError = useMemo(() => businessErrorFromUnknown(error), [error]);

    useEffect(() => {
        console.error("Root route failed", { digest: error.digest, message: error.message, businessError });
    }, [businessError, error]);

    return <BusinessErrorNotice context="Ddumba OS" error={businessError} reset={reset} returnHref="/" />;
}
