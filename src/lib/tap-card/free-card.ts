/** The free loyalty-only Tap Card (universal card, spec 2026-11-19). Pure helpers. */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const FREE_CARD_NAME_MAX = 80;

export function freeCardUrl(plateCode: string | null): string {
  return plateCode ? `/card/join?plate=${encodeURIComponent(plateCode)}` : "/card/join";
}

export function validateFreeCard(i: { name: string; email: string; ageConfirmed: boolean }): Partial<Record<"name" | "email" | "ageConfirmed", string>> {
  const errors: Partial<Record<"name" | "email" | "ageConfirmed", string>> = {};
  const name = i.name.trim();
  if (!name) errors.name = "Enter your name.";
  else if (name.length > FREE_CARD_NAME_MAX) errors.name = `Keep your name to ${FREE_CARD_NAME_MAX} characters or fewer.`;
  if (!EMAIL_PATTERN.test(i.email.trim()) || i.email.length > 254) errors.email = "Enter a valid email address.";
  if (!i.ageConfirmed) errors.ageConfirmed = "You must be 21 or older to get a Tap Card.";
  return errors;
}
