import type { APIRoute } from 'astro';
import { SITE, CATEGORIES, catUrl } from '../data/site';
import { ITEMS } from '../data/content';

export const GET: APIRoute = () => {
  const urls: { loc: string; lastmod?: string; priority: string }[] = [
    { loc: '/', priority: '1.0' },
    { loc: '/contact/', priority: '0.6' },
    { loc: '/news/', priority: '0.6' },
    ...CATEGORIES.filter((c) => c.count > 0).map((c) => ({ loc: catUrl(c), priority: '0.7' })),
    ...ITEMS.map((i) => ({ loc: i.path, lastmod: i.modified || i.date, priority: i.type === 'page' ? '0.8' : '0.6' })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map((u) => `  <url><loc>${SITE.url}${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`)
      .join('\n') +
    `\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
