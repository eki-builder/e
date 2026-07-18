/* =========================
FILE OVERVIEW
========================= */
// Catalog: categories, subcategories, feature checklists, and per-category
// theme sets. Historically this was hardcoded here; it now lives in the
// `platform_config` Appwrite collection (Document ID "catalog") so admins
// can edit it from admin.html without a code deploy.
//
// SEED_CATALOG below is the bootstrap default AND the offline fallback —
// if the Appwrite document doesn't exist yet, or the fetch fails, the app
// still works using this. Requires config.js to be loaded first.

const SEED_CATALOG = {
  generalFeatures: [
    { id: "about",       label: "About Us" },
    { id: "contact",     label: "Contact" },
    { id: "gallery",     label: "Gallery" },
    { id: "testimonials",label: "Testimonials" },
    { id: "team",        label: "Team" },
    { id: "faq",         label: "FAQ" },
    { id: "pricing",     label: "Pricing" },
    { id: "blog",        label: "Blog" },
    { id: "downloads",   label: "Downloads" },
    { id: "social",      label: "Social Media" },
    { id: "maps",        label: "Google Maps" },
    { id: "whatsapp",    label: "WhatsApp Chat" }
  ],
  categories: [
    {
      id: "education", label: "Education",
      subcategories: ["Primary School", "Secondary School", "University / Polytechnic", "Tutorial Centre"],
      specificFeatures: [
        { id: "admissions",  label: "Admissions / Enrollment Form" },
        { id: "calendar",    label: "Academic Calendar" },
        { id: "fees",        label: "School Fees Info" },
        { id: "staff",       label: "Staff Directory" }
      ],
      themeSet: [{ key: "indigo", name: "Modern Indigo" }, { key: "amber", name: "Bright Campus" }, { key: "sage", name: "Calm Sage" }]
    },
    {
      id: "religion", label: "Religion",
      subcategories: ["Church", "Mosque", "Ministry / Outreach"],
      specificFeatures: [
        { id: "sermons",     label: "Sermon / Message Archive" },
        { id: "servicetimes",label: "Service Times" },
        { id: "giving",      label: "Donation / Giving Info" },
        { id: "events",      label: "Event Calendar" }
      ],
      themeSet: [{ key: "indigo", name: "Reverent Indigo" }, { key: "amber", name: "Warm Amber" }, { key: "ink", name: "Solemn Ink" }]
    },
    {
      id: "healthcare", label: "Healthcare",
      subcategories: ["Clinic / Hospital", "Pharmacy", "Diagnostic Lab", "Dental Practice"],
      specificFeatures: [
        { id: "appointments",label: "Book Appointment" },
        { id: "doctors",     label: "Doctors / Specialists" },
        { id: "insurance",   label: "Insurance / HMO Accepted" },
        { id: "emergency",   label: "Emergency Contact" }
      ],
      themeSet: [{ key: "sage", name: "Care Sage" }, { key: "indigo", name: "Trust Indigo" }, { key: "paper", name: "Clean Paper" }]
    },
    {
      id: "hospitality", label: "Hospitality",
      subcategories: ["Hotel / Guest House", "Restaurant / Lounge", "Event Centre", "Short-let Apartments"],
      specificFeatures: [
        { id: "booking",     label: "Room / Menu Booking" },
        { id: "rates",       label: "Room Types & Rates" },
        { id: "reservation", label: "Reservation Form" },
        { id: "amenities",   label: "Amenities" }
      ],
      themeSet: [{ key: "clay", name: "Warm Clay" }, { key: "amber", name: "Bright Amber" }, { key: "indigo", name: "Elegant Indigo" }]
    },
    {
      id: "professional", label: "Professional Services",
      subcategories: ["Law Firm", "Accounting / Consulting", "Real Estate Agency", "Media / Marketing Agency"],
      specificFeatures: [
        { id: "casestudies", label: "Case Studies" },
        { id: "consultation",label: "Book a Consultation" },
        { id: "portal",      label: "Client Portal Link" },
        { id: "certs",       label: "Certifications" }
      ],
      themeSet: [{ key: "ink", name: "Minimal Ink" }, { key: "indigo", name: "Corporate Indigo" }, { key: "paper", name: "Clean Paper" }]
    },
    {
      id: "realestate", label: "Real Estate",
      subcategories: ["Property Developer", "Estate Agency", "Property Management"],
      specificFeatures: [
        { id: "listings",    label: "Property Listings" },
        { id: "plotsizes",   label: "Land / Plot Sizes" },
        { id: "paymentplans",label: "Payment Plans" },
        { id: "sitevisit",   label: "Site Visit Request" }
      ],
      themeSet: [{ key: "clay", name: "Warm Clay" }, { key: "indigo", name: "Corporate Indigo" }, { key: "ink", name: "Minimal Ink" }]
    },
    {
      id: "technology", label: "Technology",
      subcategories: ["Startup / SaaS", "IT Services / Repairs", "App / Software Showcase"],
      specificFeatures: [
        { id: "productfeatures", label: "Product Features" },
        { id: "docs",        label: "API / Docs Link" },
        { id: "demo",        label: "Demo Request" },
        { id: "integrations",label: "Integrations" }
      ],
      themeSet: [{ key: "ink", name: "Minimal Ink" }, { key: "indigo", name: "Modern Indigo" }, { key: "amber", name: "Bright Amber" }]
    },
    {
      id: "nonprofit", label: "Non-Profit",
      subcategories: ["NGO", "Community Foundation", "Advocacy Group"],
      specificFeatures: [
        { id: "programs",    label: "Our Programs" },
        { id: "donate",      label: "Donate / Support" },
        { id: "volunteer",   label: "Volunteer Signup" },
        { id: "impact",      label: "Impact Reports" }
      ],
      themeSet: [{ key: "sage", name: "Care Sage" }, { key: "amber", name: "Warm Amber" }, { key: "indigo", name: "Trust Indigo" }]
    }
  ],
  // Layout variants per section type. The recommendation engine assigns one
  // of these per section for each of the 3 recommendations it builds, so
  // recommendations differ in structure, not just color. Admin-editable in
  // admin.html's Layouts tab.
  sectionLayouts: {
    gallery: [
      { id: "grid", name: "Grid" },
      { id: "carousel", name: "Carousel" }
    ],
    faq: [
      { id: "list", name: "Plain list" },
      { id: "accordion", name: "Accordion" }
    ],
    testimonials: [
      { id: "grid", name: "Card grid" },
      { id: "quote", name: "Single large quote" }
    ]
  },
  // Reusable component toggles the recommendation engine can switch on.
  // Admin-editable in admin.html's Components tab. `appliesTo` is a section
  // id, or "global" for whole-site components.
  components: [
    { id: "sticky_nav",   label: "Sticky navigation bar", appliesTo: "global" },
    { id: "hamburger",    label: "Hamburger menu (mobile)", appliesTo: "global" },
    { id: "whatsapp_btn", label: "Floating WhatsApp button", appliesTo: "contact" },
    { id: "gallery_lightbox", label: "Gallery lightbox on click", appliesTo: "gallery" }
  ]
};

