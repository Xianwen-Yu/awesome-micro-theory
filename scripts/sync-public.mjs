import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {copyFile, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run=promisify(execFile);
const root=dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir=join(root,'data');
const origin='https://micro-theory-index.new-harp-0081.chatgpt.site';
const endpoints={catalog:'/api/catalog',atlas:'/api/atlas',lineage:'/api/lineage',programs:'/programs.json',taxonomy:'/taxonomy.json'};
const counts=['influence','linked-counts'];
const read=async(dir,name)=>JSON.parse(await readFile(join(dir,name+'.json'),'utf8'));
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const nonempty=x=>typeof x==='string'&&x.trim().length>0;
function check(condition,where){assert(condition,'Public snapshot validation failed at '+where);}
function fields(record,names,context){
 check(record&&typeof record==='object'&&!Array.isArray(record),context);
 const allowed=new Set(names.split(' '));
 check(Object.keys(record).every(k=>allowed.has(k)),context+' fields (review upstream schema changes before publishing)');
}
function unique(rows,key,context){
 check(Array.isArray(rows)&&rows.length>0,context);
 const ids=new Set(rows.map(r=>r[key]));
 check(ids.size===rows.length&&[...ids].every(nonempty),context+' identifiers');
 return ids;
}
function publicLink(value){
 try{
  const url=new URL(value);
  return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&url.hostname.includes('.')
   && !/^(?:localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)
   && ![...url.searchParams.keys()].some(k=>/^(?:access_token|refresh_token|api_key|password|signature|X-Amz-Signature|X-Goog-Signature)$/i.test(k));
 }catch{return false;}
}
function citeLink(value){
 return publicLink(value)&&['api.crossref.org','api.opencitations.net','opencitations.net','api.openalex.org','api.datacite.org','doi.org'].includes(new URL(value).hostname);
}
function scan(record,where){
 // An unfamiliar upstream field or a contact/credential accidentally added to a note requires review.
 const encoded=JSON.stringify(record);
 check(!/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(encoded),where+' email address');
 check(!/"(?:abstract|full_?text|citationContext|cookie|authorization|visitor_?id|ip_?address|email|password|access_?token|secret|session_?id)"\s*:/i.test(encoded),where+' non-bibliographic content');
 check(!/-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:github_pat_|ghp_)[a-zA-Z0-9_]{20,}/.test(encoded),where+' credential material');
}
const titleKey=t=>t.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
const checkedDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s);
function doiLink(raw){
 if(!raw)return null;
 const url=new URL(raw);
 if(!/^(?:dx\.)?doi\.org$/i.test(url.hostname))return null;
 try{return decodeURIComponent(url.pathname.slice(1)).toLowerCase();}catch{return null;}
}
function syncMeasurements(graph,data){
 const {atlas,lineage}=data;
 const previous=data.influence.papers,priorLinked=data['linked-counts'];
 const byBranch=new Map(atlas.branches.map(b=>[b.id,new Map(b.papers.map(p=>[p.id,p]))]));
 const graphBranches=graph.branches.map(row=>row[0]);
 check(graphBranches.length===byBranch.size&&new Set(graphBranches).size===byBranch.size&&graphBranches.every(id=>byBranch.has(id)),'map branch coverage');
 const memberships=new Set(),linkedSeen=new Set(),graphIds=new Set(),papers={},byWork=new Map();
 let ambiguous=0,unknown=0;
 for(const [id,title,,year,url,count,checked,aliases] of graph.nodes){
  check(nonempty(id)&&!graphIds.has(id)&&nonempty(title)&&integer(year)&&publicLink(url),'map paper');
  graphIds.add(id);
  const known=count!==null;
  check((known&&integer(count)&&checkedDay(checked))||(!known&&checked===null),'dated or explicitly unknown map count');
  if(!known)unknown++;
  const work=lineage.works[id];
  if(work){
   check(titleKey(work.title)===titleKey(title)&&work.url===url&&work.year===year,'linked work identity');
   linkedSeen.add(id);
  }
  const entries=aliases.map(([bi,anchor])=>{
   const branch=graphBranches[bi],paper=byBranch.get(branch)?.get(anchor);
   const membership=JSON.stringify([branch,anchor]);check(paper&&!memberships.has(membership),'map annotated membership');
   memberships.add(membership);
   const old=previous[anchor]?.[0]===paper.title?previous[anchor]:null;
   return {paper,old};
  });
  // The public circle can group a working-paper DOI and a journal DOI. Counts for
  // different editions cannot be reassigned without knowing which edition was measured.
  const identifiers=new Set([work?.doi?.toLowerCase(),doiLink(url),
   ...entries.flatMap(({paper,old})=>[doiLink(paper.url),doiLink(paper.publishedUrl),old?.[1]?.toLowerCase()])].filter(Boolean));
  const identifiable=identifiers.size===1;
  const doi=identifiable?[...identifiers][0]:null;
  if(known&&!identifiable)ambiguous++;
  if(work&&known){
   const old=priorLinked.values[id],oldDay=old?priorLinked.dates[old[1]]:null;
   if(identifiable&&doi===work.doi.toLowerCase()&&(!oldDay||checked>=oldDay))byWork.set(id,[count,checked]);
   else if(old)byWork.set(id,[old[0],oldDay]);
  }
  for(const {paper,old} of entries){
   if(!known)continue;
   const sameEdition=doi&&(old?.[1]?.toLowerCase()===doi||doiLink(paper.url)===doi||doiLink(paper.publishedUrl)===doi||titleKey(paper.title)===titleKey(title));
   if(sameEdition&&(!old||checked>=old[3]))papers[paper.id]=[paper.title,doi,count,checked];
   else if(old)papers[paper.id]=old;
  }
 }
 check(linkedSeen.size===Object.keys(lineage.works).length&&memberships.size===atlas.stats.papers,'all map memberships');
 const dates=[...new Set([...byWork.values()].map(v=>v[1]))].sort();
 const dayIndex=new Map(dates.map((day,i)=>[day,i]));
 const values=Object.fromEntries([...byWork].sort(([a],[b])=>a.localeCompare(b,'en')).map(([id,[count,day]])=>[id,[count,dayIndex.get(day)]]));
 data.influence={papers:Object.fromEntries(Object.entries(papers).sort(([a],[b])=>a.localeCompare(b,'en')))};
 data['linked-counts']={dates,values};
 console.log('Public map measurements:',{nodes:graphIds.size,unknown,ambiguous_editions:ambiguous,annotated_counts:Object.keys(papers).length,linked_counts:byWork.size});
}

