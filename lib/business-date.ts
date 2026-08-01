const BUSINESS_TIME_ZONE = "Africa/Kampala";

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

export function formatBusinessDate(value: string) {
    return new Intl.DateTimeFormat("en-UG", {
        day: "2-digit",
        month: "short",
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00+03:00`));
}

