import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {buildPagesData} from './build-pages-data.mjs';

const temp = await mkdtemp(join(tmpdir(),'micro-pages-'));
const dataDir = join(temp,'data');
const outputDir = join(temp,'site','data');
const work = 'w0123456789abcdef', other = 'w9876543210abcdef';
const paper = {id:'start',title:'Original',authors:'A. Author',year:2000,url:'https://doi.org/10.1011/first'};
const source = 'https://doi.org/10.1011/cited';
const atlas = {
  branches:[{id:'alpha',name:'甲',en:'First',group:'组甲',papers:[paper],edges:[]},
    {id:'beta',name:'乙',en:'Second',group:'组乙',papers:[{...paper,id:'second',title:'Second',url:'https://doi.org/10.1011/second'}],edges:[]},
    {id:'gamma',name:'丙',en:'Third',group:'组甲',papers:[],edges:[]}],
  bridges:[{fromBranch:'alpha',toBranch:'beta',from:'start',to:'second'}]
};
const lineage = {
  stats:{links:1,counts:{alpha:1,beta:0,gamma:0}},
  branches:{alpha:[[work,[0],[['start','cites-anchor',source,[]]]]],beta:[],gamma:[]},
  facets:{alpha:[{zh:'甲',en:'First'}]},
  works:{[work]:{title:'New study',authors:'M. Author',year:2002,doi:'10.1011/new',url:'https://doi.org/10.1011/new'},
    [other]:{title:'Neighbor',authors:'L. Author',year:2001,doi:'10.1011/peer',url:'https://doi.org/10.1011/peer'}},
  betweenWorks:{[work]:[[source,[other]]]}
};
const testFiles = {atlas,lineage,catalog:{papers:['public']},influence:{papers:{}},'linked-counts':{dates:[],values:{}}};
const runtime = await readFile(new URL('../src/pages-data.js',import.meta.url),'utf8');

try {
  await mkdir(dataDir);
  for (const [key,value] of Object.entries(testFiles)) {
    await writeFile(join(dataDir,key+'.json'),JSON.stringify(value));
  }
  const result = await buildPagesData(dataDir,outputDir);
  assert.equal(result.distinct,4);
  for (const [key,value] of Object.entries(testFiles)) {
    await writeFile(join(outputDir,key+'.json'),JSON.stringify(value));
  }

  for (const [base,script,prefix] of [
    ['/awesome-micro-theory/','https://academic.test/awesome-micro-theory/assets/pages-data.js','/awesome-micro-theory/'],
    [undefined,'https://academic.test/alternate/assets/pages-data.js','/alternate/'],
    [undefined,'https://academic.test/pages-data.js','/']
  ]) {
    const requests = [],failOnce = new Set();
    const document = {currentScript:{src:script},documentElement:{dataset:{base}}};
    const window = {fetch:async (raw,options) => {
      const u = new URL(raw);
      assert.equal(u.origin,'https://academic.test');
      assert(u.pathname.startsWith(prefix+'data/'));
      assert.equal(options.credentials,'omit');
      requests.push(u.pathname);
      if (failOnce.delete(u.pathname)) return new Response(null,{status:503});
      try {
        const text = await readFile(join(outputDir,u.pathname.slice((prefix+'data/').length)));
        return new Response(options.method === 'HEAD' ? null : text,{headers:{'Content-Type':'application/json'}});
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        return new Response('Page not found',{status:404});
      }
    }};
    vm.runInNewContext(runtime,{document,window,Request,Response,URL,JSON});
    const fetch = window.PagesData.fetch;
    const req = async url => (await fetch(url)).json();
    assert.deepEqual(await req('/api/atlas?edition=1'),atlas);
    assert.deepEqual(await req('/atlas-baseline.json'),atlas);
    assert.equal((await req('/api/lineage/stats')).distinct,4);
    assert.deepEqual(requests,[prefix+'data/atlas.json',prefix+'data/lineage-stats.json']);
    failOnce.add(prefix+'data/catalog.json');
    assert.equal((await fetch('/api/catalog')).status,503);
    const [one,two] = await Promise.all([fetch('/api/catalog'),fetch('/baseline.json')]);
    assert.deepEqual(await one.json(),testFiles.catalog);
    assert.deepEqual(JSON.parse(await two.text()),testFiles.catalog);
    assert.equal(requests.filter(x=>x===prefix+'data/catalog.json').length,2);
    assert.deepEqual(await req('/api/lineage/search'),[['New study','M. Author',['alpha'],work],['Neighbor','L. Author',[],other]]);
    const details = await req('/api/lineage?branch=alpha');
    assert.equal(details.rows[0].peerCount,1);
    assert.deepEqual(details.rows[0].links,lineage.branches.alpha[0][2]);
    const direct = await req('/api/lineage/work?id='+work);
    assert.equal(direct.links[0].id,other);
    assert.equal(direct.links[0].direction,'references');
    assert.equal((await req('/api/lineage/work?id='+other)).links[0].direction,'cited-by');
    const branch = await req('/api/atlas/network?branch=alpha&scope=branch');
    const field = await req('/api/atlas/network?branch=gamma');
    const whole = await req('/api/atlas/network?branch=beta&scope=all');
    assert.equal(branch.nodes.length,2);
    assert.deepEqual(field,branch);
    assert.equal(whole.nodes.length,4);
    assert(whole.edges.some(([, ,kind])=>kind===2));
    assert(!requests.includes(prefix+'data/lineage.json'));
    assert.deepEqual(await req('/api/lineage'),lineage);
    const head = await fetch('/api/lineage/work?id='+other,{method:'HEAD'});
    assert.equal(head.status,200);
    assert.equal(await head.text(),'');
    assert.equal((await fetch('/api/lineage?branch=unknown')).status,404);
    assert.equal((await fetch('/api/lineage/work?id=w0fedcba987654321')).status,404);
    assert.equal((await fetch('/api/lineage/work?id=constructor')).status,404);
    assert.equal((await fetch('/api/atlas/network?scope=anything&branch=beta')).status,400);
    assert.equal((await fetch('/api/atlas/network?scope=branch&branch=constructor')).status,400);
    const before = requests.length;
    assert.equal((await fetch('/api/catalog',{method:'POST'})).status,405);
    assert.equal((await fetch('/api/refresh')).status,404);
    assert.equal((await fetch('https://external.test/api/catalog')).status,404);
    assert.equal((await fetch('/api/lineage?branch=..%2Fhidden')).status,404);
    assert.equal(requests.length,before);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(fetch('/api/catalog',{signal:controller.signal}),{name:'AbortError'});
  }
  console.log('Static reads, prefix and custom-domain routing, all three map scopes, citation directions, cache, lazy loading and error responses passed.');
} finally {
  await rm(temp,{recursive:true,force:true});
}
