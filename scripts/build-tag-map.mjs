// Builds src/data/tags.json (tag topic pages) and the generated tag redirects in public/_redirects.
// Usage: node scripts/build-tag-map.mjs <wordpress-export.xml> <gsc-tag-pages.csv>
//   gsc-tag-pages.csv = Search Console "Pages.csv" filtered to URLs containing /attorneys-chennai/
import fs from 'node:fs';

const [, , XML, GSC] = process.argv;
if (!XML || !GSC) throw new Error('usage: build-tag-map.mjs <export.xml> <gsc-pages.csv>');
const PREFIX = '/attorneys-chennai/';
const G = (s, t) => {
  const m = s.match(new RegExp('<' + t + String.raw`>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</` + t + '>'));
  return m ? m[1] : '';
};
const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// ---- published posts and their tags (nicename -> name, posts) ----
const content = JSON.parse(fs.readFileSync('src/data/content.json', 'utf8'));
const postByPath = new Map(content.items.filter((i) => i.type === 'post').map((i) => [i.path, i]));
const tags = new Map(); // nicename -> {slug,name,posts:Set}
for (const it of fs.readFileSync(XML, 'utf8').split('<item>').slice(1).map((s) => s.split('</item>')[0])) {
  if (G(it, 'wp:post_type') !== 'post' || G(it, 'wp:status') !== 'publish') continue;
  const link = G(it, 'link');
  if (link.includes('?')) continue;
  const p = new URL(link).pathname;
  if (!postByPath.has(p)) continue;
  for (const m of it.matchAll(/<category domain="post_tag" nicename="([^"]*)"><!\[CDATA\[([^\]]*)/g)) {
    const slug = decodeURIComponent(m[1]);
    if (!tags.has(slug)) tags.set(slug, { slug, name: decode(m[2]), posts: new Set() });
    tags.get(slug).posts.add(p);
  }
}
console.log('tags with at least one published post:', tags.size);

// ---- Search Console rows ----
const gsc = fs.readFileSync(GSC, 'utf8').trim().split('\n').slice(1).map((l) => {
  const m = l.match(/^(.*?),(\d+),(\d+),([\d.]+)%,([\d.]+)$/);
  if (!m) return null;
  const u = new URL(m[1]);
  if (!u.pathname.startsWith(PREFIX)) return null;
  return { slug: decodeURIComponent(u.pathname.slice(PREFIX.length).replace(/\/$/, '')), clicks: +m[2], imp: +m[3] };
}).filter(Boolean);
const traffic = new Map(gsc.map((r) => [r.slug, r]));
console.log('Search Console tag URLs:', gsc.length);

// ---- helpers ----
const BAD = /\b(best|top|leading|reliable|trusted|reputed|experienced|expert|professional|senior|highly|no\.?\s?1|number one|near me|nearby|near by|rated|cheap|affordable|famous|vakils?|fees?|free|good)\b/i;
const STOP = new Set('the and for with from that this are was how what when why can you your about into law laws act india chennai lawyer lawyers advocate advocates attorney attorneys legal court case cases tamil nadu'.split(' '));
const sig = (s) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const overlap = (a, b) => [...a].filter((w) => b.has(w)).length;
const bestPost = (slug, pool) => {
  const words = sig(slug.replace(/-/g, ' '));
  let best = null;
  for (const p of pool) {
    const sc = overlap(words, sig(p.title + ' ' + p.path.replace(/-/g, ' ')));
    if (sc > 0 && (!best || sc > best.sc || (sc === best.sc && p.date > best.p.date))) best = { p, sc };
  }
  return best?.p ?? null;
};
const allPosts = [...postByPath.values()];
const FALLBACK = '/attorneys-lawyers-chennai/criminal-defense/';