function validate(data,health,atlasHealth){
 for(const [name,record] of Object.entries(data))scan(record,name);
 const {catalog,atlas,lineage,programs,taxonomy,influence}=data;
 fields(catalog,'sources papers checks updated asOf stats persistent','catalog');
 check(catalog.persistent===true,'catalog persistent overlay');
 const sources=unique(catalog.sources,'id','sources');
 unique(catalog.papers,'id','papers');unique(catalog.checks,'id','checks');
 for(const row of catalog.sources){
  fields(row,'id name group url scope state note issn expectedCount programName','source');
  check(nonempty(row.name)&&publicLink(row.url),'public catalog source');
 }
 for(const p of catalog.papers){
  fields(p,'id title authors kind source url evidence date dateLabel tags checked memberships venue decisionText presenter speakerOnly areas automatic doi keywords method sourceTags tagBasis tagEvidence topics version disposition workId candidate cohort note','paper');
  check(sources.has(p.source)&&nonempty(p.title)&&nonempty(p.authors)&&publicLink(p.url)&&publicLink(p.evidence)&&publicLink(p.tagEvidence),'public paper evidence');
 }
 for(const c of catalog.checks){
  fields(c,'id source status at url note title available count lane lastChanged mode listAttempted retry_at','source check');
  check(sources.has(c.source)&&publicLink(c.url),'public check link');
 }
 for(const [field,rows] of [['sources',catalog.sources],['events',catalog.papers],['checks',catalog.checks]]){
  check(catalog.stats[field]===rows.length,field+' catalog count');
  if(health)check(health[field]===rows.length,field+' current public health count');
 }
 if(health)check(health.persistent===true&&catalog.updated===health.updated,'catalog revision');
 fields(atlas,'updated branches bridges topicLinks revision stats persistent','atlas');
 check(atlas.persistent===true&&nonempty(atlas.revision),'atlas overlay');
 if(atlasHealth)check(atlasHealth.persistent&&atlas.revision===atlasHealth.revision,'atlas public revision');
 const branchIds=unique(atlas.branches,'id','atlas branches');
 const members=new Map();
 let papers=0,edges=0,resources=0;
 for(const b of atlas.branches){
  fields(b,'id group name en question boundary papers edges resources revision updated questionEn boundaryEn','atlas branch');
  const ids=unique(b.papers,'id','annotated papers');members.set(b.id,ids);
  for(const p of b.papers){
   fields(p,'id title authors year url role note noteEn roleEn version publishedUrl','annotated paper');
   check(nonempty(p.note)&&nonempty(p.noteEn)&&publicLink(p.url)&&(!p.publishedUrl||publicLink(p.publishedUrl)),'annotated paper source');
  }
  for(const edge of b.edges){
   fields(edge,'from to label note evidence labelEn noteEn','annotated relationship');
   check(ids.has(edge.from)&&ids.has(edge.to)&&publicLink(edge.evidence),'annotated relationship endpoints');
  }
  for(const r of b.resources){
   fields(r,'title authors year url type typeEn','resource');check(nonempty(r.title)&&publicLink(r.url),'resource link');
  }
  papers+=ids.size;edges+=b.edges.length;resources+=b.resources.length;
 }
 for(const b of atlas.bridges){
  fields(b,'fromBranch from toBranch to label note evidence labelEn noteEn','bridge');
  check(members.get(b.fromBranch)?.has(b.from)&&members.get(b.toBranch)?.has(b.to)&&publicLink(b.evidence),'bridge endpoints');
 }
 assert.deepEqual(atlas.stats,{branches:branchIds.size,papers,edges,resources});
 if(atlasHealth)assert.deepEqual(atlasHealth.stats,atlas.stats);
 fields(lineage,'stats works branches facets betweenWorks attribution','lineage');
 const works=new Set(Object.keys(lineage.works));check(works.size===lineage.stats.linked&&works.size>0,'linked paper count');
 for(const w of Object.values(lineage.works)){
  fields(w,'title authors year url venue doi metadataSource','citation metadata');
  check(nonempty(w.title)&&nonempty(w.doi)&&publicLink(w.url)&&(!w.metadataSource||publicLink(w.metadataSource)),'citation paper metadata');
  check(![w.url,w.metadataSource].filter(Boolean).some(v=>/(^|\.)semanticscholar\.org$/i.test(new URL(v).hostname)),'independent bibliographic source');
 }
 let branchLinks=0,peerLinks=0;
 for(const [id,rows] of Object.entries(lineage.branches)){
  check(branchIds.has(id)&&lineage.stats.counts[id]===rows.length&&Array.isArray(lineage.facets[id]),'lineage branch count');
  for(const facet of lineage.facets[id])fields(facet,'zh en terms','research question');
  for(const [work,facets,links] of rows){
   check(works.has(work)&&facets.every(i=>integer(i)&&i<lineage.facets[id].length),'citation paper membership');
   for(const link of links){
    const [anchor,direction,source,intents,context]=link;
    check(members.get(id).has(anchor)&&['cites-anchor','cited-by-anchor'].includes(direction)&&citeLink(source),'citation evidence');
    check(link.length<=5&&(!intents||(Array.isArray(intents)&&intents.length===0))&&!context,'third-party citation prose');branchLinks++;
   }
  }
 }
 for(const [source,groups] of Object.entries(lineage.betweenWorks)){
  check(works.has(source),'reference list source');
  for(const [url,targets] of groups){
   check(citeLink(url)&&targets.every(id=>works.has(id)&&id!==source),'reference list targets');peerLinks+=targets.length;
  }
 }
 check(branchLinks===lineage.stats.links&&peerLinks===lineage.stats.linksBetweenPapers&&lineage.stats.contextualLinks===0,'citation totals');
 check(lineage.attribution?.sources?.length>0,'bibliographic attribution');
 fields(programs,'asOf url definition programs','programs');
 check(programs.programs.length>0&&new Set(programs.programs.map(p=>JSON.stringify([p.name,p.location,p.domain]))).size===programs.programs.length,'individual program entries');
 for(const p of programs.programs)fields(p,'name location domain','program directory');
 check(publicLink(programs.url),'program directory source');
 fields(taxonomy,'areas words','taxonomy');
 check(taxonomy.areas.length===7&&Object.keys(taxonomy.words).length>0,'research taxonomy');
 const areaIds=new Set(taxonomy.areas.map(v=>v[0]));
 check(Object.entries(taxonomy.words).every(([term,v])=>Array.isArray(v)&&v.length===2&&nonempty(v[0])&&(areaIds.has(v[1])||(term==='主题待核'&&v[1]===''))),'taxonomy terms');
 fields(influence,'papers','annotated citation counts');
 check(Object.values(influence.papers).length>0&&Object.values(influence.papers).every(row=>row.length===4&&nonempty(row[0])&&nonempty(row[1])&&integer(row[2])&&/^\d{4}-\d\d-\d\d$/.test(row[3])),'dated influence records');
 const linked=data['linked-counts'];fields(linked,'dates values','linked citation counts');
 check(linked.dates.every(d=>/^\d{4}-\d\d-\d\d$/.test(d))&&Object.keys(linked.values).length>0,'linked citation count dates');
 for(const [id,v] of Object.entries(linked.values))check(works.has(id)&&v.length===2&&integer(v[0])&&integer(v[1])&&v[1]<linked.dates.length,'linked citation count');
 return {catalog_events:catalog.papers.length,sources:catalog.sources.length,checks:catalog.checks.length,branches:branchIds.size,distinct_papers:lineage.stats.distinct,citations:branchLinks};
}

