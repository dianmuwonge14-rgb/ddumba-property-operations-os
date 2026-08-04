export type StructuredBusinessError = {
    code: string;
    error: string;
    message: string;
    reference?: string;
    status: number;
    success: false;
};

function rawMessage(error: unknown) {
    if (typeof error === "string") return error;
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object") {
        const row = error as Record<string, unknown>;
        return String(row.message ?? row.error_description ?? row.error ?? "");
    }
    return "";
}

function errorCode(error: unknown) {
    if (error && typeof error === "object") {
        const row = error as Record<string, unknown>;
        return String(row.code ?? row.sqlState ?? row.sqlstate ?? "");
    }
    return "";
}

export function businessErrorReference(prefix = "ERR") {
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return `${prefix}-${date}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function businessErrorFromUnknown(error: unknown, fallback = "An unexpected system error occurred."): StructuredBusinessError {
    const message = rawMessage(error);
    const lower = message.toLowerCase();
    const code = errorCode(error);

    const known: Array<[RegExp, string, string, number]> = [
        [/next_redirect|auth|login|session|not signed in|sign in required|authentication/i, "AUTHENTICATION_REQUIRED", "Please sign in again to continue.", 401],
        [/phone.*already|already.*phone|duplicate.*phone|unique.*phone/i, "PHONE_ALREADY_EXISTS", "This phone number is already attached to another account.", 409],
        [/employee.*already has.*login|login account.*already/i, "EMPLOYEE_LOGIN_ALREADY_EXISTS", "This employee already has a login account.", 409],
        [/receptionist.*already|duplicate.*receptionist/i, "RECEPTIONIST_ALREADY_EXISTS", "This receptionist account already exists.", 409],
        [/employee.*not linked|missing employee linkage|employee linkage/i, "EMPLOYEE_NOT_LINKED", "Employee is not linked to the required account or office.", 400],
        [/employee.*details already exists|duplicate.*employee|employee.*already exists/i, "DUPLICATE_EMPLOYEE", "An employee with these details already exists.", 409],
        [/room number already exists|duplicate.*room|room .*already exists/i, "ROOM_NUMBER_ALREADY_EXISTS", "Room number already exists.", 409],
        [/salary.*not.*configured|salary configuration missing|requires salary configuration/i, "SALARY_CONFIGURATION_MISSING", "Salary has not yet been configured for this employee.", 400],
        [/office.*inactive|inactive office|office was merged|merged into/i, "OFFICE_INACTIVE", "This office is inactive and cannot be used for new work.", 403],
        [/collector.*inactive|inactive collector/i, "COLLECTOR_INACTIVE", "This collector account is inactive.", 403],
        [/landlord.*active rooms|active rooms.*landlord/i, "LANDLORD_HAS_ACTIVE_ROOMS", "This landlord still has active rooms and cannot be deleted.", 409],
        [/permission denied|not have permission|not authorised|not authorized|unauthori[sz]ed|admin only/i, "PERMISSION_DENIED", "Permission denied for this action.", 403],
        [/bank slip.*required|deposit slip.*required|upload.*slip/i, "BANK_SLIP_REQUIRED", "Upload the bank deposit slip before submitting.", 400],
        [/outstanding balance.*invalid|invalid outstanding/i, "INVALID_OUTSTANDING_BALANCE", "Outstanding balance is invalid.", 400],
        [/payment.*already approved|already been approved/i, "PAYMENT_ALREADY_APPROVED", "This payment has already been approved.", 409],
        [/receipt.*already cancelled|receipt.*already canceled/i, "RECEIPT_ALREADY_CANCELLED", "This receipt is already cancelled.", 409],
        [/no active office assignment|office assignment missing|role assignment missing/i, "NO_ACTIVE_OFFICE_ASSIGNMENT", "No active office assignment was found for this account.", 403],
        [/collector profile missing|missing collector profile/i, "COLLECTOR_PROFILE_MISSING", "Collector profile is missing for this account.", 400],
        [/pin.*already|duplicate.*pin/i, "PIN_ALREADY_IN_USE", "This PIN is already in use. Choose a different PIN.", 409],
        [/foreign key|23503|violates foreign key/i, "RELATED_RECORD_MISSING", "A required linked record is missing. Check the employee, office, room or role linkage.", 400],
        [/duplicate key|23505|unique constraint/i, "DUPLICATE_RECORD", "A matching record already exists.", 409],
        [/not null|23502|null value/i, "REQUIRED_FIELD_MISSING", "A required field is missing.", 400],
    ];

    for (const [pattern, mappedCode, mappedMessage, status] of known) {
        if (pattern.test(message) || pattern.test(code)) {
            return { code: mappedCode, error: mappedMessage, message: mappedMessage, status, success: false };
        }
    }

    if (message && !/server components render|digest|internal server error/i.test(lower)) {
        return { code: "BUSINESS_RULE_FAILED", error: message, message, status: 400, success: false };
    }

    const reference = businessErrorReference();
    return {
        code: "UNEXPECTED_SYSTEM_ERROR",
        error: `${fallback} Reference: ${reference}. Please contact the Administrator.`,
        message: `${fallback} Reference: ${reference}. Please contact the Administrator.`,
        reference,
        status: 500,
        success: false,
    };
}
