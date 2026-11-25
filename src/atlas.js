'use strict';
const el=id=>document.getElementById(id);
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc=escapeHTML;
const fold=s=>String(s).normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
const keyOf=p=>fold(p.title).replace(/[^\p{L}\p{N}]/gu,'');
const external=(url,label,cls='',paperId)=>'<a target="_blank" rel="noopener noreferrer" class="'+cls+'" href="'+enc(url)+'"'+'>'+enc(label)+'</a>';
const local=(changes,name,cls='',attr='')=>'<a data-nav class="'+cls+'" href="'+enc(urlFor(changes))+'" '+attr+'>'+name+'</a>';
function branchContext(){
 const origin=history.state?.guideOrigin||document.referrer;
 if(typeof origin!=='string')return {};
 try{
  const url=new URL(origin,location.href);
  if(url.origin===location.origin&&(PagesSite.section(url)==='guides'||PagesSite.section(url)==='atlas'&&url.searchParams.get('view')==='reading'))
   return {guideOrigin:url.pathname+url.search+url.hash};
 }catch{}
 return {};
}
const byYear=(a,b)=>a.year-b.year||a.title.localeCompare(b.title);
const qstate=()=>Object.fromEntries(new URLSearchParams(location.search));
let atlas,groups,byId,searchIndex,networkStats={},citationTitles=null,titleLoading;
function lineageUrl(path){
 const url=new URL(path,location.origin);
 url.searchParams.set('edition',document.documentElement.dataset.lineage);
 if(url.pathname==='/api/lineage/stats'&&atlas?.revision)url.searchParams.set('atlas',atlas.revision);
 return url;
}
const searchText=value=>fold(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const resultsPerPage=6;
let coreSearchRows,failedTitleQuery,directoryQueryKey='',paperPage=0,hiddenPaperResults=false;
function searchablePaper(title,authors,branches,node,year,workId){
 const titleText=searchText(title),authorText=searchText(authors);
 const firstSurname=searchText(authorSurnames(authors)[0]||'');
 return {title,authors,branches,node,year,workId,titleText,authorText,text:titleText+' '+authorText,identity:titleText+'|'+firstSurname};
}
function loadTitleIndex(){
 if(!titleLoading)titleLoading=PagesData.fetch(lineageUrl('/api/lineage/search')).then(r=>{if(!r.ok)throw Error();return r.json();}).then(rows=>{
  citationTitles=rows.map(([title,authors,ids,workId])=>searchablePaper(title,authors,ids,null,null,workId));
  if(!qstate().branch&&qstate().q)render();
 }).catch(()=>{
  titleLoading=null;failedTitleQuery=qstate().q;
  if(!qstate().branch&&failedTitleQuery)render();
 });
 return titleLoading;
}
function directoryMatches(state){
 const raw=fold(state.q||'').trim(),query=searchText(raw),words=query.split(' ');
 const matchedBranches=new Set(),papers=new Map();
 if(!raw)return {available:atlas.branches,papers:[]};
 if(!citationTitles&&failedTitleQuery!==state.q)loadTitleIndex();
 if(!coreSearchRows)coreSearchRows=atlas.branches.flatMap(b=>b.papers.map(p=>searchablePaper(p.title,p.authors,[b.id],p.id,p.year)));
 function collect(rows){
  for(const row of rows){
   if(!words.every(w=>row.text.includes(w)))continue;
   for(const id of row.branches)if(byId.has(id))matchedBranches.add(id);
   const branch=row.branches.map(id=>byId.get(id)).find(b=>b&&(!state.group||b.group===state.group));
   if(!branch||papers.has(row.identity))continue;
   const rank=row.titleText===query?0:row.titleText.startsWith(query+' ')?1:row.authorText===query?2:row.titleText.includes(query)?3:row.authorText.includes(query)?4:5;
   papers.set(row.identity,{row,branch,rank});
  }
 }
 if(query){collect(coreSearchRows);if(citationTitles)collect(citationTitles);}
 return {available:atlas.branches.filter(b=>matchedBranches.has(b.id)||searchIndex.get(b.id).includes(raw)),
  papers:[...papers.values()].sort((a,b)=>a.rank-b.rank||Number(Boolean(b.row.node))-Number(Boolean(a.row.node))||a.row.title.localeCompare(b.row.title))};
}
let guideSearchCatalog;
function paperResultsPanel(){
 let panel=el('atlas-paper-results');
 if(panel)return panel;
 panel=document.createElement('section');panel.id='atlas-paper-results';panel.className='atlas-paper-results';
 panel.setAttribute('aria-labelledby','atlas-paper-heading');
 panel.innerHTML='<div class="paper-results-head"><h2 id="atlas-paper-heading">'+say('Papers','论文')+'</h2><span id="atlas-paper-count" role="status"></span><span id="atlas-paper-keys">'+say('↓ to browse · Enter to open','↓ 选择论文 · 回车打开')+'</span></div><ul id="atlas-paper-list"></ul><div id="atlas-paper-footer"></div><p id="atlas-guide-match" hidden></p>';
 const search=el('atlas-search');
 search.closest('.atlas-search').after(panel);
 search.setAttribute('aria-controls','atlas-paper-results branch-index');
 panel.addEventListener('click',event=>{
  const button=event.target.closest('button[data-paper-page]');
  if(!button)return;
  paperPage+=Number(button.dataset.paperPage);
  directory(qstate());
  el('atlas-paper-list').querySelector('a')?.focus();
 });
 return panel;
}
function showPaperResults(state,papers){
 const panel=paperResultsPanel(),key=JSON.stringify([state.q||'',state.group||'']);
 if(key!==directoryQueryKey){directoryQueryKey=key;paperPage=0;hiddenPaperResults=false;}
 panel.hidden=!state.q?.trim()||hiddenPaperResults;
 if(panel.hidden)return;
 const focusHref=panel.contains(document.activeElement)?document.activeElement.getAttribute('href'):null;
 paperPage=Math.min(paperPage,Math.max(0,Math.ceil(papers.length/resultsPerPage)-1));
 const start=paperPage*resultsPerPage,items=papers.slice(start,start+resultsPerPage);
 el('atlas-paper-keys').hidden=!items.length;
 const loading=!citationTitles&&failedTitleQuery!==state.q,failed=!citationTitles&&!loading;
 const status=el('atlas-paper-count');
 const count=papers.length?say((start+1)+'–'+(start+items.length)+' of '+papers.length,(start+1)+'–'+(start+items.length)+' / '+papers.length+' 篇'):'';
 const pending=loading?say('Searching citation titles…','正在检索引文论文…'):failed?say('Citation search unavailable','引文索引暂时不可用'):'';
 const summary=items.length?[count,pending].filter(Boolean).join(' · '):loading?pending:failed?say('No annotated paper matches. Citation search is unavailable.','未找到匹配的精读论文。引文索引暂时不可用。'):say('No paper matches. Try a shorter title or an author’s surname.','没有匹配的论文。可缩短题名，或改用作者姓氏。');
 if(status.textContent!==summary)status.textContent=summary;
 const guides=el('atlas-guide-match');
 guideSearchCatalog??=AtlasGuides.catalog(atlas.branches);
 const guideQuery=fold(state.q).trim();
 guides.hidden=!guideSearchCatalog.some(item=>item.search.includes(guideQuery));
 guides.innerHTML=guides.hidden?'':local({view:'reading',guideQ:state.q},
  enc(say('Find related readings','查看匹配的教材、讲义与综述')));
 const list=el('atlas-paper-list');
 list.innerHTML=items.map(({row,branch})=>{
  const change=row.node?{branch:branch.id,node:row.node,layout:null}:{branch:branch.id,find:row.title};
  const href=urlFor(change)+(row.node?'#core':'#citations');
  const type=row.node?say('Annotated','精读'):say('Citation','引文');
  return '<li><a data-nav href="'+enc(href)+'"'+'><span class="paper-result-type">'+type+'</span><span class="paper-result-copy"><strong>'+enc(row.title)+'</strong><small>'+enc([row.authors,row.year,isEnglish?branch.en:branch.name].filter(Boolean).join(' · '))+'</small></span><span class="paper-result-arrow" aria-hidden="true">→</span></a></li>';
 }).join('');
 const button=(direction,label)=>'<button type="button" data-paper-page="'+direction+'">'+label+'</button>';
 const footer=el('atlas-paper-footer');
 footer.innerHTML=(paperPage?button(-1,say('Previous papers','上一页论文')):'')+(start+items.length<papers.length?button(1,say('More papers','下一页论文')):'');
 if(focusHref){
  const previous=[...list.querySelectorAll('a')].find(a=>a.getAttribute('href')===focusHref);
  (previous||el('atlas-search')).focus({preventScroll:true});
 }
}
function branchTotals(branch){
 const core=branch.papers.length,linked=networkStats.counts?.[branch.id];
 if(linked==null)return say(core+' annotated papers',core+' 篇精读');
 return say(core+' annotated · '+linked+' linked papers',core+' 篇精读 · '+linked+' 篇引文论文');
}
function standardStats(){
 const appearances=atlas.branches.flatMap(b=>b.papers);
 const unique=new Set(appearances.map(keyOf)).size;
 el('stat-branches').textContent=atlas.branches.length.toLocaleString();
 el('stat-core').textContent=(networkStats.core||unique).toLocaleString();
 el('stat-total').textContent=networkStats.distinct?networkStats.distinct.toLocaleString():'—';
}
function directory(state){
 el('directory').hidden=false;el('branch-view').hidden=true;el('atlas-main').dataset.view='directory';
 document.title=say('Atlas','研究图谱')+' · Awesome Micro Theory';
 if(el('atlas-search').value!==(state.q||''))el('atlas-search').value=state.q||'';
 const query=fold(state.q||'').trim(),{available,papers}=directoryMatches(state);
 showPaperResults(state,papers);
 const navItem=(group,text,count)=>local({group:group||null,branch:null,node:null},enc(text)+' <small>'+count+'</small>','','aria-current="'+((state.group||'')===group)+'"');
 el('groups').innerHTML=navItem('','全部领域',available.length)+groups.map(g=>navItem(g,g,available.filter(b=>b.group===g).length)).join('');
 const mobileGroup=el('mobile-group');
 mobileGroup.innerHTML=['',...groups].map(g=>{
  const count=g?available.filter(b=>b.group===g).length:available.length;
  const label=AppLang.t(g||'全部领域',isEnglish);
  return '<option value="'+enc(g)+'"'+((state.group||'')===g?' selected':'')+'>'+enc(label)+' ('+count+')</option>';
 }).join('');
 const matches=available.filter(b=>!state.group||b.group===state.group);
 el('dir-heading').textContent=state.group||'全部分支';el('dir-count').textContent=matches.length+' 个分支';
 const index=el('branch-index'),filtered=Boolean(query||state.group);
 el('directory').dataset.filtered=String(filtered);
 // Keep the unfiltered choices while a search temporarily opens its matches.
 const defaults=index.openGroups??=new Set();
 const saved=history.state?.directoryFolds||{};
 const focused=index.contains(document.activeElement)?document.activeElement:null;
 const focusedGroup=focused?.getAttribute('data-fold-group'),focusedHref=focused?.getAttribute('href');
 index.innerHTML=groups.map((g,i)=>{
  const list=matches.filter(b=>b.group===g);
  if(!list.length)return '';
  const open=Object.hasOwn(saved,g)?saved[g]:filtered||defaults.has(g);
  const count=say(list.length+(list.length===1?' branch':' branches'),list.length+' 个分支');
  const bodyId='atlas-group-body-'+i;
  return '<section class="directory-fold"><h3><button class="fold-switch" type="button" data-fold-group="'+enc(g)+'" aria-controls="'+bodyId+'" aria-expanded="'+open+'">'+
   '<span class="fold-title">'+enc(AppLang.t(g,isEnglish))+'</span><span class="fold-count">'+count+'</span></button></h3>'+
   '<div class="fold-body" id="'+bodyId+'"'+(open?'':' inert')+'><div class="fold-clip"><div class="tile-grid">'+list.map(b=>
   local({branch:b.id,node:null,layout:'map',find:query&&!searchIndex.get(b.id).includes(query)?state.q:null},'<h4>'+enc(isEnglish?b.en:b.name)+'</h4><p>'+enc(localized(b,'question'))+'</p><span class="countline">'+branchTotals(b)+'</span>','branch-tile')
  ).join('')+'</div></div></div></section>';
 }).join('')||'<p class="empty">没有匹配的分支。'+local({group:null,q:null},'清除搜索与领域限制')+'</p>';
 index.onclick=e=>{
  const button=e.target.closest('button[data-fold-group]');
  if(!button||!index.contains(button))return;
  const g=button.dataset.foldGroup,open=button.getAttribute('aria-expanded')!=='true';
  const body=el(button.getAttribute('aria-controls'));
  if(!open&&body.contains(document.activeElement))button.focus({preventScroll:true});
  button.setAttribute('aria-expanded',String(open));body.inert=!open;
  if(!filtered){if(open)defaults.add(g);else defaults.delete(g);}
  history.replaceState({...history.state,directoryFolds:{...history.state?.directoryFolds,[g]:open}},'');
 };
 // Citation search can finish after the user has already tabbed into a result.
 if(focusedGroup||focusedHref){
  const replacement=focusedGroup
   ?[...index.querySelectorAll('[data-fold-group]')].find(b=>b.dataset.foldGroup===focusedGroup)
   :[...index.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===focusedHref&&!a.closest('[inert]'));
  replacement?.focus({preventScroll:true});
 }
}
function shortName(p){return authorSurnames(p.authors)[0]||'';}
function edgeEntry(branch,e,outgoing,full=false){
 const from=branch.papers.find(p=>p.id===e.from),to=branch.papers.find(p=>p.id===e.to);
 const paperLink=p=>local({branch:branch.id,node:p.id},enc(p.title)+' ('+enc(p.year)+')');
 const target=full?(paperLink(from)+' → '+paperLink(to)):paperLink(outgoing?to:from);
 return '<li class="edge-item"><small>'+enc(e.label)+'</small><div>'+target+'</div><p>'+enc(e.note)+'</p>'+external(e.evidence,'核对这条关系','edge-citation')+'</li>';
}
function crossBranchLinks(branch){
 const links=(atlas.bridges||[]).filter(e=>e.fromBranch===branch.id||e.toBranch===branch.id);
 const rows=links.map(e=>{
  const left=byId.get(e.fromBranch),right=byId.get(e.toBranch);
  const a=left?.papers.find(p=>p.id===e.from),b=right?.papers.find(p=>p.id===e.to);if(!a||!b)return '';
  const nodeLink=(g,p)=>local({branch:g.id,node:p.id},enc(shortName(p)+' ('+p.year+') · '+p.title));
  return '<li class="edge-item"><strong>'+enc(e.label)+'</strong><div>'+nodeLink(left,a)+' → '+nodeLink(right,b)+'</div><p>'+enc(e.note)+'</p>'+external(e.evidence,'核对原始论文','edge-citation')+'</li>';
 }).join('');
 return rows?'<section class="branch-section"><h2>与其他分支的联系</h2><ul class="aux-list">'+rows+'</ul></section>':'';
}
function setBranchTitle(branch,state,mapTitle){
 const selected=state.layout==='map'?(state.node||state.mapPaper?mapTitle:''):branch.papers.find(p=>p.id===state.node)?.title;
 document.title=[selected,isEnglish?branch.en:branch.name,say('Atlas','研究图谱'),'Awesome Micro Theory'].filter(Boolean).join(' · ');
}
function renderBranch(branch,state){
 const papers=branch.papers;
 el('directory').hidden=true;const view=el('branch-view');view.hidden=false;el('atlas-main').dataset.view='branch';
 setBranchTitle(branch,state);
 const lookup=new Set(branch.papers.map(keyOf));
 const related=atlas.branches.filter(b=>b.id!==branch.id&&b.papers.some(x=>lookup.has(keyOf(x))));
 const jump='<nav class="read-jumps"><a href="#core">'+say('Annotated papers','精读主线')+' <b>'+papers.length+'</b></a><a href="#citations">'+say('Citation paths','引文脉络')+' <b>'+(networkStats.counts?.[branch.id]??'…')+'</b></a>'+local({view:'reading',guideBranch:branch.id},say('Reading Guides','阅读指南'))+'</nav>';
 const switcher='<label class="branch-switch"><span>'+say('Switch branch','切换分支')+'</span><select id="branch-switch">'+groups.map(g=>'<optgroup label="'+enc(AppLang.t(g,isEnglish))+'">'+atlas.branches.filter(b=>b.group===g).map(b=>'<option value="'+enc(b.id)+'"'+(b.id===branch.id?' selected':'')+'>'+enc(isEnglish?b.en:b.name)+'</option>').join('')+'</optgroup>').join('')+'</select></label>';
 const dynamicTopic=atlas.topicLinks?.[branch.id];
 const tracker=dynamicTopic?'<div class="reading-nav"><a href="'+PagesSite.route('papers')+'?page=papers&amp;topic='+encodeURIComponent(dynamicTopic)+'">查看“'+enc(dynamicTopic)+'”的近期论文 →</a></div>':'';
 const guideOrigin=branchContext().guideOrigin;
 const back=guideOrigin?'<a data-nav data-guide-return href="'+enc(AppLang.url(guideOrigin))+'">'+say('Back to Reading Guides','返回阅读指南')+'</a>':local({branch:null,node:null},say('All branches','全部分支'));
 view.innerHTML='<div class="branch-nav">'+back+switcher+'</div><header class="reading-heading"><span class="branch-metadata">'+enc(branch.group)+'</span><h1>'+enc(isEnglish?branch.en:branch.name)+'</h1><p class="question">'+enc(localized(branch,'question'))+'</p><details class="scope-note"><summary>'+say('Scope of this branch','本分支的范围')+'</summary><p>'+enc(localized(branch,'boundary'))+'</p></details>'+jump+'</header><section class="branch-section" id="core">'+coreSection(branch,state)+'</section>'+
 citationSection(branch,state)+crossBranchLinks(branch)+tracker+
 (related.length?'<section class="branch-section"><h2>有共同论文的其他分支</h2><div class="jump-links">'+related.map(b=>local({branch:b.id,node:null},enc(b.name))).join('')+'</div></section>':'');
 const byline=document.querySelector('.atlas-hero .index-byline').cloneNode(true);
 view.querySelector('.reading-heading .question').after(byline);
}
function render(){
 if(!atlas)return;
 const state=qstate(),branch=byId.get(state.branch);
 el('status').textContent=state.branch&&!branch?'这个分支地址未匹配到条目，可在目录中搜索。':'';

 if(branch){renderBranch(branch,state);drawMap();bindYearExplorer();loadCitations(branch);}
 else{drawMap(true);directory(state);}
}
document.addEventListener('click',event=>{
 const link=event.target.closest?.('a[data-nav]');if(!link||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button!==0)return;
 const next=new URL(link.getAttribute('href'),location.href);
 if(next.origin!==location.origin||PagesSite.section(next)!=='atlas')return;
 event.preventDefault();const old=qstate();
 if(link.hasAttribute('data-guide-return')&&history.state?.guidePrevious){history.back();return;}
 const priorReader=link.closest('#core'),control=link.dataset.coreControl;
 if(control==='scope')for(const k of ['node','compare','mapPaper','mapPeer','mapMin']){if(old[k])next.searchParams.set(k,old[k]);else next.searchParams.delete(k);}
 if(control==='mode'&&old.layout==='map'){
  // The field map changes its focal paper without rebuilding these mode links.
  for(const k of ['node','compare'])if(old[k])next.searchParams.set(k,old[k]);else next.searchParams.delete(k);
 }
 if(control==='mode'&&next.searchParams.get('layout')==='timeline'&&old.year)next.searchParams.set('year',old.year);
 const triggers=[...document.querySelectorAll('a[data-nav]')].filter(a=>a.href===link.href);
 history.replaceState({...history.state,atlasReturn:{href:link.href,index:triggers.indexOf(link),
  offset:link.getBoundingClientRect().top,page:paperPage}},'');
 const nextState=next.searchParams.has('branch')?branchContext():null;
 history.pushState(nextState,'',next);
 const now=qstate();
 if(old.branch&&old.branch===now.branch&&byId.has(now.branch)&&(priorReader||link.closest('.edge-item')||now.node!==old.node||link.closest('.cite-row')&&link.href.includes('node='))){
  const core=el('core'),open=core.querySelector('.all-edges')?.open;
  const branch=byId.get(now.branch);
  setBranchTitle(branch,now);core.innerHTML=coreSection(branch,now);drawMap();bindYearExplorer();
  if(open)core.querySelector('.all-edges').open=true;
  const active=control==='peer'?core.querySelector('.connection-chip[aria-current=true]'):control==='mode'?core.querySelector('.reader-mode[aria-current=true]'):core.querySelector('#reader-pick');
  active?.focus({preventScroll:true});
  if(!priorReader||(!control&&link.closest('.chronological,.all-edges')))core.scrollIntoView({block:'start',behavior:'instant'});
  return;
 }
 render();
 if(old.branch!==now.branch){
  const target=now.branch?(next.hash==='#core'?el('core'):now.find||next.hash==='#citations'?el('citations'):el('branch-view')):el('atlas-search');
  if(target){
   if(!target.hasAttribute('tabindex')&&target.tagName!=='INPUT')target.tabIndex=-1;
   target.focus({preventScroll:true});
   if(now.branch&&(next.hash||now.find))target.scrollIntoView({block:'start',behavior:'instant'});
   else window.scrollTo({top:0,behavior:'instant'});
  }
 }
});
document.addEventListener('change',event=>{
 if(event.target.id==='mobile-group'){
  history.pushState(null,'',urlFor({group:event.target.value||null}));
  directory(qstate());
 }else if(event.target.id==='reader-pick'){
  const branch=byId.get(qstate().branch);

  history.pushState(branchContext(),'',urlFor({node:event.target.value,compare:null}));
  const state=qstate();setBranchTitle(branch,state);
  el('core').innerHTML=coreSection(branch,state);drawMap();el('reader-pick').focus({preventScroll:true});
 }else if(event.target.id==='branch-switch'){
  history.pushState(branchContext(),'',urlFor({branch:event.target.value,group:null,q:null,node:null,layout:'map'}));render();window.scrollTo({top:0,behavior:'instant'});el('branch-switch').focus({preventScroll:true});
 }
});

document.addEventListener('keydown',e=>{
 const chip=e.target.closest?.('.connection-chip');
 if(!chip||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
 const chips=[...chip.parentElement.querySelectorAll('.connection-chip')],i=chips.indexOf(chip);
 const next={ArrowRight:(i+1)%chips.length,ArrowLeft:(i+chips.length-1)%chips.length,Home:0,End:chips.length-1}[e.key];
 if(next!==undefined){e.preventDefault();chips[next].click();}
});
function updateDirectorySearch(event){
 const value=event.target.value;
 if(event.isComposing||value===(qstate().q||''))return;
 history.replaceState(null,'',urlFor({q:value||null}));render();
}
el('atlas-search').addEventListener('input',updateDirectorySearch);
el('atlas-search').addEventListener('compositionend',updateDirectorySearch);
document.addEventListener('keydown',event=>{
 if(event.isComposing||event.keyCode===229||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||el('directory').hidden)return;
 const search=el('atlas-search'),panel=el('atlas-paper-results');
 if(!panel||!search.value.trim()||(event.target!==search&&!panel.contains(event.target)))return;
 if(event.key==='Escape'&&!panel.hidden){
  event.preventDefault();hiddenPaperResults=true;panel.hidden=true;search.focus();return;
 }
 if(event.target===search&&(event.key==='ArrowDown'||event.key==='Enter')&&hiddenPaperResults){
  hiddenPaperResults=false;directory(qstate());
 }
 if(panel.hidden)return;
 const links=[...el('atlas-paper-list').querySelectorAll('a')];
 if(!links.length)return;
 const i=links.indexOf(event.target);
 if(event.target===search&&event.key==='Enter'){event.preventDefault();links[0].click();}
 if((event.target===search||i>=0)&&event.key==='ArrowDown'){event.preventDefault();links[Math.min(i+1,links.length-1)].focus();}
 if(i>=0&&event.key==='ArrowUp'){event.preventDefault();(i?links[i-1]:search).focus();}
});
function focusFragment(){
 if(!['#core','#citations'].includes(location.hash))return;
 const section=el(location.hash.slice(1));
 if(section&&!el('branch-view').hidden){
  section.tabIndex=-1;section.focus({preventScroll:true});section.scrollIntoView({block:'start',behavior:'instant'});
 }
}
window.addEventListener('popstate',()=>{
 const saved=history.state?.atlasReturn;
 if(saved&&Number.isInteger(saved.page))paperPage=saved.page;
 render();
 if(!saved){focusFragment();return;}
 const links=[...document.querySelectorAll('a[data-nav]')].filter(a=>a.href===saved.href);
 const link=links[saved.index];
 if(!link||!link.getClientRects().length)return;
 link.focus({preventScroll:true});
 window.scrollBy({top:link.getBoundingClientRect().top-saved.offset,behavior:'instant'});
});
async function init(){
 try{
  const words=fetch(PagesSite.base+'data/taxonomy.json').then(r=>r.ok?r.json():null).catch(()=>null);
  const res=await PagesData.fetch('/api/atlas');
  if(!res.ok)throw Error();
  atlas=await res.json();if(!atlas.branches?.length)throw Error();
  const statistics=PagesData.fetch(lineageUrl('/api/lineage/stats')).then(r=>r.ok?r.json():null).catch(()=>null);
  const [,vocabulary]=await Promise.all([AppLang.ready,words]);
  const tr={};
  for(const b of atlas.branches){tr[b.name]=b.en;tr[b.question]=b.questionEn||b.question;tr[b.boundary]=b.boundaryEn||b.boundary;
   for(const p of b.papers){tr[p.note]=p.noteEn||p.note;tr[p.role]=p.roleEn||p.role;}
   for(const e of b.edges){tr[e.note]=e.noteEn||e.note;tr[e.label]=e.labelEn||e.label;}
   for(const r of b.resources)tr[r.type]=r.typeEn||r.type;
  }
  for(const e of atlas.bridges||[]){tr[e.label]=e.labelEn||e.label;tr[e.note]=e.noteEn||e.note;}
  AppLang.add(tr);if(vocabulary)AppLang.addWords(vocabulary);

  groups=[...new Set(atlas.branches.map(b=>b.group))];byId=new Map(atlas.branches.map(b=>[b.id,b]));searchIndex=new Map(atlas.branches.map(b=>[b.id,fold([b.name,b.en,b.group,AppLang.t(b.group,true),b.question,b.questionEn,b.boundary,b.boundaryEn,...b.papers.map(p=>[p.title,p.authors,p.role].join(' '))].join(' '))]));
  standardStats();bindFeaturedAtlas();render();
  focusFragment();
  const totals=await statistics;
  if(totals?.counts){
   networkStats=totals;standardStats();
   for(const tile of document.querySelectorAll('.branch-tile')){
    const branch=byId.get(new URL(tile.href).searchParams.get('branch'));
    if(branch)tile.querySelector('.countline').textContent=branchTotals(branch);
   }
   const count=el('branch-view').querySelector('a[href="#citations"] b');
   if(count&&byId.has(qstate().branch))count.textContent=totals.counts[qstate().branch]??'…';
  }
 }catch{el('status').innerHTML='暂时无法读取图谱。 <button class="action" id="retry">重新读取</button>';el('retry').addEventListener('click',init);}
}
init();
