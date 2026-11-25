'use strict';
// The same build runs at a username site and under a project repository.
window.PagesSite = (() => {
 const base = document.documentElement.dataset.base;
 const sections = new Set(['', 'atlas', 'guides', 'papers', 'help', 'privacy', 'about']);
 function section(url) {
  if (url.origin !== location.origin || !url.pathname.startsWith(base)) return null;
  const name = url.pathname.slice(base.length).replace(/(?:^|\/)index\.html$/, '').replace(/\/$/, '');
  return sections.has(name) ? name : null;
 }
 const route = name => name ? base + name + '/' : base;
 return {base, route, section};
})();

(() => {
 const here = new URL(location.href), section = PagesSite.section(here);
 const legacyReading = here.searchParams.get('view') === 'reading' && ['', 'atlas', 'guides'].includes(section);
 const legacyPaper = section === '' && ['page','paper','channel','topic','area','method','kind','jgroup','source','sort','journal','registry','pn','cg','cq','cs','q'].some(key=>here.searchParams.has(key)) && !here.searchParams.has('branch');
 if (legacyReading || legacyPaper) {
  here.pathname = PagesSite.route(legacyReading ? 'guides' : 'papers');
  if (legacyReading) here.searchParams.delete('view');
  location.replace(here.href);
 }
})();
