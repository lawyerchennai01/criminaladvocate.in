// Builds src/data/recreated.json (+ featured images) from the markdown articles in src/data/recreated/*.md.
// Each article is a page that used to be a WordPress tag URL with search traffic, recreated at that URL.
// Usage: node scripts/build-recreated.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIR = 'src/data/recreated';
const OUT_IMG = 'public/images/topics';
const TODAY = process.env.RECREATED_DATE || new Date().toISOString().slice(0, 10);
const content = JSON.parse(fs.readFileSync('src/data/content.json', 'utf8'));
const known = new Set(content.items.map((i) => i.path));
// articles may link to each other
for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.md'))) {
  const t = fs.readFileSync(path.join(DIR, f), 'utf8');
  const slug = (t.match(/^slug:\s*(.+)$/m) || [])[1]?.trim();
  const p = (t.match(/^path:\s*(.+)$/m) || [])[1]?.trim();
  if (slug) known.add(p || `/attorneys-chennai/${slug}/`);
}
const cats = new Set(JSON.parse(fs.readFileSync('src/data/categories.json', 'utf8')).map((c) => c.slug));
fs.mkdirSync(OUT_IMG, { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => `<a href="${u}"${/^https?:/.test(u) ? ' rel="noopener nofollow"' : ''}>${t}</a>`);
const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

function blocks(md) {
  const out = [];
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{2,4})\s+(.*)$/))) { out.push(`<h${m[1].length}>${inline(m[2].trim())}</h${m[1].length}>`); i++; continue; }
    if (/^\s*[-*]\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      out.push('<ul>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+\.\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      out.push('<ol>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>');
      continue;
    }
    if (/^>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote><p>${inline(q.join(' '))}</p></blockquote>`);
      continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,4}\s|\s*[-*]\s|\s*\d+\.\s|>)/.test(lines[i])) p.push(lines[i++]);
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out;
}

function wrap(text, max) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}
async function image(slug, title, label) {
  const size = title.length > 60 ? 46 : title.length > 40 ? 54 : 62;
  const lines = wrap(title, Math.round(1000 / (size * 0.62))).slice(0, 4);
  const y0 = 300 - ((lines.length - 1) * size * 1.2) / 2;
  const x = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0b1f3a"/><rect x="60" y="60" width="1080" height="510" fill="none" stroke="#d4af37" stroke-width="3"/><rect x="100" y="112" width="70" height="4" fill="#9b1b30"/><text x="100" y="160" font-family="Georgia, serif" font-size="28" letter-spacing="3" fill="#d4af37">${x(label.toUpperCase())}</text>${lines
    .map((t, k) => `<text x="100" y="${Math.round(y0 + k * size * 1.2)}" font-family="Georgia, serif" font-size="${size}" font-weight="bold" fill="#f7f3e9">${x(t)}</text>`)
    .join('')}<text x="100" y="525" font-family="Arial, sans-serif" font-size="28" fill="#f7f3e9">Rajendra Criminal Law Firm · Chennai</text><text x="1100" y="525" text-anchor="end" font-family="Arial, sans-serif" font-size="22" fill="#d4af37">criminaladvocate.in</text></svg>`;
  await sharp(Buffer.from(svg)).webp({ quality: 85 }).toFile(path.join(OUT_IMG, slug + '.webp'));
}

const results = [];
const problems = [];
for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.md')).sort()) {
  const raw = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) { problems.push(`${f}: no frontmatter`); continue; }
  const fm = Object.fromEntries(m[1].split('\n').filter((l) => l.includes(':')).map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
  const slug = fm.slug;
  const p = fm.path || `/attorneys-chennai/${slug}/`;
  const list = (k, sep) => (fm[k] ? fm[k].split(sep).map((s) => s.trim()).filter(Boolean) : []);
  const related = list('related', ',').filter((r) => { if (!known.has(r)) { problems.push(`${f}: related ${r} not found`); return false; } return true; });
  if (!cats.has(fm.category)) problems.push(`${f}: unknown category ${fm.category}`);

  // split the body into the article and its FAQ section
  const faqAt = m[2].search(/^##\s+Frequently asked questions\s*$/im);
  const main = faqAt < 0 ? m[2] : m[2].slice(0, faqAt);
  const faqMd = faqAt < 0 ? '' : m[2].slice(faqAt).replace(/^##\s+Frequently asked questions\s*\n/i, '');
  let html = blocks(main).join('\n');
  let faqCount = 0;
  if (faqMd.trim()) {
    const parts = faqMd.split(/^###\s+/m).slice(1);
    const items = parts.map((part) => {
      const nl = part.indexOf('\n');
      const q = part.slice(0, nl).trim();
      const a = blocks(part.slice(nl + 1)).join('');
      return `<details><summary>${inline(q)}</summary><div>${a}</div></details>`;
    });
    faqCount = items.length;
    html += `\n<h2>Frequently asked questions</h2>\n<div class="faq">${items.join('')}</div>`;
  }
  const words = plain(html).split(' ').filter(Boolean).length;
  const title = fm.title;
  let description = fm.description || '';
  if (description.length > 160) problems.push(`${f}: description ${description.length} chars`);
  if (!fm.seo_title && title.length > 60) problems.push(`${f}: title ${title.length} chars, add seo_title`);
  if (faqCount < 4) problems.push(`${f}: only ${faqCount} FAQs`);
  if (words < 450) problems.push(`${f}: only ${words} words`);
  await image(slug, fm.image_title || title, fm.label || 'Criminal law guide');
  results.push({
    type: 'post', path: p, title, date: TODAY, modified: TODAY, seoTitle: fm.seo_title || '', description,
    cats: [fm.category], primary: fm.category, words, html, related,
    image: { src: `/images/topics/${slug}.webp`, w: 1200, h: 630, alt: `${title} — Rajendra Criminal Law Firm, Chennai` },
    tags: list('tags', '|'), aliases: list('aliases', ','), recreated: true,
  });
}
fs.writeFileSync('src/data/recreated.json', JSON.stringify(results));
console.log('articles:', results.length, '| total words:', results.reduce((a, r) => a + r.words, 0), '| aliases:', results.reduce((a, r) => a + r.aliases.length, 0));
if (problems.length) { console.log('PROBLEMS:'); problems.forEach((x) => console.log('  ' + x)); }
