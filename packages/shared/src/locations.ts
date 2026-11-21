/**
 * Ethiopian regions and the cities job posts mention most. City ids are
 * stored on user preferences and on jobs; never rename an existing id.
 */
export const REGIONS = [
  { id: "addis_ababa", name: "Addis Ababa" },
  { id: "dire_dawa", name: "Dire Dawa" },
  { id: "oromia", name: "Oromia" },
  { id: "amhara", name: "Amhara" },
  { id: "tigray", name: "Tigray" },
  { id: "sidama", name: "Sidama" },
  { id: "south_ethiopia", name: "South Ethiopia" },
  { id: "central_ethiopia", name: "Central Ethiopia" },
  { id: "south_west", name: "South West Ethiopia" },
  { id: "somali", name: "Somali" },
  { id: "afar", name: "Afar" },
  { id: "benishangul_gumuz", name: "Benishangul-Gumuz" },
  { id: "gambela", name: "Gambela" },
  { id: "harari", name: "Harari" },
] as const;
export type RegionId = (typeof REGIONS)[number]["id"];

export interface City {
  id: string;
  name: string;
  region: RegionId;
  aliases?: string[];
}

export const CITIES: readonly City[] = [
  { id: "addis_ababa", name: "Addis Ababa", region: "addis_ababa", aliases: ["Addis", "Finfinne", "አዲስ አበባ"] },
  { id: "dire_dawa", name: "Dire Dawa", region: "dire_dawa", aliases: ["ድሬዳዋ"] },
  { id: "adama", name: "Adama", region: "oromia", aliases: ["Nazret", "Nazareth", "አዳማ"] },
  { id: "bishoftu", name: "Bishoftu", region: "oromia", aliases: ["Debre Zeyit"] },
  { id: "jimma", name: "Jimma", region: "oromia", aliases: ["ጅማ"] },
  { id: "nekemte", name: "Nekemte", region: "oromia" },
  { id: "ambo", name: "Ambo", region: "oromia" },
  { id: "shashemene", name: "Shashemene", region: "oromia" },
  { id: "asella", name: "Asella", region: "oromia", aliases: ["Asela"] },
  { id: "batu", name: "Batu", region: "oromia", aliases: ["Ziway"] },
  { id: "bale_robe", name: "Robe", region: "oromia", aliases: ["Bale Robe"] },
  { id: "sebeta", name: "Sebeta", region: "oromia" },
  { id: "burayu", name: "Burayu", region: "oromia" },
  { id: "dukem", name: "Dukem", region: "oromia" },
  { id: "modjo", name: "Modjo", region: "oromia", aliases: ["Mojo"] },
  { id: "bahir_dar", name: "Bahir Dar", region: "amhara", aliases: ["ባህር ዳር"] },
  { id: "gondar", name: "Gondar", region: "amhara", aliases: ["Gonder", "ጎንደር"] },
  { id: "dessie", name: "Dessie", region: "amhara", aliases: ["Dese", "ደሴ"] },
  { id: "kombolcha", name: "Kombolcha", region: "amhara" },
  { id: "debre_birhan", name: "Debre Birhan", region: "amhara", aliases: ["Debre Berhan"] },
  { id: "debre_markos", name: "Debre Markos", region: "amhara" },
  { id: "debre_tabor", name: "Debre Tabor", region: "amhara" },
  { id: "woldia", name: "Woldia", region: "amhara", aliases: ["Weldiya"] },
  { id: "mekelle", name: "Mekelle", region: "tigray", aliases: ["Mekele", "መቀሌ"] },
  { id: "adigrat", name: "Adigrat", region: "tigray" },
  { id: "axum", name: "Axum", region: "tigray", aliases: ["Aksum"] },
  { id: "shire", name: "Shire", region: "tigray" },
  { id: "hawassa", name: "Hawassa", region: "sidama", aliases: ["Awassa", "ሀዋሳ"] },
  { id: "arba_minch", name: "Arba Minch", region: "south_ethiopia" },
  { id: "wolaita_sodo", name: "Wolaita Sodo", region: "south_ethiopia", aliases: ["Sodo"] },
  { id: "dilla", name: "Dilla", region: "south_ethiopia" },
  { id: "hosaena", name: "Hosaena", region: "central_ethiopia", aliases: ["Hossana"] },
  { id: "worabe", name: "Worabe", region: "central_ethiopia" },
  { id: "butajira", name: "Butajira", region: "central_ethiopia" },
  { id: "welkite", name: "Welkite", region: "central_ethiopia", aliases: ["Wolkite"] },
  { id: "bonga", name: "Bonga", region: "south_west" },
  { id: "mizan_teferi", name: "Mizan Teferi", region: "south_west", aliases: ["Mizan"] },
  { id: "jijiga", name: "Jijiga", region: "somali" },
  { id: "gode", name: "Gode", region: "somali" },
  { id: "semera", name: "Semera", region: "afar" },
  { id: "asosa", name: "Asosa", region: "benishangul_gumuz", aliases: ["Assosa"] },
  { id: "gambela", name: "Gambela", region: "gambela", aliases: ["Gambella"] },
  { id: "harar", name: "Harar", region: "harari" },
];

export const CITY_IDS: ReadonlySet<string> = new Set(CITIES.map((c) => c.id));
