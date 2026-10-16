/**
 * The cookie that remembers which business someone linked to several members
 * picked on /portal's "Choose a business" screen. See portal-session.server.ts.
 */
export const PORTAL_MEMBER_COOKIE = "portal_member";
export const PORTAL_MEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
