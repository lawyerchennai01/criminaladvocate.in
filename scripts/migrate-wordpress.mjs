// One-off migration: WordPress WXR export + uploads zips -> src/data/content.json + public/images/uploads/*.webp
// Usage: node scripts/migrate-wordpress.mjs <export.xml> <zip-dir> <scratch-dir>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sanitizeHtml from 'sanitize-html';
import sharp from 'sharp';

const [, , XML, ZIPDIR, SCRATCH] = process.argv;
if (!XML || !ZIPDIR || !SCRATCH) throw new Error('usage: migrate-wordpress.mjs <xml> <zipdir> <scratch>');
const SITE = 'https://criminaladvocate.in';
const OUT_IMG = 'public/images/uploads';
const OUT_FILES = 'public/files';
const EXTRA_RELS = ['2025/11/Rajendra-Criminal-Law-Firm-Logo.png']; // site logo

const x = fs.readFileSync(XML, 'utf8');
const G = (s, t) => {
  const m = s.match(new RegExp('<' + t + String.raw`>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</` + t + '>'));
  return m ? m[1] : '';
};
const META = (s, key) => {
  const m = s.match(new RegExp(String.raw`<wp:meta_key><!\[CDATA\[` + key.replace(/[-]/g, '\\-') + String.raw`\]\]></wp:meta_key>\s*<wp:meta_value><!\[CDATA\[([\s\S]*?)\]\]></wp:meta_value>`));
  return m ? m[1] : '';
};
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[​ ]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- parse export ----------
const items = x.split('<item>').slice(1).map((s) => s.split('</item>')[0]);
const attachments = new Map(); // id -> {url, alt}
for (const it of items) {
  if (G(it, 'wp:post_type') !== 'attachment') continue;
  attachments.set(G(it, 'wp:post_id'), { url: G(it, 'wp:attachment_url'), alt: decode(META(it, '_wp_attachment_image_alt')) });
}
const cats = [];
for (const m of x.matchAll(/<wp:category>([\s\S]*?)<\/wp:category>/g)) {
  cats.push({ id: G(m[1], 'wp:term_id'), slug: G(m[1], 'wp:category_nicename'), parent: G(m[1], 'wp:category_parent'), name: decode(G(m[1], 'wp:cat_name')) });
}
const catBySlug = new Map(cats.map((c) => [c.slug, c]));
const catPath = (c) => (c.parent ? catPath(catBySlug.get(c.parent)) + '/' : '') + c.slug;

