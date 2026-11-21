import type { FieldSeed } from "./taxonomy";

/**
 * Degree / training programs added to the base list (Ethiopian universities
 * and TVET colleges). Ids are stable slugs: never rename or reuse one.
 */
export const MORE_FIELDS: FieldSeed[] = [
  // Business, economics, administration
  ["banking_insurance", "Banking & Insurance", ["Banking", "Insurance", "Risk Management"]],
  ["auditing", "Auditing", ["Accounting and Auditing", "Internal Audit"]],
  ["taxation", "Taxation & Customs Administration", ["Tax and Customs", "Customs", "Tax"]],
  ["logistics", "Logistics & Transport Management", ["Transport Management", "Logistics"]],
  ["project_management", "Project Management", ["MA in Project Management", "Project Planning"]],
  ["leadership", "Leadership & Good Governance", ["Leadership", "Good Governance"]],
  ["entrepreneurship", "Entrepreneurship & Small Business Management", ["Entrepreneurship", "Small Business"]],
  ["secretarial", "Secretarial Science & Office Management", ["Secretarial Science", "Office Management", "Secretary"]],
  ["records_management", "Records & Archives Management", ["Archives", "Records Management", "Document Management"]],
  ["real_estate", "Real Estate & Property Management", ["Property Management"]],
  ["public_policy", "Public Policy", ["Policy Studies"]],
  ["urban_planning", "Urban Planning & Development", ["Urban Planning", "Urban Design"]],
  ["health_management", "Health Service Management", ["Healthcare Management", "Hospital Management", "Health Management"]],

  // Social sciences, law, humanities, languages, arts
  ["sociology", "Sociology", []],
  ["anthropology", "Social Anthropology", ["Anthropology"]],
  ["gender_studies", "Gender & Development Studies", ["Gender Studies"]],
  ["peace_security", "Peace & Security Studies", ["Conflict Resolution", "Peace Studies", "Federalism"]],
  ["philosophy", "Philosophy", []],
  ["theology", "Theology & Religious Studies", ["Theology", "Religious Studies"]],
  ["library_science", "Library & Information Science", ["Librarianship", "Library Science"]],
  ["civics", "Civics & Ethical Studies", ["Civic Education", "Civics"]],
  ["linguistics", "Linguistics", ["Applied Linguistics"]],
  ["afaan_oromo", "Afaan Oromo Language & Literature", ["Afan Oromo", "Oromo Language"]],
  ["tigrigna", "Tigrigna Language", ["Tigrinya"]],
  ["french", "French Language", ["French"]],
  ["arabic", "Arabic Language", ["Arabic"]],
  ["chinese", "Chinese Language", ["Chinese", "Mandarin"]],
  ["theatre", "Theatre Arts", ["Drama", "Theater"]],
  ["music", "Music", []],
  ["film", "Film & Media Production", ["Filmmaking", "Cinema", "Video Production"]],
  ["graphic_design", "Graphic Design", ["Visual Communication"]],
  ["interior_design", "Interior Design", []],
  ["fashion_design", "Fashion Design", ["Fashion"]],

  // Education
  ["special_needs_education", "Special Needs & Inclusive Education", ["Special Needs Education", "Inclusive Education"]],
  ["early_childhood_education", "Early Childhood Care & Education", ["ECCE", "Kindergarten Teaching", "Preschool"]],
  ["educational_leadership", "Educational Leadership & Management", ["Educational Planning and Management", "School Leadership"]],
  ["adult_education", "Adult Education & Community Development", ["Adult Education"]],
  ["physical_education", "Physical Education", ["PE", "Health and Physical Education"]],

  // Engineering & technology
  ["electromechanical_engineering", "Electromechanical Engineering", []],
  ["automotive_engineering", "Automotive Engineering", []],
  ["construction_management", "Construction Technology & Management", ["COTM", "Construction Management"]],
  ["textile_engineering", "Textile Engineering", ["Textile Technology", "Garment Technology"]],
  ["leather_technology", "Leather Technology", ["Leather Engineering", "Leather Products"]],
  ["food_science", "Food Science & Technology", ["Food Engineering", "Food Process Engineering", "Food Science"]],
  ["materials_engineering", "Materials Science & Engineering", ["Materials Engineering"]],
  ["mining_engineering", "Mining Engineering", ["Mining"]],
  ["agricultural_engineering", "Agricultural Engineering", ["Agricultural Mechanization", "Irrigation Engineering"]],
  ["environmental_engineering", "Environmental Engineering", []],
  ["telecommunication_engineering", "Telecommunication Engineering", ["Communication Engineering", "Telecom"]],
  ["electronics_engineering", "Electronics & Communication Engineering", ["Electronics Engineering", "Electronics"]],
  ["data_science", "Data Science & Analytics", ["Data Analytics", "Big Data"]],
  ["artificial_intelligence", "Artificial Intelligence", ["AI", "Machine Learning"]],
  ["cybersecurity", "Cybersecurity", ["Information Security", "Network Security"]],
  ["computer_networking", "Computer Networking", ["Networking", "Network Administration", "CCNA"]],
  ["gis", "GIS & Remote Sensing", ["GIS", "Remote Sensing", "Geoinformatics"]],
  ["meteorology", "Meteorology & Climate Science", ["Meteorology", "Climate Science"]],

  // Natural sciences, agriculture, environment
  ["biotechnology", "Biotechnology", []],
  ["microbiology", "Microbiology", []],
  ["forestry", "Forestry", ["Agroforestry"]],
  ["natural_resource_management", "Natural Resource Management", ["NRM"]],
  ["wildlife_management", "Wildlife & Ecotourism Management", ["Wildlife Management", "Ecotourism"]],
  ["soil_water", "Soil & Water Conservation", ["Soil Science", "Soil and Water Engineering"]],
  ["plant_science", "Plant Science", ["Crop Science", "Plant Protection"]],
  ["horticulture", "Horticulture", []],
  ["rural_development", "Rural Development & Agricultural Extension", ["Agricultural Extension", "Rural Development"]],
  ["fisheries", "Fisheries & Aquaculture", ["Aquaculture"]],

  // Health
  ["health_officer", "Health Officer", ["Public Health Officer"]],
  ["optometry", "Optometry", []],
  ["physiotherapy", "Physiotherapy", ["Physical Therapy"]],
  ["psychiatry", "Psychiatry & Mental Health", ["Psychiatric Nursing", "Mental Health Nursing", "Mental Health"]],
  ["health_informatics", "Health Informatics", ["Health Information Technology", "HIT"]],
  ["epidemiology", "Epidemiology", []],
  ["reproductive_health", "Reproductive Health", []],
  ["emergency_care", "Emergency & Critical Care", ["Emergency Nursing", "Critical Care Nursing", "Paramedic"]],

  // TVET programs
  ["automotive_technology", "Automotive Technology", ["Auto Mechanic", "Motor Vehicle Engine Servicing", "Automotive"]],
  ["building_construction", "Building Construction Technology", ["Masonry", "Construction Trades", "Building Technology"]],
  ["electrical_installation", "Electrical Installation", ["Building Electrical Installation", "Electricity", "Electrician"]],
  ["metal_manufacturing", "Metal Manufacturing & Welding", ["Metal Work", "Welding", "Machining"]],
  ["woodwork", "Woodwork & Furniture Making", ["Carpentry", "Woodwork", "Furniture"]],
  ["plumbing", "Plumbing & Sanitary Installation", ["Plumbing", "Sanitary Installation"]],
  ["hairdressing", "Hairdressing & Beauty", ["Beauty", "Cosmetology", "Hair and Beauty"]],
  ["culinary_arts", "Food Preparation & Culinary Arts", ["Culinary Arts", "Cooking", "Chef", "Food Preparation"]],
  ["garment_making", "Garment Making & Tailoring", ["Tailoring", "Sewing", "Garment Production"]],
  ["hotel_service", "Hotel & Food and Beverage Service", ["Food and Beverage Service", "Housekeeping", "Front Office"]],
  ["ict_support", "ICT Support & Hardware Service", ["Hardware and Networking Service", "IT Support", "Computer Maintenance"]],
];

