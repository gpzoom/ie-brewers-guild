-- The Beer Trail offer's wording (owner, 2026-11-21): set on Guild Settings
-- instead of in code. One offer for every trail stop. The default is the
-- wording the code used until now, so nothing changes until it's edited.
alter table public.site_settings
  add column if not exists trail_offer text not null
    default 'Your first beer for a nickel'
    constraint site_settings_trail_offer_length
      check (char_length(btrim(trail_offer)) between 3 and 80);
