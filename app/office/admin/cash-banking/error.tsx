"use client";

import { useMemo } from "react";
import { BusinessErrorNotice } from "@/components/shared/BusinessErrorNotice";
import { businessErrorFromUnknown } from "@/lib/errors/business-errors";

export default function AdminCashBankingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const businessError = useMemo(() => businessErrorFromUnknown(error), [error]);
    return <BusinessErrorNotice context="Admin Cash Banking" error={businessError} reset={reset} returnHref="/office/admin" />;
}
