export const members = [
  { name: "Ironwheel Brewing", neighborhood: "Eastside", style: "Hop-forward IPAs", website: "#" },
  { name: "Coastline Cellars", neighborhood: "Harbor District", style: "Coastal lagers", website: "#" },
  { name: "Hollow Oak Beer Co.", neighborhood: "North Hills", style: "Barrel-aged stouts", website: "#" },
  { name: "Brightline Brewhouse", neighborhood: "Downtown", style: "Belgian & farmhouse", website: "#" },
  { name: "Foundry & Foam", neighborhood: "Industrial Arts", style: "Classic pilsners", website: "#" },
  { name: "Sunset Wort Works", neighborhood: "South Bay", style: "Hazy & fruited sours", website: "#" },
  { name: "Granary Street Brewing", neighborhood: "Old Town", style: "English session ales", website: "#" },
  { name: "Mesa Verde Brewery", neighborhood: "West End", style: "Mexican lagers", website: "#" },
  { name: "Cascade & Crown", neighborhood: "Riverside", style: "PNW-style IPAs", website: "#" },
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
