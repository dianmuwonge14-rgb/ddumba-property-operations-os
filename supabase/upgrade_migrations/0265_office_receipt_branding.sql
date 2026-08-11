-- Office-specific receipt branding.
-- Additive only: historical financial rows remain intact; saved receipt snapshots
-- are only repaired when their own receipt office_id identifies the branded office.

alter table public.offices
    add column if not exists receipt_business_name text,
    add column if not exists receipt_logo_url text,
    add column if not exists receipt_address text,
    add column if not exists receipt_phone text,
    add column if not exists receipt_email text,
    add column if not exists receipt_footer text;

comment on column public.offices.receipt_business_name is 'Business/legal display name printed as the issuer on receipts for this office. Falls back to company default when null.';
comment on column public.offices.receipt_logo_url is 'Optional logo URL used on generated receipts for this office.';
comment on column public.offices.receipt_address is 'Optional receipt address override for this office.';
comment on column public.offices.receipt_phone is 'Optional receipt phone override for this office.';
comment on column public.offices.receipt_email is 'Optional receipt email override for this office.';
comment on column public.offices.receipt_footer is 'Optional footer text printed on receipts for this office.';

update public.offices
set
    receipt_business_name = 'SUMMIT PROPERTY GROUP',
    receipt_footer = coalesce(receipt_footer, 'Issued by Summit Property Group. Keep this receipt for tenant, office, and audit verification.'),
    updated_at = now()
where upper(coalesce(office_name, name, '')) = 'SUMMIT PROPERTY GROUP';

update public.offices
set
    receipt_business_name = 'HERITAGE ESTATES AND PROPERTY SOLUTIONS',
    updated_at = now()
where id = '2987830f-906b-4f31-921f-734e6171dd10'::uuid
   or lower(coalesce(office_name, name, '')) = 'kapeeka office';

update public.offices
set
    receipt_business_name = 'DDUMBA PROPERTY MANAGEMENT',
    updated_at = now()
where id = '365ca586-4501-45b3-8d21-f7244ef36603'::uuid
   or lower(coalesce(office_name, name, '')) = 'entebbe operations office';

with branded_offices as (
    select
        id,
        receipt_business_name,
        nullif(
            concat_ws(
                ' · ',
                nullif(receipt_address, ''),
                nullif(receipt_phone, ''),
                nullif(receipt_email, '')
            ),
            ''
        ) as receipt_contact,
        receipt_address,
        receipt_email,
        receipt_footer,
        receipt_logo_url,
        receipt_phone
    from public.offices
    where receipt_business_name is not null
)
update public.payment_receipts pr
set
    receipt_snapshot = jsonb_strip_nulls(
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(
                            jsonb_set(
                                jsonb_set(
                                    coalesce(pr.receipt_snapshot, '{}'::jsonb),
                                    '{companyName}',
                                    coalesce(to_jsonb(bo.receipt_business_name), 'null'::jsonb),
                                    true
                                ),
                                '{companyContact}',
                                coalesce(to_jsonb(bo.receipt_contact), 'null'::jsonb),
                                true
                            ),
                            '{receiptAddress}',
                            coalesce(to_jsonb(bo.receipt_address), 'null'::jsonb),
                            true
                        ),
                        '{receiptEmail}',
                        coalesce(to_jsonb(bo.receipt_email), 'null'::jsonb),
                        true
                    ),
                    '{receiptFooter}',
                    coalesce(to_jsonb(bo.receipt_footer), 'null'::jsonb),
                    true
                ),
                '{receiptLogoUrl}',
                coalesce(to_jsonb(bo.receipt_logo_url), 'null'::jsonb),
                true
            ),
            '{receiptPhone}',
            coalesce(to_jsonb(bo.receipt_phone), 'null'::jsonb),
            true
        )
    ),
    updated_at = now()
from branded_offices bo
where pr.office_id = bo.id
  and pr.payment_type = 'tenant_collection';
