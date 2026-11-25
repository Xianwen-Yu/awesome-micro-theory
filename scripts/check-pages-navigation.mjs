import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=fileURLToPath(new URL('../_site/',import.meta.url));
const home=await readFile(path.join(root,'index.html'),'utf8');
const base=home.match(/<html data-base="([^"]+)"/)[1];
const route=name=>base+(name?name+'/':'');
const sections=['','atlas','guides','papers','about','privacy','help'];
for(const section of sections){
 const html=await readFile(path.join(root,section,'index.html'),'utf8');
 assert.equal(/<iframe\b|\/api\/counts|counts\.js|stats\.js|https?:\/\/[^"']+\.chatgpt\.site/i.test(html),false);
 for(const [,key,raw] of html.matchAll(/\b(href|src)="([^"]+)"/g)){
  const url=new URL(raw.replaceAll('&amp;','&'),'https://pages.example'+route(section));
  if(url.origin!=='https://pages.example'){assert.notEqual(key,'src');continue;}
  assert.ok(url.pathname.startsWith(base),raw);
  const local=url.pathname.slice(base.length);
  await access(path.join(root,local,local.endsWith('/')||!local?'index.html':''));
 }
}
const assets=path.join(root,'assets');
const routeCode=await readFile(path.join(assets,'pages-site.js'),'utf8');
const atlasUrl=await readFile(path.join(assets,'atlas-url.js'),'utf8');
function visit(section,query=''){
 const location=new URL('https://pages.example'+route(section)+query);
 let redirect;
 location.replace=next=>redirect=next;
 const page={document:{documentElement:{dataset:{base}}},location,URL,URLSearchParams,AppLang:{language:'en'}};
 page.window=page;vm.createContext(page);vm.runInContext(routeCode+'\n'+atlasUrl,page);
 return {page,redirect};
}
assert.equal(visit('','?paper=a&lang=zh').redirect,'https://pages.example'+route('papers')+'?paper=a&lang=zh');
assert.equal(visit('atlas','?view=reading&guideItem=b#s').redirect,'https://pages.example'+route('guides')+'?guideItem=b#s');
const {page}=visit('atlas','?branch=org-persuasion&node=org-kg11');
assert.equal(page.PagesSite.section(new URL('https://pages.example'+route('guides'))),'guides');
assert.equal(page.PagesSite.section(new URL('https://elsewhere.invalid'+route('atlas'))),null);
assert.ok(vm.runInContext("urlFor({compare:'org-gk17'})",page).startsWith(route('atlas')+'?'));
assert.ok(vm.runInContext("urlFor({view:'reading',guideBranch:'org-persuasion'})",page).startsWith(route('guides')+'?'));
console.log('Verified all internal static links and assets, baseline OG routes, and legacy deep links at '+base);
