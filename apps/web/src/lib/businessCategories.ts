import { BUSINESS_TEMPLATES } from "./businessTemplates";

export interface BusinessSectorPreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  categories: string[];
}

export const BUSINESS_SECTOR_PRESETS: BusinessSectorPreset[] = [
  {
    id: "supermarket",
    name: "Supermarket & Grocery",
    icon: "🛒",
    description: "Rice, pulses, oils, dairy, snacks, beverages and household products",
    categories: [
      "Rice, Atta & Grains",
      "Pulses & Dals",
      "Cooking Oils & Ghee",
      "Dairy, Milk & Eggs",
      "Spices, Masalas & Salt",
      "Snacks, Biscuits & Namkeen",
      "Tea, Coffee & Beverages",
      "Personal Care & Hygiene",
      "Cleaning & Household",
      "Instant & Packaged Foods",
      "Dry Fruits, Nuts & Seeds",
      "Chocolates & Sweets",
      "Baby Care Products",
      "Pet Supplies",
      "Pooja Essentials",
    ],
  },
  {
    id: "fruits_veg",
    name: "Fruits & Vegetables",
    icon: "🥬",
    description: "Fresh farm produce, greens, exotic veggies, fruits and organic items",
    categories: [
      "Fresh Vegetables",
      "Fresh Fruits",
      "Leafy Greens & Keerai",
      "Exotic Vegetables",
      "Seasonal & Imported Fruits",
      "Dry Fruits & Nuts",
      "Hydroponic & Organic Produce",
      "Cut Vegetables & Salads",
      "Herbs, Ginger & Garlic",
      "Fresh Juices & Coconuts",
    ],
  },
  {
    id: "garments",
    name: "Garments, Textiles & Fashion",
    icon: "👗",
    description: "Men's, women's, kids' apparel, sarees, fabrics, footwear and accessories",
    categories: [
      "Men's Wear",
      "Women's Wear",
      "Kids & Infant Wear",
      "Sarees, Dhotis & Ethnic",
      "Innerwear & Nightwear",
      "Fabrics, Linens & Suiting",
      "Footwear & Socks",
      "Fashion Accessories",
      "Bags, Belts & Wallets",
      "School & Work Uniforms",
    ],
  },
  {
    id: "healthcare",
    name: "Healthcare, Pharmacy & Clinic",
    icon: "🏥",
    description: "Medicines, wellness, surgicals, lab tests, OPD and dental services",
    categories: [
      "Allopathic Medicines (Rx)",
      "OTC & General Medicines",
      "Ayurvedic & Herbal",
      "Vitamins & Health Supplements",
      "First Aid & Surgical Supplies",
      "Medical Devices & Monitors",
      "Mother & Baby Healthcare",
      "Skincare & Dermatological",
      "OPD Consultations",
      "Diagnostic & Lab Tests",
      "Dental Treatments",
      "Physiotherapy & Rehab",
    ],
  },
  {
    id: "salon",
    name: "Salon, Spa & Beauty Care",
    icon: "💇",
    description: "Hair styling, facials, skin care, makeup, massage and grooming",
    categories: [
      "Haircut & Styling",
      "Hair Colouring & Streaks",
      "Hair Spa & Keratin Treatments",
      "Facials & Cleanup",
      "Bleach & D-Tan",
      "Waxing & Threading",
      "Manicure & Pedicure",
      "Bridal & Event Makeup",
      "Body Spa & Massage",
      "Men's Beard & Grooming",
      "Cosmetics & Salon Retail Products",
    ],
  },
  {
    id: "food",
    name: "Restaurant, Cafe & Bakery",
    icon: "🍽️",
    description: "Starters, main course, biryani, cakes, coffee, fast food and combos",
    categories: [
      "Starters & Appetizers",
      "Main Course (Veg & Non-Veg)",
      "Breads, Naan & Rotis",
      "Biryani & Rice Dishes",
      "South Indian & Tiffin",
      "Chinese & Fast Food",
      "Cakes, Pastries & Desserts",
      "Hot Teas & Coffees",
      "Fresh Juices, Shakes & Coolers",
      "Combos, Thalis & Meal Boxes",
    ],
  },
  {
    id: "fitness",
    name: "Gym, Fitness & Yoga",
    icon: "🏋️",
    description: "Memberships, personal training, supplements, fitness gear and classes",
    categories: [
      "Gym Memberships",
      "Personal Training Packages",
      "Cardio & Crossfit Sessions",
      "Yoga & Pilates Batches",
      "Protein & Nutritional Supplements",
      "Gym Accessories & Shakers",
      "Fitness Apparel & Gloves",
      "Locker & Day Pass",
    ],
  },
  {
    id: "automobile",
    name: "Automobile & Bike Workshop",
    icon: "🔧",
    description: "Periodic service, spares, oils, tyres, car wash and detailing",
    categories: [
      "General Periodic Service",
      "Engine Oil & Lubricants",
      "Brake System & Pads",
      "Clutch & Transmission",
      "Electrical & Battery Service",
      "Tyres, Tubes & Puncture",
      "Wheel Alignment & Balancing",
      "Car & Bike Wash Detailing",
      "OEM Spare Parts",
      "AC Service & Gas Top-up",
      "Labour & Mechanical Charges",
    ],
  },
  {
    id: "hardware",
    name: "Electrical, Hardware & Paints",
    icon: "⚡",
    description: "Switches, wires, plumbing pipes, tools, paints, taps and fasteners",
    categories: [
      "Electrical Switches & Sockets",
      "Wires, Cables & Conduits",
      "LED Lights, Fans & Fixtures",
      "MCBs, DBs & Switchgear",
      "PVC Pipes & Plumbing Fittings",
      "Power Tools & Hand Tools",
      "Paints, Primers & Distemper",
      "Adhesives, Sealants & Waterproofing",
      "Sanitaryware & Taps",
      "Nuts, Bolts & Fasteners",
      "Safety Gear & Helmets",
    ],
  },
  {
    id: "electronics",
    name: "Mobiles, Computers & Electronics",
    icon: "📱",
    description: "Smartphones, chargers, laptops, peripherals, audio and appliances",
    categories: [
      "Smartphones & Mobiles",
      "Mobile Covers & Screen Guards",
      "Fast Chargers & USB Cables",
      "Earphones, TWS & Headphones",
      "Laptops, PCs & Monitors",
      "Keyboards, Mouse & Peripherals",
      "Storage, Pen Drives & SSDs",
      "Smartwatches & Bands",
      "Home & Kitchen Appliances",
      "Repair Services & Spare Parts",
    ],
  },
  {
    id: "services",
    name: "Services, IT & Maintenance",
    icon: "🛠️",
    description: "AC service, electricians, plumbers, CCTV, IT support and marketing",
    categories: [
      "AC Installation & Repair",
      "Electrician Service Calls",
      "Plumber Service Calls",
      "CCTV Installation & AMC",
      "Computer & Printer AMC",
      "Networking & Wi-Fi Setup",
      "Website & Software Development",
      "Digital Marketing & Social Media",
      "Deep Cleaning & Housekeeping",
      "Pest Control Services",
    ],
  },
  {
    id: "stationery",
    name: "Courier, Printing & Stationery",
    icon: "📦",
    description: "Courier, color printing, books, pens, registers and packaging",
    categories: [
      "Domestic & International Courier",
      "Color & B/W Xerox / Printing",
      "Visiting Cards & Pamphlets",
      "Banner & Flex Printing",
      "Books, Notebooks & Registers",
      "Pens, Markers & Art Supplies",
      "Office Stationery & Files",
      "Packaging Boxes & Bubble Wrap",
    ],
  },
  {
    id: "education",
    name: "Education, Coaching & Tuition",
    icon: "🎓",
    description: "Tuitions, exam coaching, computer courses, books and test series",
    categories: [
      "School / Board Tuitions",
      "Competitive Exam Coaching",
      "Spoken English & Languages",
      "Computer & Coding Courses",
      "Study Materials & Question Banks",
      "Mock Tests & Exam Registration",
      "Admission & Term Fees",
    ],
  },
  {
    id: "furniture",
    name: "Furniture & Interior Decor",
    icon: "🛋️",
    description: "Sofas, beds, office chairs, dining tables, mattresses and decor",
    categories: [
      "Living Room Sofas & Recliners",
      "Beds & Wardrobes",
      "Office Desks & Ergonomic Chairs",
      "Dining Tables & Chairs",
      "Mattresses, Pillows & Bed Linen",
      "Curtains, Rugs & Cushions",
      "Wall Decor & Clocks",
      "Modular Kitchen Cabinets",
    ],
  },
  {
    id: "pets",
    name: "Pet Shop & Veterinary Care",
    icon: "🐶",
    description: "Pet food, chews, collars, medicines, shampoos and accessories",
    categories: [
      "Dog Food & Treats",
      "Cat Food & Gravy",
      "Pet Toys & Chews",
      "Leashes, Collars & Harnesses",
      "Pet Shampoos & Grooming",
      "Veterinary Medicines & Supplements",
      "Pet Beds & Travel Crates",
      "Bird & Fish Feed / Accessories",
    ],
  },
  {
    id: "jewellery",
    name: "Jewellery & Valuables",
    icon: "💎",
    description: "Gold, silver, diamond, gemstones, fashion jewellery and polishing",
    categories: [
      "Gold Jewellery (22K / 18K)",
      "Silver Articles & Ornaments",
      "Diamond & Solitaire Jewellery",
      "Precious Gemstones & Birthstones",
      "Fashion & Imitation Jewellery",
      "Jewellery Cleaning & Repair",
      "Custom Casting & Making Charges",
    ],
  },
  {
    id: "laundry",
    name: "Laundry & Dry Cleaning",
    icon: "🧺",
    description: "Wash & fold, steam pressing, dry cleaning, blazers and shoe spa",
    categories: [
      "Daily Wash & Fold (by kg)",
      "Steam Pressing / Ironing",
      "Executive Dry Cleaning",
      "Suits, Blazers & Silk Sarees",
      "Curtains, Quilts & Blankets",
      "Shoe Laundry & Bag Spa",
    ],
  },
  {
    id: "tailoring",
    name: "Tailoring & Boutique",
    icon: "🪡",
    description: "Blouses, salwar suits, shirts, trousers, alterations and embroidery",
    categories: [
      "Custom Blouse Stitching",
      "Salwar Suit & Kurti Stitching",
      "Formal Shirt & Pant Tailoring",
      "Coat, Suit & Sherwani",
      "Alterations, Hemming & Zipper",
      "Aari, Maggam & Hand Embroidery",
      "School & Hospital Uniforms",
    ],
  },
];

// All Unique Master Categories across all sectors
export const ALL_BUSINESS_CATEGORIES: string[] = Array.from(
  new Set(BUSINESS_SECTOR_PRESETS.flatMap((s) => s.categories))
).sort((a, b) => a.localeCompare(b));

// Helper to get all categories belonging to a specific business template code from BUSINESS_TEMPLATES
export function getCategoriesForTemplate(templateCode: string): string[] {
  const t = BUSINESS_TEMPLATES[templateCode];
  if (!t) return [];

  // Match sector preset if available
  const matchSector = BUSINESS_SECTOR_PRESETS.find(
    (p) =>
      p.id === templateCode ||
      p.name.toLowerCase().includes(t.sector.toLowerCase()) ||
      t.sector.toLowerCase().includes(p.name.toLowerCase())
  );
  if (matchSector) {
    return matchSector.categories;
  }

  // Fallback to template name & starter item types
  return [t.name, `${t.name} General`, `${t.name} Services`];
}