const KINDS = new Set(['post', 'page', 'news']);
const raw = [];
for (const it of items) {
  const type = G(it, 'wp:post_type');
  if (!KINDS.has(type) || G(it, 'wp:status') !== 'publish') continue;
  const link = G(it, 'link');
  if (link.includes('?')) continue;
  const p = new URL(link).pathname;
  const slug = p.replace(/^\/|\/$/g, '');
  const catSlugs = [...it.matchAll(/<category domain="category" nicename="([^"]*)"/g)].map((m) => m[1]);
  const primaryId = META(it, '_yoast_wpseo_primary_category');
  const primary = cats.find((c) => c.id === primaryId)?.slug || catSlugs[0] || null;
  raw.push({
    type, slug, path: p || '/', content: G(it, 'content:encoded'), title: decode(G(it, 'title')),
    date: G(it, 'wp:post_date_gmt').slice(0, 10) || G(it, 'wp:post_date').slice(0, 10),
    modified: G(it, 'wp:post_modified_gmt').slice(0, 10) || G(it, 'wp:post_modified').slice(0, 10),
    excerpt: decode(G(it, 'excerpt:encoded').replace(/<[^>]+>/g, ' ')),
    seoTitle: decode(META(it, '_yoast_wpseo_title')), seoDesc: decode(META(it, '_yoast_wpseo_metadesc')),
    thumb: META(it, '_thumbnail_id'), cats: catSlugs, primary,
    tagsRaw: [...it.matchAll(/<category domain="post_tag"[^>]*><!\[CDATA\[([^\]]*)/g)].map((m) => decode(m[1])),
    focus: decode(META(it, '_yoast_wpseo_focuskw')),
  });
}
console.log('items', raw.length);

// ---------- uploads index ----------
const UP_RE = /https?:\/\/(?:www\.)?criminaladvocate\.in\/wp-content\/uploads\/([^\s"'<>)\\]+?\.(?:jpe?g|png|webp|gif|pdf|svg))/gi;
const baseOf = (rel) => rel.replace(/-\d+x\d+(?=\.\w+$)/, '').replace(/-scaled(?=\.\w+$)/, '');
const needed = new Set(EXTRA_RELS.map(baseOf));
for (const r of raw) {
  for (const m of r.content.matchAll(UP_RE)) needed.add(baseOf(decodeURIComponent(m[1])));
  const a = attachments.get(r.thumb);
  if (a) { const m = a.url.match(/uploads\/(.+)$/); if (m) needed.add(baseOf(m[1])); }
}
console.log('distinct media referenced', needed.size);

const zips = fs.readdirSync(ZIPDIR).filter((f) => /uploads-part\d+-of\d+\.zip$/.test(f)).map((f) => path.join(ZIPDIR, f));
const index = new Map(); // baseRel -> {entry, zip, rank}
for (const z of zips) {
  const list = execFileSync('unzip', ['-Z1', z], { maxBuffer: 1 << 28 }).toString().split('\n');
  for (const e of list) {
    if (!e.startsWith('uploads/') || e.endsWith('/')) continue;
    const rel = e.slice('uploads/'.length);
    const sized = rel.match(/-(\d+)x(\d+)(?=\.\w+$)/);
    const rank = /-scaled(?=\.\w+$)/.test(rel) ? 2 : sized ? 1 + (+sized[1] * +sized[2]) / 1e9 : 3;
    const key = baseOf(rel);
    if (!needed.has(key)) continue;
    const cur = index.get(key);
    if (!cur || rank > cur.rank) index.set(key, { entry: e, zip: z, rank });
  }
}
const missing = [...needed].filter((k) => !index.has(k));
console.log('found in zips', index.size, 'missing', missing.length);

// ---------- extract + convert ----------
fs.mkdirSync(SCRATCH, { recursive: true });
fs.mkdirSync(OUT_IMG, { recursive: true });
fs.mkdirSync(OUT_FILES, { recursive: true });
const byZip = new Map();
for (const v of index.values()) { if (!byZip.has(v.zip)) byZip.set(v.zip, []); byZip.get(v.zip).push(v.entry); }
for (const [z, entries] of byZip) {
  for (let i = 0; i < entries.length; i += 60) {
    const chunk = entries.slice(i, i + 60).map((e) => e.replace(/([\[\]*?\\])/g, '\\$1'));
    try { execFileSync('unzip', ['-q', '-o', z, ...chunk, '-d', SCRATCH], { stdio: 'pipe' }); } catch (e) { console.log('unzip warn', z, String(e.stderr || e.message).slice(0, 200)); }
  }
}
const mediaMap = new Map(); // baseRel -> {src,w,h}
const outNames = new Map();
for (const [key, v] of index) {
  const input = path.join(SCRATCH, v.entry);
  if (!fs.existsSync(input)) continue;
  const ext = path.extname(key).toLowerCase();
  const stem = key.slice(0, -ext.length);
  if (ext === '.pdf' || ext === '.svg') {
    const dest = path.join(ext === '.pdf' ? OUT_FILES : OUT_IMG, key.replace(/\//g, '-'));
    fs.copyFileSync(input, dest);
    mediaMap.set(key, { src: (ext === '.pdf' ? '/files/' : '/images/uploads/') + key.replace(/\//g, '-') });
    continue;
  }
  let outRel = stem + '.webp';
  if (outNames.has(outRel) && outNames.get(outRel) !== key) outRel = stem + '-' + ext.slice(1) + '.webp';
  outNames.set(outRel, key);
  const dest = path.join(OUT_IMG, outRel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  try {
    const info = await sharp(input).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest);
    mediaMap.set(key, { src: '/images/uploads/' + outRel, w: info.width, h: info.height });
  } catch (e) { console.log('convert fail', key, e.message.slice(0, 80)); }
}
console.log('converted', mediaMap.size);
const logo = mediaMap.get(baseOf(EXTRA_RELS[0]));
if (logo) {
  fs.copyFileSync(path.join(OUT_IMG, logo.src.replace('/images/uploads/', '')), 'public/logo.webp');
  await sharp('public/logo.webp').resize(64, 64, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 85 }).toFile('public/favicon.webp');
}

// ---------- clean content ----------
const lookup = (url) => {
  const m = url.match(/\/wp-content\/uploads\/([^?#]+)/);
  if (!m) return null;
  return mediaMap.get(baseOf(decodeURIComponent(m[1]))) || null;
};
const SHORTCODE = /\[\/?(?:ez-toc|gallery|caption|contact-form-7|wpforms|elementor-template|joinchat|embed|video|audio|playlist|wp_[a-z_]+|[a-z][a-z0-9_-]*\s+(?:id|class|style|name|title)=[^\]]*)[^\]]*\]/gi;
const BLOCK = ['span', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'blockquote', 'cite', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'figure', 'figcaption', 'sup', 'sub', 'details', 'summary'];
const stats = { imgDropped: 0, imgKept: 0, scrubbed: 0 };
function clean(html, titleAlt) {
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(SHORTCODE, '').replace(/<\/(div|section)>/gi, '</$1>\n');
  html = html.replace(/<(div|section|article)\b/gi, '<p data-wrap').replace(/<\/(div|section|article)>/gi, '</p>');
  let out = sanitizeHtml(html, {
    allowedTags: BLOCK,
    allowedAttributes: { a: ['href', 'rel', 'title'], img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'], '*': ['id'] },
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe', 'form', 'button', 'select', 'svg'],
    transformTags: {
      h1: 'h2',
      a: (tag, a) => {
        let href = (a.href || '').trim();
        if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return { tagName: 'span', attribs: {} };
        const media = lookup(href);
        if (media) href = media.src;
        else href = href.replace(/^https?:\/\/(?:www\.)?criminaladvocate\.in(?=\/|$)/i, '') || '/';
        const external = /^https?:\/\//i.test(href);
        const attribs = { href };
        if (external) attribs.rel = 'noopener nofollow';
        if (a.title) attribs.title = a.title;
        return { tagName: 'a', attribs };
      },
      img: (tag, a) => {
        const media = lookup(a.src || a['data-src'] || '');
        if (!media) { stats.imgDropped++; return { tagName: 'img', attribs: {} }; }
        stats.imgKept++;
        const attribs = { src: media.src, alt: (a.alt || '').trim() || titleAlt, loading: 'lazy', decoding: 'async' };
        if (media.w) { attribs.width = String(media.w); attribs.height = String(media.h); }
        return { tagName: 'img', attribs };
      },
    },
    exclusiveFilter: (f) => (f.tag === 'img' && !f.attribs.src) || (['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'th'].includes(f.tag) && !f.text.replace(/[\s ​]/g, '') && !f.mediaChildren.length),
  });
  out = out.replace(/<\/?span>/g, '').replace(/[ \t]{2,}/g, ' ').replace(/<p data-wrap="">/g, '<p>').replace(/<p>\s*(<p>)/g, '$1').replace(/(<\/p>)\s*<\/p>/g, '$1');
  // Bar Council of India compliance scrub: drop whole paragraphs with promotional or outcome-promise claims
  out = out.replace(/<p>(?:(?!<\/p>)[\s\S])*?(?:No\.?\s?1 FEMA|will win the case)(?:(?!<\/p>)[\s\S])*?<\/p>/gi, () => { stats.scrubbed++; return ''; });
  return out.replace(/\n{2,}/g, '\n').trim();
}

// ---------- tags ----------
// WordPress had up to 200 stuffed tags per post (9,296 distinct). Keep at most 6 clean, on-topic ones:
// drop superlatives / "near me" / template phrases, require a keyword shared with the title or focus keyword,
// de-duplicate near-identical phrases. Posts left with none fall back to their focus keyword and category.
const STOP = new Set('the and for with from that this are was how what when why can you your under into over about case cases law laws act india chennai lawyer lawyers advocate advocates attorney attorneys legal court'.split(' '));
const sig = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const BAD = /\b(best|top|no\.?\s?1|number one|near me|nearby|near by|good|leading|cheap|affordable|rated|famous|experienced|expert|vakils?|fees?|free)\b/i;
const key = (s) => [...sig(s)].map((w) => w.replace(/s$/, '')).sort().join(' ');
function curateTags(r) {
  const title = sig(r.title + ' ' + r.focus);
  const seen = new Set();
  const out = [];
  const scored = r.tagsRaw
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length >= 4 && t.length <= 48 && !BAD.test(t))
    .map((t) => ({ t, shared: [...sig(t)].filter((w) => title.has(w)).length, words: t.split(' ').length }))
    .filter((x) => x.shared > 0)
    .sort((a, b) => b.shared - a.shared || Math.abs(a.words - 3) - Math.abs(b.words - 3));
  const add = (t) => { const k = key(t) || t.toLowerCase(); if (!seen.has(k) && out.length < 6) { seen.add(k); out.push(t); } };
  for (const x of scored) add(x.t);
  if (out.length < 2) {
    if (r.focus && !BAD.test(r.focus)) add(r.focus.replace(/\b\w/g, (c) => c.toUpperCase()));
    const c = r.primary && catBySlug.get(r.primary);
    // only when the category name actually relates to the article (WordPress primary categories are sometimes off-topic)
    if (c && [...sig(c.name)].some((w) => title.has(w))) add(c.name);
  }
  return out;
}

const plain = (h) => decode(h.replace(/<[^>]+>/g, ' '));
const result = [];
for (const r of raw) {
  const html = clean(r.content, r.title);
  const text = plain(html);
  let description = r.seoDesc && !r.seoDesc.includes('%%') ? r.seoDesc : r.excerpt || text.slice(0, 200).replace(/\s+\S*$/, '');
  if (description.length > 160) description = description.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  const th = attachments.get(r.thumb);
  const tm = th && th.url.match(/uploads\/(.+)$/);
  const tmedia = tm ? mediaMap.get(baseOf(decodeURIComponent(tm[1]))) : null;
  result.push({
    type: r.type, path: r.path, title: r.title, date: r.date, modified: r.modified,
    seoTitle: r.seoTitle && !r.seoTitle.includes('%%') ? r.seoTitle : '', description,
    cats: r.cats, primary: r.primary, words: text.split(' ').filter(Boolean).length, html,
    tags: curateTags(r),
    image: tmedia ? { src: tmedia.src, w: tmedia.w, h: tmedia.h, alt: th.alt || r.title } : null,
  });
}
result.sort((a, b) => (a.date < b.date ? 1 : -1));
const categories = cats.map((c) => ({ slug: c.slug, name: c.name, path: catPath(c), parent: c.parent ? catBySlug.get(c.parent).slug : null }));
// Unwrap internal links that point nowhere in the migrated site (broken in WordPress too), keeping the link text.
const valid = new Set(['/', '/contact/', '/contact-us/', '/news/']);
result.forEach((r) => valid.add(r.path));
categories.forEach((c) => valid.add(`/attorneys-lawyers-chennai/${c.path}/`));
let unwrapped = 0;
for (const r of result) {
  r.html = r.html.replace(/<a href="(\/[^"#?]*)([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (m, p, rest, inner) => {
    if (valid.has(p) || /^\/(images|files|attorneys-chennai|author)\//.test(p)) return m;
    unwrapped++;
    return inner;
  });
}
console.log('broken internal links unwrapped', unwrapped);
// One firm number everywhere (matches SITE.phoneTel in src/data/site.ts). Old number appears as text, tel: and wa.me links.
let phones = 0;
const fixPhone = (s) =>
  s.replace(/(\+?)(91[ -]?)?98410[ -]?34689/g, (m, plus, cc) => {
    phones++;
    return /[ -]/.test(m) ? '+91 99942 87060' : `${plus}919994287060`;
  });
for (const r of result) { r.html = fixPhone(r.html); r.description = fixPhone(r.description); }
console.log('old phone number replaced', phones);
fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/content.json', JSON.stringify({ items: result, categories }));
console.log('promotional paragraphs removed', stats.scrubbed);
console.log('images kept', stats.imgKept, 'dropped', stats.imgDropped);
console.log('written', result.length, 'items,', categories.length, 'categories');
