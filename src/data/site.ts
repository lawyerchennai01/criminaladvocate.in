import categories from './categories.json';

export const SITE = {
  url: 'https://criminaladvocate.in',
  name: 'Rajendra Criminal Law Firm',
  tagline: 'Criminal Defence · Madras High Court · Chennai',
  description:
    'Rajendra Criminal Law Firm is a criminal defence practice in Chennai appearing before the Madras High Court. Informational guides on bail, FIR quashing, NDPS, cyber crime, cheque bounce and more.',
  // Single source of truth for every phone / WhatsApp / mail CTA on the site.
  phoneDisplay: '+91 99942 87060',
  phoneTel: '+919994287060',
  whatsapp: '919994287060',
  email: 'criminaladvocate.in@gmail.com',
  address: {
    street: '8/13, Bharathi Salai, Mogappair West',
    locality: 'Chennai',
    region: 'Tamil Nadu',
    postalCode: '600037',
    country: 'IN',
  },
  highCourtOffice:
    'Andhra Insurance Building, 3rd Floor, Door No. 14, 156 (New 323), Thambu Chetty Street, Chennai 600001',
  geo: { lat: 13.0801065, lng: 80.1706755 },
  hours: ['Mon–Sat: 9.30 am – 7.30 pm', 'Sun: 10.00 am – 1.00 pm', 'By appointment only'],
  logo: '/logo.webp',
};

export type Category = { slug: string; name: string; path: string; parent: string | null; count: number };
export const CATEGORIES = categories as Category[];
export const catUrl = (c: Category) => `/attorneys-lawyers-chennai/${c.path}/`;
export const catBySlug = (slug: string) => CATEGORIES.find((c) => c.slug === slug);

/** Practice areas shown in the header mega-menu and footer, in priority order. */
export const FEATURED_SLUGS = [
  'bail', 'criminal-defense', 'arrest-and-custody', 'fir-and-investigation', 'criminal-procedure', 'cyber-crime-law',
  'drug-cases', 'financial-fraud', 'economic-offences', 'family-law', 'defamation', 'real-estate-fraud',
  'civil-and-human-rights', 'technology-theft',
];
export const FEATURED = FEATURED_SLUGS.map((s) => catBySlug(s)).filter(Boolean) as Category[];

export const waLink = (pageUrl: string) =>
  `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
    `Hello ${SITE.name},\n\nI would like information about a criminal law matter.\n\nPage: ${pageUrl}`,
  )}`;
export const mailLink = (pageUrl: string) =>
  `mailto:${SITE.email}?subject=${encodeURIComponent('Enquiry from criminaladvocate.in')}&body=${encodeURIComponent(
    `Hello,\n\nI would like information about a criminal law matter.\n\nPage: ${pageUrl}`,
  )}`;

export function legalServiceSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': ['LegalService', 'LocalBusiness'],
    '@id': `${SITE.url}/#legalservice`,
    name: SITE.name,
    url: SITE.url + '/',
    description: SITE.description,
    logo: SITE.url + SITE.logo,
    image: SITE.url + SITE.logo,
    telephone: SITE.phoneTel,
    email: SITE.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.street,
      addressLocality: SITE.address.locality,
      addressRegion: SITE.address.region,
      postalCode: SITE.address.postalCode,
      addressCountry: SITE.address.country,
    },
    geo: { '@type': 'GeoCoordinates', latitude: SITE.geo.lat, longitude: SITE.geo.lng },
    areaServed: [
      { '@type': 'City', name: 'Chennai' },
      { '@type': 'AdministrativeArea', name: 'Tamil Nadu' },
    ],
    knowsAbout: FEATURED.map((c) => c.name),
    openingHoursSpecification: [
      { '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '09:30', closes: '19:30' },
      { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '10:00', closes: '13:00' },
    ],
    hasMap: `https://www.google.com/maps/search/?api=1&query=${SITE.geo.lat},${SITE.geo.lng}`,
  };
}

export function websiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE.url}/#website`,
    url: SITE.url + '/',
    name: SITE.name,
    inLanguage: 'en-IN',
    publisher: { '@id': `${SITE.url}/#legalservice` },
  };
}
