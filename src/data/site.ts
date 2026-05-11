export type Location = {
  city: string;
  address: string;
  lat: number;
  lng: number;
};

export type Member = {
  name: string;
  locations: Location[];
  website: string;
  logo: string | null;
  facebook?: string;
  instagram?: string;
  untappd?: string;
};

export const members: Member[] = [
  {
    name: "Idyllwild BrewPub",
    locations: [
      {
        city: "Idyllwild",
        address: "54423 Village Center Dr, Idyllwild-Pine Cove, CA 92549",
        lat: 33.7432313,
        lng: -116.7129481,
      },
    ],
    website: "https://www.idyllwildbrewpub.com/",
    logo: "/members/idyllwild.png",
    facebook: "https://www.facebook.com/pg/euryalebrewing",
    instagram: "https://www.instagram.com/idyllwildbrewpub/",
    untappd: "https://untappd.com/w/idyllwild-brewpub/326785",
  },
  {
    name: "Euryale Brewing Co.",
    locations: [
      {
        city: "Riverside",
        address: "2060 Chicago Ave STE A17, Riverside, CA 92507",
        lat: 33.992759,
        lng: -117.347977,
      },
    ],
    website: "https://euryalebrewing.com/",
    logo: "/members/euryale.png",
    facebook: "https://www.facebook.com/pg/euryalebrewing",
    instagram: "https://www.instagram.com/euryalebrewing/",
    untappd: "https://untappd.com/EuryaleBrewingCo",
  },
  {
    name: "Metabolic Brewing Co.",
    locations: [
      {
        city: "Ontario",
        address: "1609 S Grove Ave unit 109, Ontario, CA 91761",
        lat: 34.0444243,
        lng: -117.6276227,
      },
      {
        city: "Chino",
        address: "5135 Edison Ave #1, Chino, CA 91710",
        lat: 33.9969177,
        lng: -117.6926117,
      },
    ],
    website: "https://metabolicbrewing.com/",
    logo: "/members/metabolic.png",
    facebook: "https://www.facebook.com/people/Metabolic-Brewing-Co/100093501022631/",
    instagram: "https://www.instagram.com/metabolicbrewingco/",
    untappd: "https://untappd.com/MetabolicBrewingCo",
  },
  {
    name: "Luchador Brewing Co.",
    locations: [
      {
        city: "Chino Hills",
        address: "15941 Pomona Rincon Rd Suite 100, Chino Hills, CA 91709",
        lat: 33.9647075,
        lng: -117.689147,
      },
      {
        city: "Cathedral City",
        address: "68510 E Palm Canyon Dr #140, Cathedral City, CA 92234",
        lat: 33.7808019,
        lng: -116.4662747,
      },
    ],
    website: "https://www.luchadorbrew.com/",
    logo: "/members/luchador.jpg",
    facebook: "https://www.facebook.com/LuchadorBrewingCo/",
    untappd: "https://untappd.com/LuchadorBrewingCompany",
  },
  {
    name: "Mars Brewing Co.",
    locations: [
      {
        city: "Rancho Cucamonga",
        address: "9728 6th St, Rancho Cucamonga, CA 91730",
        lat: 34.0855187,
        lng: -117.5922848,
      },
    ],
    website: "https://www.marsbrewing.com/",
    logo: "/members/mars.jpg",
    facebook: "https://www.facebook.com/MarsBrewingCo/",
    instagram: "https://www.instagram.com/marsbrewingco/",
    untappd: "https://untappd.com/marsbrewingco",
  },
  {
    name: "Carbon Nation Brewing Co.",
    locations: [
      {
        city: "Riverside",
        address: "9860 Indiana Ave UNIT 19, Riverside, CA 92503",
        lat: 33.9097901,
        lng: -117.4472297,
      },
    ],
    website: "https://carbonnationbrewing.com/",
    logo: "/members/carbon.jpg",
    facebook: "https://www.facebook.com/carbonnationbrewing",
    instagram: "http://instagram.com/carbonnationbrewing",
    untappd: "https://untappd.com/w/carbon-nation-brewing/540272",
  },
  {
    name: "Left Coast Brewing Co.",
    locations: [
      {
        city: "Ontario",
        address: "980 N Haven Ave ste 100, Ontario, CA 91764",
        lat: 34.0769886,
        lng: -117.5748354,
      },
      {
        city: "Irvine",
        address: "6652 Irvine Center Dr, Irvine, CA 92618",
        lat: 33.6682056,
        lng: -117.764,
      },
      {
        city: "San Clemente",
        address: "1245 Puerta Del Sol, San Clemente, CA 92673",
        lat: 33.4576821,
        lng: -117.5887716,
      },
      {
        city: "John Wayne Airport",
        address: "John Wayne Airport, Santa Ana, CA 92707",
        lat: 33.6757,
        lng: -117.8682,
      },
    ],
    website: "https://www.leftcoastbrewing.com/",
    logo: "/members/leftcoast.gif",
    untappd: "https://untappd.com/leftcoastbrewco",
  },
  {
    name: "Hangar 24 Brewing Co.",
    locations: [
      {
        city: "Redlands",
        address: "1710 Sessums Dr, Redlands, CA 92374",
        lat: 34.0832257,
        lng: -117.1419363,
      },
      {
        city: "Riverside",
        address: "5225 Canyon Crest Dr UNIT 58, Riverside, CA 92507",
        lat: 33.9565798,
        lng: -117.3317005,
      },
      {
        city: "Lake Havasu City",
        address: "5600 AZ-95 Unit 6, Lake Havasu City, AZ 86404",
        lat: 34.5692775,
        lng: -114.3613859,
      },
      // TODO: user to provide verified Orange County address
      {
        city: "Orange County",
        address: "17877 Von Karman Ave Unit 110, Irvine, CA 92614",
        lat: 33.6855295,
        lng: -117.8479787,
      },
    ],
    website: "https://hangar24brewing.com/",
    logo: "/members/hangar24.png",
    untappd: "https://untappd.com/hangar24brewing",
  },
  {
    name: "All Points Brewing Co.",
    locations: [
      {
        city: "Riverside",
        address: "2023 Chicago Ave Unit B8, Riverside, CA 92507",
        lat: 33.9927854,
        lng: -117.3497578,
      },
    ],
    website: "https://www.facebook.com/allpointsbrewingcompany/",
    logo: "/members/allpoints.png",
    untappd: "https://untappd.com/w/all-points-brewing-co/421291",
  },
  {
    name: "Indio Brewing Co.",
    locations: [
      {
        city: "Indio",
        address: "82900 Ave 42 Unit G111, Indio, CA 92203",
        lat: 33.7454263,
        lng: -116.2184074,
      },
    ],
    website: "https://www.indiobrewingca.com/",
    logo: "/members/indio.png",
    facebook: "https://www.facebook.com/Indio.Brewing.SoCal/",
    instagram: "https://www.instagram.com/indio_brewing/",
    untappd: "https://untappd.com/Indio_Brewing",
  },
  {
    name: "Coachella Valley Brewing Co.",
    locations: [
      {
        city: "Thousand Palms",
        address: "30640 Gunther St, Thousand Palms, CA 92276",
        lat: 33.8265067,
        lng: -116.4014097,
      },
      {
        city: "Palm Springs",
        address: "155 S Palm Canyon Dr B24, Palm Springs, CA 92262",
        lat: 33.8220567,
        lng: -116.547218,
      },
    ],
    website: "https://www.cvbco.com/",
    logo: "/members/cvbco.png",
    facebook: "https://www.facebook.com/Coachella-Valley-Brewing-Co-432901963394552",
    instagram: "https://www.instagram.com/coachellavalleybrewing/",
    untappd: "https://untappd.com/CoachellaValleyBrewingCompany",
  },
  {
    name: "Consbeeracy Brewing",
    locations: [
      {
        city: "Hesperia",
        address: "11352 Hesperia Rd Ste B, Hesperia, CA 92345",
        lat: 34.4573338,
        lng: -117.2950416,
      },
    ],
    website: "https://consbeeracybrewing.com/",
    logo: "/members/consbeeracy.jpg",
    facebook: "https://www.facebook.com/profile.php?id=61552937806945",
    instagram: "https://www.instagram.com/followthefroggg/",
    untappd: "https://untappd.com/w/consbeeracy-brewing/550174",
  },
  {
    name: "GreyWolf Brewing Co.",
    locations: [
      {
        city: "Norco",
        address: "1780 Town and Country Dr STE 101, Norco, CA 92860",
        lat: 33.9279055,
        lng: -117.5594224,
      },
    ],
    website: "https://greywolfbrewing.com/",
    logo: "/members/greywolf.png",
    facebook: "https://www.facebook.com/1562359227155737",
    instagram: "https://www.instagram.com/greywolfbrewing",
    untappd: "https://untappd.com/GreyWolfBrewingCo",
  },
  {
    name: "Norco Brewing Co.",
    locations: [
      {
        city: "Norco",
        address: "110 North Dr, Norco, CA 92860",
        lat: 33.9533459,
        lng: -117.5240139,
      },
    ],
    website: "https://www.norcobrewingcompany.com/",
    logo: "/members/norco.jpg",
    facebook: "https://www.facebook.com/profile.php?id=100089868368137",
    instagram: "https://www.instagram.com/norco_brewing_co",
    untappd: "https://untappd.com/Norco_Brewing_Co",
  },
];

export const events = [
  {
    slug: "frontier-beer-fest",
    title: "Frontier Beer Fest",
    date: "Saturday, May 30",
    location: "Idyllwild",
    excerpt:
      "Our flagship beer festival brings independent breweries together for an afternoon of tastings, food, and live music in the mountains.",
    featured: true,
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