// ---- decide hub vs redirect ----
const hubs = [];
const redirects = [];
const stats = { hub: 0, toPost: 0, toBest: 0, toCategory: 0 };
// A tag page is kept only if it earns search clicks and lists at least two posts; promotional names are never kept.
const isHub = (t, clicks) => !BAD.test(t.name) && t.posts.size >= 2 && clicks >= 1;
// every tag that is a hub gets a page, whether or not Search Console listed it
for (const t of tags.values()) {
  const clicks = traffic.get(t.slug)?.clicks ?? 0;
  if (!isHub(t, clicks)) continue;
  const posts = [...t.posts].map((p) => postByPath.get(p)).sort((a, b) => (a.date < b.date ? 1 : -1));
  hubs.push({ slug: t.slug, name: t.name, posts: posts.map((p) => p.path), clicks, imp: traffic.get(t.slug)?.imp ?? 0 });
  stats.hub++;
}
const hubSlugs = new Set(hubs.map((h) => h.slug));
// Articles recreated at old tag URLs (scripts/build-recreated.mjs) are real pages now: no redirect for them,
// and the extra tag URLs folded into an article (aliases) redirect to it.
const recreated = fs.existsSync('src/data/recreated.json') ? JSON.parse(fs.readFileSync('src/data/recreated.json', 'utf8')) : [];
const recSlugs = new Set(recreated.filter((r) => r.path.startsWith(PREFIX)).map((r) => r.path.slice(PREFIX.length).replace(/\/$/, '')));
const aliasTarget = new Map();
for (const r of recreated) for (const a of r.aliases ?? []) aliasTarget.set(a, r.path);
for (const r of gsc) {
  if (hubSlugs.has(r.slug) || recSlugs.has(r.slug)) continue;
  if (aliasTarget.has(r.slug)) { redirects.push([`${PREFIX}${r.slug}/`, aliasTarget.get(r.slug), r.clicks]); continue; }
  const t = tags.get(r.slug);
  let target = null;
  if (t && t.posts.size >= 1) {
    const pool = [...t.posts].map((p) => postByPath.get(p));
    target = pool.length === 1 ? pool[0].path : (bestPost(r.slug, pool) ?? pool[0]).path;
    stats.toPost++;
  } else {
    const p = bestPost(r.slug, allPosts);
    if (p) { target = p.path; stats.toBest++; } else { target = FALLBACK; stats.toCategory++; }
  }
  redirects.push([`${PREFIX}${r.slug}/`, target, r.clicks]);
}
// tag URLs linked from migrated content also get a redirect (keeps those internal links and any link value working)
const have = new Set(redirects.map((r) => r[0]));
const linked = new Set();
for (const i of content.items) for (const m of i.html.matchAll(/href="\/attorneys-chennai\/([^"\/#?]+)\/?"/g)) linked.add(decodeURIComponent(m[1]));
for (const slug of linked) {
  if (hubSlugs.has(slug) || recSlugs.has(slug) || have.has(`${PREFIX}${slug}/`)) continue;
  const t = tags.get(slug);
  const pool = t && t.posts.size ? [...t.posts].map((p) => postByPath.get(p)) : allPosts;
  const p = pool.length === 1 ? pool[0] : bestPost(slug, pool);
  redirects.push([`${PREFIX}${slug}/`, p ? p.path : FALLBACK, 0]);
}
console.log('tag URLs linked from content that also got a redirect:', redirects.length - have.size);
redirects.sort((a, b) => b[2] - a[2]);
console.log('topic hubs:', hubs.length, '| specific redirects:', redirects.length, stats);

// ---- tag name -> hub slug lookup for the "Topics" chips ----
const byName = {};
for (const h of hubs) byName[h.name.toLowerCase()] = h.slug;
fs.writeFileSync('src/data/tags.json', JSON.stringify({ hubs, byName }));

// ---- write generated redirects just before the catch-all tag rule ----
const file = 'public/_redirects';
let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
text = text.replace(/# BEGIN generated tag redirects[\s\S]*?# END generated tag redirects\n/, '');
const block =
  '# BEGIN generated tag redirects (scripts/build-tag-map.mjs; tags with Search Console traffic -> the matching post)\n' +
  redirects.map(([from, to]) => `${from} ${to} 301`).join('\n') +
  '\n# END generated tag redirects\n';
const marker = '/author/* ';
if (!text.includes(marker)) throw new Error('/author/* rule not found in _redirects');
text = text.replace(marker, block + marker);
fs.writeFileSync(file, text);
const rules = text.split('\n').filter((l) => l && !l.startsWith('#')).length;
console.log('total redirect rules in _redirects:', rules, '(Cloudflare Pages limit: 2000 static, 100 dynamic)');
