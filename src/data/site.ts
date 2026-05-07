export type Member = {
  name: string;
  locations: string[];
  website: string;
  logo: string | null;
  facebook?: string;
  instagram?: string;
  untappd?: string;
};

export const members: Member[] = [
  {
    name: "Idyllwild BrewPub",
    locations: ["Idyllwild"],
    website: "https://www.idyllwildbrewpub.com/",
    logo: "/members/idyllwild.png",
    facebook: "https://www.facebook.com/pg/euryalebrewing",
    instagram: "https://www.instagram.com/idyllwildbrewpub/",
    untappd: "https://untappd.com/w/idyllwild-brewpub/326785",
  },
  {
    name: "Euryale Brewing Co.",
    locations: ["Riverside"],
    website: "https://euryalebrewing.com/",
    logo: "/members/euryale.png",
    facebook: "https://www.facebook.com/pg/euryalebrewing",
    instagram: "https://www.instagram.com/euryalebrewing/",
    untappd: "https://untappd.com/EuryaleBrewingCo",
  },
  {
    name: "Metabolic Brewing Co.",
    locations: ["Ontario", "Chino"],
    website: "https://metabolicbrewing.com/",
    logo: "/members/metabolic.png",
    facebook: "https://www.facebook.com/people/Metabolic-Brewing-Co/100093501022631/",
    instagram: "https://www.instagram.com/metabolicbrewingco/",
    untappd: "https://untappd.com/MetabolicBrewingCo",
  },
  {
    name: "Luchador Brewing Co.",
    locations: ["Chino Hills", "Cathedral City"],
    website: "https://www.luchadorbrew.com/",
    logo: "/members/luchador.jpg",
    facebook: "https://www.facebook.com/LuchadorBrewingCo/",
    untappd: "https://untappd.com/LuchadorBrewingCompany",
  },
  {
    name: "Mars Brewing Co.",
    locations: ["Rancho Cucamonga"],
    website: "https://www.marsbrewing.com/",
    logo: "/members/mars.jpg",
    facebook: "https://www.facebook.com/MarsBrewingCo/",
    instagram: "https://www.instagram.com/marsbrewingco/",
    untappd: "https://untappd.com/marsbrewingco",
  },
  {
    name: "Carbon Nation Brewing Co.",
    locations: ["Riverside"],
    website: "https://carbonnationbrewing.com/",
    logo: "/members/carbon.jpg",
    facebook: "https://www.facebook.com/carbonnationbrewing",
    instagram: "http://instagram.com/carbonnationbrewing",
    untappd: "https://untappd.com/w/carbon-nation-brewing/540272",
  },
  {
    name: "Left Coast Brewing Co.",
    locations: ["Ontario", "Irvine", "San Clemente", "John Wayne Airport"],
    website: "https://www.leftcoastbrewing.com/",
    logo: "/members/leftcoast.gif",
    untappd: "https://untappd.com/leftcoastbrewco",
  },
  {
    name: "Hangar 24 Brewing Co.",
    locations: ["Redlands", "Riverside", "Lake Havasu City", "Orange County"],
    website: "https://hangar24brewing.com/",
    logo: "/members/hangar24.png",
    untappd: "https://untappd.com/hangar24brewing",
  },
  {
    name: "All Points Brewing Co.",
    locations: ["Riverside"],
    website: "https://www.facebook.com/allpointsbrewingcompany/",
    logo: "/members/allpoints.png",
    untappd: "https://untappd.com/w/all-points-brewing-co/421291",
  },
  {
    name: "Indio Brewing Co.",
    locations: ["Indio"],
    website: "https://www.indiobrewingca.com/",
    logo: "/members/indio.png",
    facebook: "https://www.facebook.com/Indio.Brewing.SoCal/",
    instagram: "https://www.instagram.com/indio_brewing/",
    untappd: "https://untappd.com/Indio_Brewing",
  },
  {
    name: "Coachella Valley Brewing Co.",
    locations: ["Thousand Palms", "Palm Springs"],
    website: "https://www.cvbco.com/",
    logo: "/members/cvbco.png",
    facebook: "https://www.facebook.com/Coachella-Valley-Brewing-Co-432901963394552",
    instagram: "https://www.instagram.com/coachellavalleybrewing/",
    untappd: "https://untappd.com/CoachellaValleyBrewingCompany",
  },
  {
    name: "Consbeeracy Brewing",
    locations: ["Hesperia"],
    website: "https://consbeeracybrewing.com/",
    logo: "/members/consbeeracy.jpg",
    facebook: "https://www.facebook.com/profile.php?id=61552937806945",
    instagram: "https://www.instagram.com/followthefroggg/",
    untappd: "https://untappd.com/w/consbeeracy-brewing/550174",
  },
  {
    name: "GreyWolf Brewing Co.",
    locations: ["Norco"],
    website: "https://greywolfbrewing.com/",
    logo: "/members/greywolf.png",
    facebook: "https://www.facebook.com/1562359227155737",
    instagram: "https://www.instagram.com/greywolfbrewing",
    untappd: "https://untappd.com/GreyWolfBrewingCo",
  },
  {
    name: "Norco Brewing Co.",
    locations: ["Norco"],
    website: "https://www.norcobrewingcompany.com/",
    logo: "/members/norco.jpg",
    facebook: "https://www.facebook.com/profile.php?id=100089868368137",
    instagram: "https://www.instagram.com/norco_brewing_co",
    untappd: "https://untappd.com/Norco_Brewing_Co",
  },
];

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
