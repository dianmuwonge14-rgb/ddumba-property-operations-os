"use client";

import { useEffect, useMemo } from "react";
import { BusinessErrorNotice } from "@/components/shared/BusinessErrorNotice";
import { businessErrorFromUnknown } from "@/lib/errors/business-errors";

export default function OfficeError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const businessError = useMemo(() => businessErrorFromUnknown(error), [error]);

    useEffect(() => {
        console.error("Office route failed", { digest: error.digest, message: error.message, businessError });
    }, [businessError, error]);

    return (
        <BusinessErrorNotice
            context="Office workspace"
            detail="Expected business validation errors are shown here with a safe reason. Unexpected failures include a reference for Admin review."
            error={businessError}
            reset={reset}
            returnHref="/office"
        />
    );
}
