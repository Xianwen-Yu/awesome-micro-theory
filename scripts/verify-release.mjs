import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const site = fileURLToPath(new URL('../_site/', import.meta.url));
const base = process.argv[2] || '/';
const origin = 'https://pages.example';
const read = name => readFile(join(site, name), 'utf8');
const json = async name => JSON.parse(await read(name));
const pages = ['', 'atlas', 'papers', 'guides', 'help', 'privacy', 'about'];

for (const page of pages) {
  const html = await read(join(page, 'index.html'));
  assert(html.includes('data-base="' + base + '"'), 'Wrong project prefix in ' + page);
  assert(html.includes('Awesome Micro Theory'), 'Missing brand on ' + page);
  assert(!/<iframe\b|<script[^>]+src="https?:/i.test(html), 'Unexpected embed or external script on ' + page);
  for (const [, value] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) {
    const url = new URL(value.replaceAll('&amp;', '&'), origin + base + (page ? page + '/' : ''));
    if (url.origin !== origin) continue;
    assert(url.pathname.startsWith(base), 'Link outside project: ' + value);
    const relative = decodeURIComponent(url.pathname.slice(base.length));
    const target = resolve(site, relative + (url.pathname.endsWith('/') ? 'index.html' : ''));
    assert(target.startsWith(site), 'Link outside static root: ' + value);
    assert((await stat(target)).isFile(), page + ' links to a missing page or asset: ' + value);
  }
}

const [atlas,catalog,totals,titles,example] = await Promise.all([
  json('data/atlas.json'),json('data/catalog.json'),json('data/lineage-stats.json'),
  json('data/lineage-search.json'),json('data/network/branch-org-persuasion.json')
]);
const branch = atlas.branches.find(b => b.id === 'org-persuasion');
assert(branch?.edges.some(e => e.from === 'org-kg11' && e.to === 'org-gk17'), 'Guide example missing');
assert(totals.distinct >= totals.core && totals.core > 0);
assert(titles.length && example.nodes.length && catalog.sources.length && catalog.checks.length);
assert(catalog.papers.some(p => p.kind === 'JMP'), 'JMP filter has no records');
assert(!(await read('privacy/index.html')).includes('/api/counts'));
console.log(`Verified ${pages.length} static pages, project-relative links, ${atlas.branches.length} branches, ${totals.distinct} distinct works and ${catalog.papers.length} paper events.`);
