import data from './content.json';
import recreated from './recreated.json';
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
  tags?: string[];
  related?: string[];
  recreated?: boolean;
};

// Hand-built pages (home, contact) are not generated from the export.
export const HANDMADE = new Set(['/', '/contact/', '/contact-us/']);
// Articles recreated at the old tag URLs that earned search traffic (src/data/recreated/*.md -> recreated.json).
export const RECREATED = recreated as unknown as Item[];
export const ITEMS = [...(data.items as Item[]), ...RECREATED]
  .filter((i) => !HANDMADE.has(i.path))
  .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
export const POSTS = ITEMS.filter((i) => i.type === 'post');
export const NEWS = ITEMS.filter((i) => i.type === 'news');
// Internal-linking aids. Hub pages get a topic grid plus guides; category pages get pinned key guides.
export const HUB_PATHS = new Set(['/legal-services/', '/about/', '/faq/', '/legal-consultants-chennai/']);
export const START_GUIDES = [
  '/the-ultimate-guide-to-bail-in-chennai-2024-2025/',
  '/your-rights-after-an-arrest-in-india-a-step-by-step-legal-guide/',
  '/custodial-interrogation-in-criminal-cases-when-police-can-demand-arrest-and-how-to-avoid-it/',
];
export const CATEGORY_PINS: Record<string, string[]> = {
  bail: ['/the-ultimate-guide-to-bail-in-chennai-2024-2025/', '/default-bail-bnss-section-187-60-90-day-rule/'],
  'anticipatory-bail': ['/the-ultimate-guide-to-bail-in-chennai-2024-2025/'],
  'arrest-and-custody': START_GUIDES.slice(1),
  'criminal-defense': START_GUIDES,
};
export const slugOf = (p: string) => p.replace(/^\/|\/$/g, '');

