import type { TenantReceiptViewModel } from "@/components/office/receipts/TenantPaymentReceipt";

export const RECEIPT_A4_ROOT_ID = "tenant-receipt-a4-print-root";

function money(value: number | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "No timestamp";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-UG", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: "Africa/Kampala",
        year: "numeric",
    });
}

export function ReceiptA4({ receipt }: { receipt: TenantReceiptViewModel }) {
    const snapshot = receipt.snapshot;
    const receiptStatus = receiptStatusPresentation(snapshot.receiptStatus ?? receipt.status ?? snapshot.status);
    const latestAmendment = snapshot.amendmentHistory?.at(-1) ?? null;
    const coverage = snapshot.coveragePeriods?.length
        ? snapshot.coveragePeriods.filter((period) => period.label && Number(period.amount) > 0)
        : snapshot.coveragePeriod
            ? [{ amount: snapshot.amountApplied, label: snapshot.coveragePeriod, type: "coverage" }]
            : [];
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=144x144&margin=10&data=${encodeURIComponent(`https://ddumba-property-operations-os-evgw.vercel.app/office/receipts?verify=${receipt.verificationCode}&receipt=${receipt.id}`)}`;

    return (
        <article id={RECEIPT_A4_ROOT_ID} className="receipt-a4-sheet">
            <header className="receipt-a4-header">
                <div>
                    <div className="receipt-a4-logo">DD</div>
                    <p className="receipt-a4-kicker">Official payment document</p>
                    <h1>{snapshot.companyName || "DDUMBA OS"}</h1>
                    {snapshot.companyContact ? <p className="receipt-a4-muted">{snapshot.companyContact}</p> : null}
                </div>
                <div className="receipt-a4-title">
                    <p>Tenant Payment Receipt</p>
                    <strong>{receipt.receiptNumber}</strong>
                    <span>Verification: {receipt.verificationCode}</span>
                </div>
            </header>

            {receiptStatus.banner ? (
                <section className={`receipt-a4-section receipt-a4-status ${receiptStatus.className}`}>
                    <strong>{receiptStatus.banner}</strong>
                    {snapshot.amendmentSummary ? <span>{snapshot.amendmentSummary}</span> : null}
                </section>
            ) : null}

            <section className="receipt-a4-grid receipt-a4-section">
                <Info label="Tenant" value={snapshot.tenantName ?? "Unnamed tenant"} strongValue />
                <Info label="Phone" value={snapshot.tenantPhone ?? "No phone"} strongValue />
                <Info label="Room" value={snapshot.roomNumber ?? "No room"} strongValue />
                <Info label="Property" value={snapshot.propertyName ?? "Property not set"} />
                <Info label="Office" value={snapshot.officeName ?? "Office"} />
                <Info label="Landlord" value={snapshot.landlordName ?? "No landlord"} />
                <Info label="Date & Time" value={formatDateTime(snapshot.paymentDateTime)} />
                <Info label="Prepared By" value={snapshot.preparedByName ?? snapshot.recordedByName ?? "DDUMBA OS"} />
            </section>

            <section className="receipt-a4-section">
                <h2>Payment Breakdown</h2>
                <div className="receipt-a4-money-grid">
                    <Money label="Amount Paid" value={snapshot.amountPaid} highlight />
                    <Money label="Monthly Rent" value={snapshot.monthlyRent} />
                    <Money label="Security Deposit" value={Number(snapshot.securityDepositAmount ?? 0)} />
                    <Money label="Advance Allocation" value={snapshot.advanceAmount ?? snapshot.advanceBalance} />
                    <Money label="Outstanding After Payment" value={snapshot.remainingOutstandingBalance} highlight />
                    <Money label="Advance Balance" value={snapshot.advanceBalance} />
                </div>
            </section>

            <section className="receipt-a4-section">
                <h2 className="receipt-a4-coverage-heading">Rent Coverage</h2>
                {coverage.length ? (
                    <div className="receipt-a4-coverage">
                        {coverage.map((period, index) => (
                            <div key={`${period.label}-${period.type}-${index}`} className="receipt-a4-coverage-row">
                                <strong>Period {index + 1}</strong>
                                <span>{period.label}</span>
                                <b>{money(period.amount)}</b>
                                <em>{period.type}</em>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="receipt-a4-muted">No rent coverage allocation was saved for this receipt.</p>
                )}
            </section>

            <section className="receipt-a4-section receipt-a4-meta">
                <Info label="Payment Method" value={snapshot.paymentMethod?.replaceAll("_", " ") ?? "Payment"} />
                <Info label="Reference" value={snapshot.referenceNumber ?? "No reference"} />
                <Info label="Security Receipt" value={snapshot.securityDepositReceiptNumber ?? "None"} />
                <Info label="Status" value={receiptStatus.label} />
                <Info label="Notes" value={snapshot.notes ?? "No notes"} />
            </section>

            {latestAmendment ? (
                <section className="receipt-a4-section receipt-a4-amendment">
                    <h2>Amendment History</h2>
                    <div className="receipt-a4-grid receipt-a4-meta">
                        <Info label="Changed Field" value={latestAmendment.fieldLabel} />
                        {latestAmendment.previousValue ? <Info label="Previous Value" value={latestAmendment.previousValue} /> : null}
                        {latestAmendment.newValue ? <Info label="New Value" value={latestAmendment.newValue} /> : null}
                        {latestAmendment.requestedByName ? <Info label="Change Requested By" value={latestAmendment.requestedByName} /> : null}
                        {latestAmendment.changedByName ? <Info label="Changed By" value={latestAmendment.changedByName} /> : null}
                        {latestAmendment.approvedByName ? <Info label="Approved By" value={latestAmendment.approvedByName} /> : null}
                        {latestAmendment.approvalDate ? <Info label="Approval Date" value={formatDateTime(latestAmendment.approvalDate)} /> : null}
                        {latestAmendment.reason ? <Info label="Reason" value={latestAmendment.reason} /> : null}
                        {latestAmendment.auditReference ? <Info label="Audit Reference" value={latestAmendment.auditReference} /> : null}
                    </div>
                </section>
            ) : null}

            <footer className="receipt-a4-footer">
                <div>
                    <p>Generated from the saved DDUMBA OS Supabase transaction.</p>
                    <strong>Thank you for your payment.</strong>
                    {receiptStatus.banner ? <p className="receipt-a4-final-status">{receiptStatus.banner}</p> : null}
                </div>
                <img alt={`Receipt QR ${receipt.verificationCode}`} src={qrUrl} />
            </footer>
        </article>
    );
}

function receiptStatusPresentation(status: string | null | undefined) {
    const value = String(status ?? "issued").toLowerCase();
    if (["corrected", "amended"].includes(value)) return { banner: "AMENDED RECEIPT", className: "receipt-a4-status-amended", label: "Corrected" };
    if (["cancelled", "canceled", "voided", "void"].includes(value)) return { banner: "CANCELLED RECEIPT", className: "receipt-a4-status-cancelled", label: "Cancelled" };
    if (value === "reversed") return { banner: "REVERSED RECEIPT", className: "receipt-a4-status-cancelled", label: "Reversed" };
    if (["replaced", "superseded"].includes(value)) return { banner: "SUPERSEDED RECEIPT", className: "receipt-a4-status-superseded", label: "Superseded" };
    if (["rejected", "rejected_change"].includes(value)) return { banner: "REJECTED CHANGE RECORDED", className: "receipt-a4-status-rejected", label: "Rejected change" };
    if (["pending", "pending_correction", "pending_change"].includes(value)) return { banner: "PENDING CORRECTION", className: "receipt-a4-status-pending", label: "Pending correction" };
    return { banner: null, className: "", label: status ?? "Issued" };
}

function Info({ label, strongValue = false, value }: { label: string; strongValue?: boolean; value: string }) {
    return (
        <div className="receipt-a4-info">
            <span>{label}</span>
            <strong className={strongValue ? "receipt-a4-key-value" : undefined}>{value}</strong>
        </div>
    );
}

function Money({ highlight = false, label, value }: { highlight?: boolean; label: string; value: number }) {
    return (
        <div className={highlight ? "receipt-a4-money receipt-a4-money-highlight" : "receipt-a4-money"}>
            <span>{label}</span>
            <strong>{money(value)}</strong>
        </div>
    );
}
