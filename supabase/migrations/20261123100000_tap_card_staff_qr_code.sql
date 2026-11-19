-- Bartender QR codes become 8-character codes in the plate alphabet, so the
-- code can be printed under the QR and matched against the portal. Existing
-- long tokens are cleared; the portal makes a new code on its next view
-- (none were printed yet).
alter table public.tap_card_plates drop constraint if exists tap_card_plates_staff_qr_check;
update public.tap_card_plates set staff_qr = null;
alter table public.tap_card_plates add constraint tap_card_plates_staff_qr_check check (staff_qr ~ '^[0-9A-HJKMNP-TV-Z]{8}$');
