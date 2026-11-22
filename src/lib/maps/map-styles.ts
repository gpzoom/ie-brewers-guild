/// <reference types="google.maps" />
/**
 * Public member maps (Members page, Trail page): hide Google's own business
 * labels -- restaurants, shops, gas stations -- so only our members' pins
 * read as places (owner, 2026-11-21). Streets, cities, parks, schools and
 * transit stay as landmarks. Works only while the maps have no mapId (a
 * cloud-styled map ignores `styles`).
 */
export const MEMBER_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
];
