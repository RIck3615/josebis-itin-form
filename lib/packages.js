/** Shared package catalog (safe for client + server). */
const PACKAGES = {
  llc_ein_address: {
    id: "llc_ein_address",
    title: "LLC + EIN + Business Address",
    tagline: "U.S. business foundation",
    description:
      "A complete U.S. business setup including LLC formation, EIN registration, and a professional business address to establish credibility, receive mail, and operate legally. Available for Wyoming, Delaware, Texas, and New Mexico.",
    paymentLink: "https://buy.stripe.com/bJe9AUbkz8eK60o36o9sk04",
    price: "$498.00",
    badge: "Setup",
    formPage: "get-llc.html",
    requiresForm: true,
    requiresPassport: true,
    highlights: ["LLC formation filing", "EIN registration", "Professional business address"],
  },
  itin: {
    id: "itin",
    title: "Get Your ITIN",
    tagline: "Official U.S. tax ID",
    description:
      "Get your official ITIN, the U.S. tax ID for individuals who don’t qualify for a Social Security Number. Our service manages the entire process: reviewing your documents, preparing the application, and helping you avoid delays or rejections. Enjoy full application handling, professional document review, and typical IRS processing times of 6-12 weeks.",
    paymentLink: "https://buy.stripe.com/3cI8wQ0FV8eKcoM4as9sk07",
    price: "$349.99",
    badge: "ITIN",
    formPage: "get-itin.html",
    requiresForm: true,
    requiresPassport: true,
    highlights: ["Full application handling", "Professional document review", "Typical IRS timing 6-12 weeks"],
  },
  elite: {
    id: "elite",
    title: "Elite USA Program",
    tagline: "Simple, clear, and powerful",
    description:
      "Launch your U.S. business with a complete setup package including LLC, EIN, ITIN, and a U.S. Business Address, plus 12 months of personalized coaching to help you build credit, stay compliant, and grow your financial power in the United States.",
    paymentLink: "https://buy.stripe.com/14A7sMdsH3Yu3Sg6iA9sk06",
    price: "$2,499.00",
    badge: "Elite",
    featured: true,
    formPage: "get-elite.html",
    requiresForm: true,
    requiresPassport: false,
    highlights: ["LLC + EIN + business address", "ITIN application support", "12 months of coaching"],
  },
};

function listPackages() {
  return Object.values(PACKAGES).map((pkg) => ({
    id: pkg.id,
    title: pkg.title,
    tagline: pkg.tagline,
    description: pkg.description,
    badge: pkg.badge,
    featured: Boolean(pkg.featured),
    formPage: pkg.formPage || null,
    requiresForm: Boolean(pkg.requiresForm),
    requiresPassport: Boolean(pkg.requiresPassport),
    highlights: pkg.highlights,
    paymentLink: pkg.paymentLink,
    price: pkg.price || null,
  }));
}

function getPackage(id) {
  return PACKAGES[id] || null;
}

module.exports = { PACKAGES, listPackages, getPackage };
