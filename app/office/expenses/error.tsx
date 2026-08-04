"use client";

import { useEffect, useMemo } from "react";
import { BusinessErrorNotice } from "@/components/shared/BusinessErrorNotice";
import { businessErrorFromUnknown } from "@/lib/errors/business-errors";

export default function ExpensesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const businessError = useMemo(() => businessErrorFromUnknown(error), [error]);

    useEffect(() => {
        console.error("Expenses data could not be loaded", { digest: error.digest, message: error.message, businessError });
    }, [businessError, error]);

    return <BusinessErrorNotice context="Expenses" error={businessError} reset={reset} returnHref="/office/dashboard" />;
}
