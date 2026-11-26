import data from './content.json';
import { catBySlug, catUrl, type Category } from './site';

export type Item = {
  type: 'post' | 'page' | 'news';
  path: string;
  title: string;
  date: string;
  modified: string;
  seoTitle: string;
  description: string;
  cats: string[];
  primary: string | null;
  words: number;
  html: string;
  image: { src: string; w?: number; h?: number; alt: string } | null;
};

// Hand-built pages (home, contact) are not generated from the export.
export const HANDMADE = new Set(['/', '/contact/', '/contact-us/']);
export const ITEMS = (data.items as Item[]).filter((i) => !HANDMADE.has(i.path));
export const POSTS = ITEMS.filter((i) => i.type === 'post');
export const NEWS = ITEMS.filter((i) => i.type === 'news');
export const slugOf = (p: string) => p.replace(/^\/|\/$/g, '');

const slugify = (t: string) =>
  t.toLowerCase().replace(/&[a-z#0-9]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Adds ids to h2/h3 that lack one and returns a table of contents built from the h2s. */
export function enrich(html: string) {
  const used = new Set<string>();
  const toc: { id: string; text: string }[] = [];
  const out = html.replace(/<(h2|h3)((?:\s[^>]*)?)>([\s\S]*?)<\/\1>/g, (_m, tag: string, attrs: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    let id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
    if (!id) {
      const base = slugify(text) || 'section';
      id = base;
      let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      attrs = `${attrs} id="${id}"`;
    }
    used.add(id);
    if (tag === 'h2' && text) toc.push({ id, text });
    return `<${tag}${attrs}>${inner}</${tag}>`;
  });
  return { html: out, toc };
}

export function categoryChain(c: Category | undefined): Category[] {
  const chain: Category[] = [];
  while (c) {
    chain.unshift(c);
    c = c.parent ? catBySlug(c.parent) : undefined;
  }
  return chain;
}
export const itemCats = (i: Item) => i.cats.map((s) => catBySlug(s)).filter(Boolean) as Category[];
export const fmtDate = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Question/answer pairs from the FAQ page (Elementor accordion flattened to h6 + p). */
export function faqPairs(html: string) {
  const pairs: { q: string; a: string }[] = [];
  const re = /<h6[^>]*>([\s\S]*?)<\/h6>\s*((?:<p>[\s\S]*?<\/p>\s*)+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const q = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const a = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (q && a) pairs.push({ q, a });
  }
  return pairs;
}
export { catUrl };
