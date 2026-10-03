/**
 * Typefaces are chosen from a curated list of pairings, never a free font
 * field (spec, "Editing the brand from the admin": "An open font picker
 * guarantees someone tries Comic Sans, and there is no undo for a brand").
 * Every pairing here is a real display+body Google Fonts combination, in
 * the same spirit as the current default, Bricolage Grotesque + Chivo
 * (Brand Design Tokens phase).
 */
export type FontPairing = {
  id: string;
  label: string;
  displayFamily: string;
  displayWeights: string;
  bodyFamily: string;
  bodyWeights: string;
  googleFontsHref: string;
};

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: "bricolage-chivo",
    label: "Bricolage Grotesque + Chivo (default)",
    displayFamily: "Bricolage Grotesque",
    displayWeights: "700;800",
    bodyFamily: "Chivo",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Chivo:wght@400;500;600&display=swap",
  },
  {
    id: "fraunces-karla",
    label: "Fraunces + Karla",
    displayFamily: "Fraunces",
    displayWeights: "600;700",
    bodyFamily: "Karla",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Karla:wght@400;500;600&display=swap",
  },
  {
    id: "space-grotesk-work-sans",
    label: "Space Grotesk + Work Sans",
    displayFamily: "Space Grotesk",
    displayWeights: "600;700",
    bodyFamily: "Work Sans",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Work+Sans:wght@400;500;600&display=swap",
  },
  {
    id: "spectral-public-sans",
    label: "Spectral + Public Sans",
    displayFamily: "Spectral",
    displayWeights: "600;700",
    bodyFamily: "Public Sans",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Spectral:wght@600;700&family=Public+Sans:wght@400;500;600&display=swap",
  },
  {
    id: "big-shoulders-nunito-sans",
    label: "Big Shoulders + Nunito Sans",
    displayFamily: "Big Shoulders",
    displayWeights: "700;800",
    bodyFamily: "Nunito Sans",
    bodyWeights: "400;500;600",
    googleFontsHref:
      "https://fonts.googleapis.com/css2?family=Big+Shoulders:wght@700;800&family=Nunito+Sans:wght@400;500;600&display=swap",
  },
];

export function getFontPairingById(id: string): FontPairing | undefined {
  return FONT_PAIRINGS.find((pairing) => pairing.id === id);
}

export const DEFAULT_FONT_PAIRING_ID = "bricolage-chivo";
