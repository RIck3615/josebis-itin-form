/** Shared package catalog (safe for client + server). */
const PACKAGES = {
  llc_ein_address: {
    id: "llc_ein_address",
    title: "LLC + EIN + Business Address",
    tagline: "U.S. business foundation",
    description:
      "A complete U.S. business setup including LLC formation, EIN registration, and a professional business address to establish credibility, receive mail, and operate legally.",
    paymentLink: "https://buy.stripe.com/bJe9AUbkz8eK60o36o9sk04",
    badge: "Setup",
    requiresPassport: false,
    highlights: ["LLC formation filing", "EIN registration", "Professional business address"],
  },
  itin: {
    id: "itin",
    title: "Get Your ITIN",
    tagline: "Official U.S. tax ID",
    description:
      "Get your official ITIN, the U.S. tax ID for individuals who don’t qualify for a Social Security Number. Our service manages the entire process: reviewing your documents, preparing the application, and helping you avoid delays or rejections. Enjoy full application handling, professional document review, and typical IRS processing times of 6-12 weeks.",
    paymentLink: "https://buy.stripe.com/3cI9AU2O3eD8dsQ9uM9sk08",
    badge: "ITIN",
    requiresPassport: true,
    highlights: ["Full application handling", "Professional document review", "Typical IRS timing 6-12 weeks"],
  },
  elite: {
    id: "elite",
    title: "Elite USA Program",
    tagline: "LLC + EIN + ITIN + 12 months coaching",
    description:
      "Elite USA Program. Simple, clear, and powerful. A complete U.S. business setup with LLC, EIN, ITIN, Business Address, plus 12 months of coaching to help you build credit, stay compliant, and grow your financial power in the United States.",
    paymentLink: "https://buy.stripe.com/14A7sMdsH3Yu3Sg6iA9sk06",
    badge: "Elite",
    featured: true,
    requiresPassport: true,
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
    requiresPassport: Boolean(pkg.requiresPassport),
    highlights: pkg.highlights,
    paymentLink: pkg.paymentLink,
  }));
}

function getPackage(id) {
  return PACKAGES[id] || null;
}

module.exports = { PACKAGES, listPackages, getPackage };
