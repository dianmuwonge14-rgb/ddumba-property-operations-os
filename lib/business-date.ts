const BUSINESS_TIME_ZONE = "Africa/Kampala";

type FinancialEntryContext = {
    isCompanyAdmin?: boolean;
    isCompanyReadOnlyManager?: boolean;
    isOfficeMode?: boolean;
    permissions?: string[];
};

function datePartsInKampala(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
    }).formatToParts(date);
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}

export function currentBusinessDate() {
    return datePartsInKampala();
}

export function assertCurrentBusinessDate(value: string | null | undefined, message: string) {
    const submitted = String(value ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(submitted) || submitted !== currentBusinessDate()) {
        throw new Error(message);
    }
    return submitted;
}

export function canBackdateFinancialEntries(context: FinancialEntryContext) {
    return Boolean(
        context.isCompanyAdmin &&
        !context.isCompanyReadOnlyManager &&
        !context.isOfficeMode &&
        (context.permissions?.includes("financial_entries.backdate") || context.isCompanyAdmin),
    );
}

export function assertFinancialEntryDate(
    value: string | null | undefined,
    context: FinancialEntryContext,
    options: {
        backdatingReason?: string | null;
        currentDateMessage: string;
        entryLabel: string;
    },
) {
    const submitted = String(value ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(submitted)) {
        throw new Error(`${options.entryLabel} date must be a valid date.`);
    }

    const today = currentBusinessDate();
    if (submitted > today) {
        throw new Error("Future-dated entries are not permitted.");
    }
    if (submitted === today) {
        return { backdatingReason: null, date: submitted, enteredOnDate: today, isBackdated: false };
    }
    if (!canBackdateFinancialEntries(context)) {
        throw new Error(options.currentDateMessage);
    }

    const reason = String(options.backdatingReason ?? "").trim();
    if (!reason) {
        throw new Error("A backdating reason is required.");
    }
    return { backdatingReason: reason, date: submitted, enteredOnDate: today, isBackdated: true };
}

export function formatBusinessDate(value: string) {
    return new Intl.DateTimeFormat("en-UG", {
        day: "2-digit",
        month: "short",
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00+03:00`));
}
