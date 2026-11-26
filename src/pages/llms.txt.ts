import type { APIRoute } from 'astro';
import { SITE, FEATURED, catUrl } from '../data/site';
import { POSTS } from '../data/content';

// Plain-text site summary for answer engines / LLM crawlers (llms.txt convention).
export const GET: APIRoute = () => {
  const lines = [
    `# ${SITE.name}`,
    '',
    `> ${SITE.description}`,
    '',
    '## About',
    `- Practice: criminal defence and related litigation in Chennai, Tamil Nadu, India; appears before the Madras High Court.`,
    `- Address: ${SITE.address.street}, ${SITE.address.locality} ${SITE.address.postalCode}, ${SITE.address.region}`,
    `- Madras High Court office: ${SITE.highCourtOffice}`,
    `- Phone: ${SITE.phoneDisplay} · Email: ${SITE.email}`,
    `- Hours: ${SITE.hours.join('; ')}`,
    '- Content on this site is general legal information under Bar Council of India rules. It is not advertising, solicitation or legal advice.',
    '',
    '## Key pages',
    `- [Legal services](${SITE.url}/legal-services/)`,
    `- [Criminal advocates in Chennai](${SITE.url}/best-criminal-advocates-chennai/)`,
    `- [Guide to bail in Chennai](${SITE.url}/the-ultimate-guide-to-bail-in-chennai-2024-2025/)`,
    `- [FAQ](${SITE.url}/faq/)`,
    `- [Contact](${SITE.url}/contact/)`,
    '',
    '## Topics',
    ...FEATURED.map((c) => `- [${c.name}](${SITE.url}${catUrl(c)})`),
    '',
    '## Recent articles',
    ...POSTS.slice(0, 25).map((p) => `- [${p.title}](${SITE.url}${p.path}): ${p.description}`),
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
