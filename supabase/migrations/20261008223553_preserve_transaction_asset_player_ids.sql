alter table public.transaction_assets
  add column provider_espn_player_id bigint;

comment on column public.transaction_assets.provider_espn_player_id is
  'Player identifier observed in a provider transaction asset. It is retained even when the canonical player identity is unavailable.';