async function download(name,path,stage){
 // Disable curl configuration and credentials; the bibliography, dated map counts and health receipts are public GETs.
 await run('curl',['--disable','--proto','=https','--fail','--silent','--show-error','--connect-timeout','15','--max-time','120','--retry','2','--max-filesize','100000000','--header','Accept: application/json','--output',join(stage,name+'.json'),origin+path]);
}
const checkOnly=process.argv[2]==='--check';
check(process.argv.length===(checkOnly?3:2),'supported command line');
const stage=await mkdtemp(join(tmpdir(),'awesome-micro-sync-'));
const stagingOutput=await mkdtemp(join(dataDir,'.sync-'));
try{
 const data={};
 if(!checkOnly){
  for(const [name,path] of Object.entries(endpoints))await download(name,path,stage);
  await download('health','/api/health',stage);await download('atlas-health','/api/atlas/health',stage);
 }
 for(const name of Object.keys(endpoints))data[name]=await read(checkOnly?dataDir:stage,name);
 for(const name of counts)data[name]=await read(dataDir,name);
 if(!checkOnly){
  // Choose an existing branch as required by the all-scope endpoint; this requests the entire atlas.
  const branch=data.atlas.branches?.[0]?.id;check(nonempty(branch),'map request branch');
  await download('network','/api/atlas/network?scope=all&branch='+encodeURIComponent(branch),stage);
  syncMeasurements(await read(stage,'network'),data);
 }
 const stats=validate(data,checkOnly?null:await read(stage,'health'),checkOnly?null:await read(stage,'atlas-health'));
 if(!checkOnly){
  // Stage every file before replacing any. GitHub publishes only a complete successful job.
  const changed=[];
  for(const name of [...Object.keys(endpoints),...counts]){
   const file=name+'.json',next=JSON.stringify(data[name])+'\n';
   let previous=null;try{previous=await readFile(join(dataDir,file),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
   if(previous===next)continue;
   if(previous!==null)await copyFile(join(dataDir,file),join(stagingOutput,file+'.previous'));
   await writeFile(join(stagingOutput,file),next);changed.push({file,exists:previous!==null});
  }
  const installed=[];
  try{
   for(const entry of changed){await rename(join(stagingOutput,entry.file),join(dataDir,entry.file));installed.push(entry);}
  }catch(e){
   for(const {file,exists} of installed.reverse()){
    if(exists)await rename(join(stagingOutput,file+'.previous'),join(dataDir,file));else await rm(join(dataDir,file));
   }
   throw e;
  }
  console.log('Published snapshot files updated:',changed.map(x=>x.file).join(', ')||'none');
 }
 console.log('Public snapshot verified:',stats);
}finally{await rm(stage,{recursive:true,force:true});await rm(stagingOutput,{recursive:true,force:true});}
