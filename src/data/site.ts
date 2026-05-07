export const members = [
  { name: "Idyllwild BrewPub", neighborhood: "Idyllwild", style: "Mountain-town craft ales", website: "#" },
  { name: "Euryale Brewing Co.", neighborhood: "Riverside", style: "Belgian-inspired ales", website: "#" },
  { name: "Metabolic Brewing Co.", neighborhood: "Hemet", style: "Experimental small batches", website: "#" },
  { name: "Luchador Brewing Co.", neighborhood: "Moreno Valley", style: "Mexican-style lagers", website: "#" },
  { name: "Mars Brewing Co.", neighborhood: "Riverside", style: "Hop-forward IPAs", website: "#" },
  { name: "Carbon Nation Brewing Co.", neighborhood: "Corona", style: "Modern hazy IPAs", website: "#" },
  { name: "Left Coast Brewing Co.", neighborhood: "San Clemente", style: "West Coast classics", website: "#" },
  { name: "Hangar 24 Brewing Co.", neighborhood: "Redlands", style: "Orange Wheat & lagers", website: "#" },
  { name: "All Points Brewing Co.", neighborhood: "Corona", style: "Balanced sessionables", website: "#" },
  { name: "Indio Brewing Co.", neighborhood: "Indio", style: "Desert-inspired ales", website: "#" },
  { name: "Coachella Valley Brewing Co.", neighborhood: "Thousand Palms", style: "Valley-grown craft beer", website: "#" },
  { name: "Consbeeracy Brewing", neighborhood: "Inland Empire", style: "Bold, unconventional brews", website: "#" },
  { name: "GreyWolf Brewing Co.", neighborhood: "Temecula", style: "Wine-country ales", website: "#" },
  { name: "Norco Brewing Co.", neighborhood: "Norco", style: "Horsetown small-batch ales", website: "#" },
] as const;

export const events = [
  {
    slug: "independent-beer-fest",
    title: "Independent Beer Fest",
    date: "Saturday, June 14",
    location: "Harbor Park",
    excerpt:
      "Our flagship beer-week kick-off festival brings 40+ independent breweries together for an afternoon of tastings, food, and live music.",
    featured: true,
  },
  {
    slug: "members-summit",
    title: "Spring Members Summit",
    date: "Thursday, May 22",
    location: "Brightline Brewhouse",
    excerpt: "Quarterly meeting for guild members. Industry updates, legislative briefings, and a round-table.",
  },
  {
    slug: "collab-brew-day",
    title: "Collaboration Brew Day",
    date: "Sunday, July 6",
    location: "Foundry & Foam",
    excerpt: "Brewers from across the guild join for a single-day collab brew. Proceeds support local food banks.",
  },
  {
    slug: "homebrew-clinic",
    title: "Homebrew Clinic",
    date: "Saturday, August 9",
    location: "Hollow Oak Beer Co.",
    excerpt: "Pro brewers walk homebrewers through recipe design, water chemistry, and dialing in your fermentation.",
  },
] as const;

export const news = [
  {
    slug: "guild-grows-to-50",
    date: "April 28, 2026",
    title: "Guild Welcomes Three New Member Breweries",
    excerpt:
      "We're thrilled to announce that Cascade & Crown, Mesa Verde, and Granary Street have joined the guild this spring.",
  },
  {
    slug: "advocacy-win-2026",
    date: "March 12, 2026",
    title: "State Legislature Passes Small-Brewer Tax Relief",
    excerpt:
      "After two years of guild-led advocacy, independent breweries under 60,000 barrels qualify for renewed excise relief.",
  },
  {
    slug: "beer-week-recap",
    date: "February 4, 2026",
    title: "Beer Week 2026: A Look Back",
    excerpt:
      "Recap of more than 80 events across the region, the highest member participation in guild history.",
  },
] as const;