const slugify = (t: string) =>
  t.toLowerCase().replace(/&[a-z#0-9]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

/** Adds ids to h2/h3 that lack one and returns a table of contents built from the h2s. */
export function enrich(source: string) {
  const { html, pairs } = buildFaq(source);
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
  return { html: out, toc, faq: pairs };
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

export type Faq = { q: string; a: string };
const txt = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BLOCK_RE = /<(h[2-6]|p|ul|ol|table|blockquote|details|figure)\b[^>]*>[\s\S]*?<\/\1>/g;

/**
 * Finds the "FAQ" / "Frequently asked questions" section of an article, turns its question and
 * answer pairs into accessible <details> accordions, and returns the pairs for FAQPage JSON-LD.
 * Existing <details> accordions are kept as they are. Nothing is invented: if the section cannot be
 * parsed without dropping text, the HTML is returned unchanged.
 */
export function buildFaq(html: string): { html: string; pairs: Faq[] } {
  const hm = /<(h[2-6])\b[^>]*>(?:(?!<\/\1>)[\s\S])*?(?:faq|frequently asked|common questions)(?:(?!<\/\1>)[\s\S])*?<\/\1>/i.exec(html);
  if (!hm) return { html, pairs: [] };
  const hLvl = Number(hm[1][1]);
  const start = hm.index + hm[0].length;
  const rest = html.slice(start);
  const end = rest.search(new RegExp(`<h[2-${hLvl}]\\b`, 'i'));
  const body = end < 0 ? rest : rest.slice(0, end);
  const tail = end < 0 ? '' : rest.slice(end);

  if (/<details\b/.test(body)) {
    const pairs = [...html.matchAll(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
      .map((m) => ({ q: txt(m[1]), a: txt(m[2]) }))
      .filter((p) => p.q && p.a);
    return { html, pairs };
  }

  const clean = body.replace(/<hr\s*\/?>/g, '');
  type Blk = { tag: string; html: string };
  // Block elements plus any loose text/inline fragments between them (kept as 'raw' blocks so no text is lost).
  const blocks: Blk[] = [];
  let last = 0;
  for (const m of clean.matchAll(BLOCK_RE)) {
    const gap = clean.slice(last, m.index).trim();
    if (gap) blocks.push({ tag: 'raw', html: gap });
    blocks.push({ tag: m[1], html: m[0] });
    last = (m.index ?? 0) + m[0].length;
  }
  const tailGap = clean.slice(last).trim();
  if (tailGap) blocks.push({ tag: 'raw', html: tailGap });
  const asHtml = (b: Blk) => (b.tag === 'raw' ? `<p>${b.html}</p>` : b.html);
  const rawQ = /^(?:Q\s*\d+\s*[:.)-]\s*)?[^<]*\?$/;
  const num = (q: string) => q.replace(/^\s*(?:Q\s*)?\d+\s*[.):-]\s*/i, '').replace(/^\s*Q\s*[.:)-]\s*/i, '').trim();
  const lead = (a: string) => a.replace(/^\s*(?:A\s*\d*\s*[.:)-]\s*)/i, '').trim();
  // 1) one paragraph per pair: "<strong>Q?</strong><br>answer" or "Q1. question?<br>A1. answer"
  const brRe = /^<p>\s*(?:<strong>)?\s*([^<]*?\?)\s*(?:<\/strong>)?\s*<br\s*\/?>([\s\S]*)<\/p>$/;
  const brCount = blocks.filter((b) => b.tag === 'p' && brRe.test(b.html)).length;
  const firstSub = blocks.find((b) => /^h[2-6]$/.test(b.tag) && Number(b.tag[1]) > hLvl);
  let isQ: (b: Blk) => boolean;
  let qText: (b: Blk) => { q: string; extra: string };
  let single = false;
  const yoast = /^<p id="faq-question[^>]*>/;
  if (blocks.filter((b) => b.tag === 'p' && yoast.test(b.html)).length >= 2) {
    // 0) Yoast FAQ block: <p id="faq-question-…"><strong>Q</strong></p><p>answer</p>
    single = true;
    isQ = (b) => b.tag === 'p' && yoast.test(b.html);
    qText = (b) => ({ q: num(txt(b.html)), extra: '' });
  } else if (brCount >= 2) {
    isQ = (b) => b.tag === 'p' && brRe.test(b.html);
    qText = (b) => {
      const m = brRe.exec(b.html)!;
      const a = lead(m[2]);
      return { q: num(txt(m[1])), extra: a ? `<p>${a}</p>` : '' };
    };
  } else if (blocks.filter((b) => b.tag === 'raw' && rawQ.test(b.html)).length >= 2) {
    // 4) bare question lines ("Q1: …?") followed by answer paragraphs
    isQ = (b) => b.tag === 'raw' && rawQ.test(b.html);
    qText = (b) => ({ q: num(txt(b.html)), extra: '' });
  } else if (firstSub) {
    // 2) question headings (h3/h4…) followed by answer paragraphs
    const lvl = firstSub.tag;
    isQ = (b) => b.tag === lvl;
    qText = (b) => ({ q: num(txt(b.html)), extra: '' });
  } else {
    // 3) bold question paragraph, answer in the following blocks (or the rest of the same paragraph)
    const re = /^<p>\s*<strong>([\s\S]*?\?)\s*<\/strong>([\s\S]*)<\/p>$/;
    isQ = (b) => b.tag === 'p' && re.test(b.html);
    qText = (b) => {
      const m = re.exec(b.html)!;
      return { q: num(txt(m[1])), extra: txt(m[2]) ? `<p>${m[2].trim()}</p>` : '' };
    };
  }

  let intro = '';
  let outro = '';
  const groups: { q: string; ans: string; n: number }[] = [];
  let ended = false;
  for (const b of blocks) {
    if (!ended && isQ(b)) {
      const { q, extra } = qText(b);
      groups.push({ q, ans: extra, n: extra ? 1 : 0 });
    } else if (!groups.length) intro += asHtml(b);
    else if (ended) outro += asHtml(b);
    else if (/^h[2-6]$/.test(b.tag) || (single && groups[groups.length - 1].n >= 1)) {
      ended = true; // a different heading (or, for one-paragraph answers, any further block) closes the FAQ list
      outro += asHtml(b);
    } else {
      groups[groups.length - 1].ans += asHtml(b);
      groups[groups.length - 1].n++;
    }
  }
  const pairs = groups.filter((g) => g.q && txt(g.ans)).map((g) => ({ q: g.q, a: txt(g.ans) }));
  if (pairs.length < 2 || pairs.length !== groups.length) return { html, pairs: [] };

  const rendered =
    intro +
    '<div class="faq">' +
    groups.map((g) => `<details><summary>${esc(g.q)}</summary><div>${g.ans}</div></details>`).join('') +
    '</div>' +
    outro;
  return { html: html.slice(0, start) + rendered + tail, pairs };
}
export { catUrl };