/* Live catalog state — populated by loadCatalog(), read by wizard.js /
   admin.js. Kept as `let` (not const) so a fetch can replace them. */
let GENERAL_FEATURES = SEED_CATALOG.generalFeatures;
let CATEGORIES = SEED_CATALOG.categories;
let CATEGORY_THEME_SETS = buildThemeSetLookup(SEED_CATALOG.categories);
let SECTION_LAYOUTS = SEED_CATALOG.sectionLayouts;
let COMPONENTS = SEED_CATALOG.components;

function buildThemeSetLookup(categories) {
  const lookup = {};
  categories.forEach(c => { lookup[c.id] = c.themeSet; });
  return lookup;
}

function getCategory(id) {
  return CATEGORIES.find(c => c.id === id);
}

function applyCatalog(catalogObj) {
  GENERAL_FEATURES = catalogObj.generalFeatures || SEED_CATALOG.generalFeatures;
  CATEGORIES = catalogObj.categories || SEED_CATALOG.categories;
  CATEGORY_THEME_SETS = buildThemeSetLookup(CATEGORIES);
  SECTION_LAYOUTS = catalogObj.sectionLayouts || SEED_CATALOG.sectionLayouts;
  COMPONENTS = catalogObj.components || SEED_CATALOG.components;
}

// Fetches the live catalog from Appwrite. Falls back to SEED_CATALOG
// (already applied above) if the document doesn't exist yet or the
// request fails for any reason — the wizard should never be blocked by
// this. Safe to call multiple times.
async function loadCatalog() {
  try {
    const doc = await databases.getDocument(DB_ID, COL_PLATFORM_CONFIG, "catalog");
    applyCatalog(JSON.parse(doc.data));
  } catch (err) {
    console.warn("Using built-in catalog (live catalog not loaded):", err.message);
  }
}