/**
 * Aliases that became programs of their own above: removed from the base
 * entries so search doesn't show the same thing twice.
 */
export const PROMOTED_ALIASES: Record<string, string[]> = {
  social_work: ["Sociology", "Social Anthropology"],
  development_studies: ["Rural Development", "Gender Studies"],
  agricultural_economics: ["Rural Development"],
  architecture: ["Urban Planning"],
  mechanical_engineering: ["Automotive Engineering"],
  civil_engineering: ["Construction Technology and Management", "COTM"],
  nutrition: ["Food Science"],
  geology: ["Mining"],
  biology: ["Biotechnology"],
  environmental_science: ["Natural Resource Management", "Forestry"],
  agriculture: ["Plant Science", "Horticulture"],
  public_health: ["Health Officer"],
  fine_arts: ["Graphic Design"],
  tvet_trades: ["Automotive", "Electricity", "Construction Trades", "Metal Work", "Woodwork"],
};

/**
 * Search-only aliases: Amharic names and common short forms. They are never
 * displayed; typing "አካውንቲንግ" finds "Accounting".
 */
export const SEARCH_ALIASES: Record<string, string[]> = {
  accounting: ["አካውንቲንግ", "ሂሳብ አያያዝ", "አካውንቲንግና ፋይናንስ", "Acct"],
  finance: ["ፋይናንስ"],
  management: ["ማኔጅመንት", "ቢዝነስ አስተዳደር", "ቢዝነስ", "Mgmt", "BBA"],
  economics: ["ኢኮኖሚክስ", "Econ"],
  marketing: ["ማርኬቲንግ", "ገበያ"],
  procurement: ["ግዥ", "ሰፕላይ ቼይን", "ፕሮኪዩርመንት", "SCM"],
  hrm: ["የሰው ሀብት", "ሰው ሀብት አስተዳደር", "HR"],
  public_administration: ["ሕዝብ አስተዳደር", "ህዝብ አስተዳደር", "ፐብሊክ አድሚኒስትሬሽን"],
  cooperative: ["ኅብረት ሥራ", "ህብረት ስራ"],
  tourism: ["ቱሪዝም", "ሆቴል"],
  law: ["ሕግ", "ህግ"],
  computer_science: ["ኮምፒውተር ሳይንስ", "ኮምፒዩተር ሳይንስ", "CompSci"],
  software_engineering: ["ሶፍትዌር", "SE"],
  information_technology: ["ኢንፎርሜሽን ቴክኖሎጂ", "አይቲ", "ICT"],
  information_systems: ["ኢንፎርሜሽን ሲስተም"],
  electrical_engineering: ["ኤሌክትሪካል", "ኤሌክትሪክ ምህንድስና", "EE"],
  civil_engineering: ["ሲቪል ምህንድስና", "ሲቪል ኢንጂነሪንግ"],
  mechanical_engineering: ["ሜካኒካል", "ME"],
  architecture: ["አርክቴክቸር"],
  statistics: ["ስታቲስቲክስ"],
  mathematics: ["ሂሳብ", "ማቲማቲክስ", "Maths"],
  physics: ["ፊዚክስ"],
  chemistry: ["ኬሚስትሪ"],
  biology: ["ባዮሎጂ"],
  geology: ["ጂኦሎጂ"],
  medicine: ["ሕክምና", "ህክምና", "ሜዲስን", "ዶክተር"],
  nursing: ["ነርሲንግ", "ነርስ", "BSc Nursing"],
  midwifery: ["ሚድዋይፈሪ", "አዋላጅ"],
  public_health: ["ሕብረተሰብ ጤና", "ህብረተሰብ ጤና"],
  medical_laboratory: ["ላቦራቶሪ", "ላብራቶሪ", "Lab"],
  pharmacy: ["ፋርማሲ"],
  nutrition: ["ስነ ምግብ", "ሥነ ምግብ"],
  psychology: ["ሳይኮሎጂ", "ስነ ልቦና"],
  social_work: ["ሶሻል ወርክ"],
  veterinary: ["የእንስሳት ሕክምና", "ቬተሪናሪ", "DVM"],
  agriculture: ["ግብርና"],
  animal_science: ["እንስሳት ሳይንስ"],
  agricultural_economics: ["ግብርና ኢኮኖሚክስ"],
  education: ["ትምህርት", "መምህርነት", "Teacher Education"],
  english: ["እንግሊዝኛ"],
  amharic: ["አማርኛ"],
  journalism: ["ጋዜጠኝነት", "ጋዜጠኛ"],
  political_science: ["ፖለቲካል ሳይንስ", "ፖለቲካ"],
  geography: ["ጂኦግራፊ"],
  history: ["ታሪክ"],
  sports_science: ["ስፖርት"],
  fine_arts: ["ስነ ጥበብ", "ጥበብ"],
  tvet_trades: ["ቴክኒክና ሙያ", "ቲቪቲ", "TVET"],
  sociology: ["ሶሲዮሎጂ"],
  afaan_oromo: ["ኦሮምኛ", "አፋን ኦሮሞ"],
  tigrigna: ["ትግርኛ"],
  secretarial: ["ሴክሬታሪ", "ፀሐፊ", "ጸሐፊ"],
  automotive_technology: ["አውቶሞቲቭ", "መካኒክ"],
  building_construction: ["ግንባታ", "ሕንፃ ግንባታ"],
  electrical_installation: ["ኤሌክትሪክ", "ኤሌክትሪሺያን"],
  woodwork: ["እንጨት ሥራ", "አናጢ"],
  metal_manufacturing: ["ብረታ ብረት", "ብየዳ"],
  hairdressing: ["ፀጉር ሥራ", "ውበት"],
  culinary_arts: ["ምግብ ዝግጅት", "ምግብ ማብሰል"],
  garment_making: ["ልብስ ስፌት", "ስፌት"],
  health_officer: ["ጤና መኮንን"],
  textile_engineering: ["ጨርቃጨርቅ"],
  leather_technology: ["ቆዳ"],
  forestry: ["ደን"],
  banking_insurance: ["ባንክ", "ኢንሹራንስ"],
  auditing: ["ኦዲት", "ኦዲቲንግ"],
  logistics: ["ሎጅስቲክስ", "ትራንስፖርት"],
  project_management: ["ፕሮጀክት ማኔጅመንት"],
  data_science: ["ዳታ ሳይንስ"],
};

/** Base list + additions, with promoted aliases removed and search aliases appended. */
export function buildFields(base: FieldSeed[]): FieldSeed[] {
  return [...base.filter(([id]) => id !== "any_field"), ...MORE_FIELDS, ...base.filter(([id]) => id === "any_field")].map(
    ([id, name, aliases = []]) => {
      const drop = new Set((PROMOTED_ALIASES[id] ?? []).map((a) => a.toLowerCase()));
      const kept = aliases.filter((a) => !drop.has(a.toLowerCase()));
      return [id, name, [...new Set([...kept, ...(SEARCH_ALIASES[id] ?? [])])]] as FieldSeed;
    },
  );
}
