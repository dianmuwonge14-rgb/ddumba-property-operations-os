-- Allow multiple saved landlord payment methods.
-- Payment details are reusable instructions only; they do not create landlord payments.

alter table public.landlord_payment_details
    add column if not exists label text,
    add column if not exists provider text,
    add column if not exists account_name text,
    add column if not exists account_number text,
    add column if not exists is_default boolean not null default false;

update public.landlord_payment_details
set
    provider = coalesce(provider, mobile_money_provider, bank_name),
    account_name = coalesce(account_name, mobile_money_account_name, bank_account_name),
    account_number = coalesce(account_number, mobile_money_number, bank_account_number),
    label = coalesce(
        label,
        nullif(
            concat_ws(
                ' ',
                case
                    when payment_method = 'mobile_money' then coalesce(mobile_money_provider, 'Mobile Money')
                    when payment_method = 'bank' then bank_name
                    else 'Cash'
                end,
                case
                    when payment_method = 'bank' then 'Account'
                    when payment_method = 'mobile_money' then 'Number'
                    else null
                end
            ),
            ''
        )
    )
where label is null
   or provider is null
   or account_name is null
   or account_number is null;

drop index if exists public.idx_landlord_payment_details_one_active;

create index if not exists idx_landlord_payment_details_methods
    on public.landlord_payment_details(company_id, landlord_id, status, is_active, is_default, created_at desc);

create unique index if not exists idx_landlord_payment_details_one_default
    on public.landlord_payment_details(company_id, landlord_id)
    where is_default = true and status = 'approved' and is_active = true;
