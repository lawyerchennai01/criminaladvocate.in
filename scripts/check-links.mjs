// Post-build check: every live WordPress URL exists, and every internal link/image resolves.
import fs from 'node:fs';
import path from 'node:path';
const DIST = 'dist';
const live = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean) : [];
const redirects = fs.readFileSync('public/_redirects', 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(/\s+/)[0]);
const exists = (u) => {
  u = decodeURIComponent(u.split('#')[0].split('?')[0]);
  if (!u) return true;
  const p = path.join(DIST, u);
  return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, 'index.html')));
};
const redirected = (u) => redirects.some((r) => (r.endsWith('*') ? u.startsWith(r.slice(0, -1)) : r === u || r === u.replace(/\/$/, '')));
const missingLive = live.filter((u) => !exists(u));
console.log('live URLs checked', live.length, 'missing in build:', missingLive.length);
missingLive.slice(0, 20).forEach((u) => console.log('  MISSING', u));
const bad = new Map();
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []));
let pages = 0;
for (const f of walk(DIST)) {
  pages++;
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
    const u = m[1];
    if (u.startsWith('//') || exists(u) || redirected(u)) continue;
    if (!bad.has(u)) bad.set(u, f);
  }
}
console.log('html pages', pages, 'broken internal targets:', bad.size);
[...bad].slice(0, 25).forEach(([u, f]) => console.log('  BROKEN', u, '<-', f.replace(DIST, '')));
