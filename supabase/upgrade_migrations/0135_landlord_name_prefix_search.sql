-- Phase: landlord search performance.
-- Additive only. Prefix-search indexes for landlord-name-only search.

create index if not exists idx_landlord_search_index_normalized_name_prefix
    on public.landlord_search_index (normalized_name text_pattern_ops);

create index if not exists idx_landlords_full_name_lower_prefix
    on public.landlords ((lower(coalesce(full_name, ''))) text_pattern_ops);

create index if not exists idx_landlords_normalized_full_name_prefix
    on public.landlords ((lower(regexp_replace(coalesce(full_name, ''), '[^a-zA-Z0-9]+', ' ', 'g'))) text_pattern_ops);
