'use strict';
const citationCache=new Map();
let citationGeneration=0;
const isEnglish=AppLang.language==='en';
const say=(en,zh)=>isEnglish?en:zh;
function citationSection(branch,state){
 const block='<section class="branch-section" id="citations"><h2>'+say('Citation paths','引文脉络')+'</h2><p class="guide">'+say('Explore references and later citations connected to a core paper. Subject filters match the paper title. A citation establishes a bibliographic link; the annotated map above explains model and theorem changes.','沿核心论文查找前驱和后续引用。子问题按论文题名匹配；引用方向可在证据页核查，模型与定理的具体变化见上方精读图。')+'</p><div id="citation-content" aria-live="polite"></div></section>';
 return block;
}
async function loadCitations(branch){
 const serial=++citationGeneration;
 try{
  if(!citationCache.has(branch.id))citationCache.set(branch.id,PagesData.fetch(lineageUrl('/api/lineage?branch='+encodeURIComponent(branch.id))).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(e=>{citationCache.delete(branch.id);throw e;}));
  const data=await citationCache.get(branch.id);
  if(serial!==citationGeneration||qstate().branch!==branch.id||!el('citation-content'))return;
  renderCitations(branch,data);if(qstate().work)showPeer(qstate().work,false);
 }catch{if(serial===citationGeneration&&el('citation-content')){
  el('citation-content').innerHTML='<button type="button" class="action">'+say('Retry loading citation paths','重新读取引文脉络')+'</button>';
  el('citation-content').firstElementChild.onclick=()=>loadCitations(branch);
 }}
}
function twoStepPaths(rows,facets,papers,chosen,facet){
 const byAnchor=new Map();
 for(const work of rows){
  if(facet>=0&&!work.facets.includes(facet))continue;
  for(const [anchor,direction,source] of work.links){
   const p=papers.get(anchor);
   if(!p||(chosen&&anchor!==chosen))continue;
   const side=direction==='cites-anchor'?'later':'earlier';
   if((side==='earlier'&&work.year>=p.year)||(side==='later'&&work.year<=p.year))continue;
   if(!byAnchor.has(anchor))byAnchor.set(anchor,{earlier:[],later:[]});
   byAnchor.get(anchor)[side].push({work,source});
  }
 }
 const routes=[];
 for(const [id,sides] of byAnchor){
  const p=papers.get(id);
  for(const [i,subject] of facets.entries()){
   if(facet>=0&&i!==facet)continue;
   const first=sides.earlier.find(x=>x.work.facets.includes(i));
   const last=sides.later.find(x=>x.work.facets.includes(i));
   if(first&&last)routes.push({p,first,last,subject,id,score:first.work.links.length+last.work.links.length});
  }
 }
 if(!routes.length)return '';
 const selected=[],seenAnchors=new Set(),seenPairs=new Set();
 for(const route of routes.sort((a,b)=>b.score-a.score||a.p.year-b.p.year)){
  const pair=route.first.work.id+' '+route.last.work.id;
  if(seenPairs.has(pair)||(seenAnchors.has(route.id)&&!chosen))continue;
  seenPairs.add(pair);seenAnchors.add(route.id);selected.push(route);if(selected.length===3)break;
 }
 const show=({work,source},text)=>'<li><small>'+text+' · '+work.year+'</small>'+external(work.url,work.title,'',work.id)+'<div>'+external(source,say('Check citation','核对引文'),'edge-citation')+'</div></li>';
 return '<details class="reading-paths"><summary>'+say('Two-step reading paths','连续两步的阅读路线')+'</summary><p class="guide">'+say('Each later paper cites the one before it. The titles at both ends match the same research question.','每条路线中，后一篇都引用了前一篇。首尾两篇的题名均匹配所列子问题。')+'</p>'+selected.map(({p,first,last,subject})=>'<section><h4>'+enc(isEnglish?subject.en:subject.zh)+'</h4><ol>'+show(first,say('Earlier paper','前驱论文'))+'<li><small>'+say('Annotated paper','主线论文')+' · '+p.year+'</small>'+local({node:p.id},enc(p.title))+'</li>'+show(last,say('Later paper','后续论文'))+'</ol></section>').join('')+'</details>';
}
function renderCitations(branch,data){
 const {rows,facets}=data,box=el('citation-content'),papers=new Map(branch.papers.map(p=>[p.id,p]));
 const state=qstate(),anchor=papers.has(state.anchor)?state.anchor:'',direction=['cites-anchor','cited-by-anchor'].includes(state.direction)?state.direction:'';
 const facet=state.facet!=null&&state.facet!==''&&facets[Number(state.facet)]?Number(state.facet):-1;
 const str=(state.find||'').trim(),words=fold(str).trim().split(/\s+/).filter(Boolean),sort=state.csort||'relevance';
 const setValue=(k,v,replace=false)=>{
  const url=urlFor({[k]:v||null,cp:null});
  history[replace?'replaceState':'pushState'](branchContext(),'',url);renderCitations(branch,data);
 };
 const options=(vals,cur)=>vals.map(([v,label])=>'<option value="'+enc(v)+'" '+(String(v)===String(cur)?'selected':'')+'>'+enc(label)+'</option>').join('');
 const control=(id,title,opts,value)=>'<label>'+title+'<select id="'+id+'">'+options(opts,value)+'</select></label>';
 const pathEvidence=link=>{
  const [node,dir,src]=link,p=papers.get(node);
  if(!p)return '';
  const phrase=dir==='cites-anchor'?say('This paper cites','本文引用'):say('Referenced by','被该核心论文引用');
  const change={branch:branch.id,node:p.id};
  return '<div>'+phrase+' '+local(change,enc(shortName(p)+' ('+p.year+') · '+p.title))+' · '+external(src,say('Citation record','引文记录'),'edge-citation')+'</div>';
 };
 const result=rows.filter(r=>(facet<0||r.facets.includes(facet))&&r.links.some(([a,dir])=>(!anchor||anchor===a)&&(!direction||dir===direction))&&words.every(w=>fold(r.title+' '+r.authors+' '+r.venue+' '+r.year).includes(w)));
 if(sort==='new'||sort==='old')result.sort((a,b)=>(sort==='new'?b.year-a.year:a.year-b.year)||a.title.localeCompare(b.title));
 const page=Math.min(Math.max(1,parseInt(state.cp,10)||1),Math.max(1,Math.ceil(result.length/12)));
 const content=result.slice((page-1)*12,page*12).map(r=>{
  const links=r.links.filter(([a,d])=>(!anchor||a===anchor)&&(!direction||direction===d));
  const extra=links.slice(1);
  const topics=r.facets.map(i=>isEnglish?facets[i]?.en:facets[i]?.zh).filter(Boolean);
  const subquestions=topics.length?'<p class="cite-subjects">'+enc(topics.join(' · '))+'</p>':'';
  return '<article class="cite-row"><p class="branch-metadata">'+enc(r.year+' · '+r.venue)+'</p><h3>'+external(r.url,r.title,'',r.id)+'</h3><p class="authors">'+enc(r.authors)+'</p>'+subquestions+'<div class="cite-links">'+pathEvidence(links[0])+(extra.length?'<details><summary>'+say('More citation paths','其他引用路径')+' ('+extra.length+')</summary>'+extra.map(l=>pathEvidence(l)).join('')+'</details>':'')+'</div>'+(r.peerCount?'<button type="button" class="peer-link" data-peer="'+enc(r.id)+'">'+say('Follow citations from this paper','沿这篇论文继续读')+' ('+r.peerCount+')</button>':'')+'</article>';
 }).join('')||'<p>'+say('No papers match these filters.','没有符合这些条件的论文。')+'</p>';
 const facetOptions=facets.map((v,i)=>[i,isEnglish?v.en:v.zh]).filter(([i])=>rows.some(r=>r.facets.includes(i)));
 box.innerHTML='<div class="cite-controls">'+control('cite-anchor',say('Core paper','关联核心论文'),[['',say('All core papers','全部核心论文')],...branch.papers.filter(p=>rows.some(r=>r.links.some(l=>l[0]===p.id))).map(p=>[p.id,shortName(p)+' ('+p.year+') · '+p.title])],anchor)+control('cite-direction',say('Direction','方向'),[['',say('Both directions','全部方向')],['cited-by-anchor',say('References of the core paper','核心论文所引的文献')],['cites-anchor',say('Papers citing the core paper','引用核心论文的后续研究')]],direction)+
 (facetOptions.length?control('cite-facet',say('Research question','子问题'),[['',say('All questions','全部子问题')],...facetOptions],facet<0?'':facet):'')+
 control('cite-sort',say('Order','排序'),[['relevance',say('Topic and citation links','子问题与引用联系')],['new',say('Newest first','年份从新到旧')],['old',say('Oldest first','年份从旧到新')]],sort)+
 '<label class="cite-find">'+say('Find a linked paper','检索引文论文')+'<input type="search" id="cite-find" value="'+enc(str)+'" placeholder="'+say('Title, author or journal','题名、作者或期刊')+'"></label></div>'+
 ((!str&&!direction)?twoStepPaths(rows,facets,papers,anchor,facet):'')+'<p class="cite-count">'+result.length+' / '+rows.length+' '+say('linked papers','篇引文论文')+'</p>'+content+
 '<div class="pager">'+(page>1?local({cp:String(page-1)},say('Previous','上一页'),'action','data-cite-page'):'')+'<span>'+page+' / '+Math.max(1,Math.ceil(result.length/12))+'</span>'+(page*12<result.length?local({cp:String(page+1)},say('Next','下一页'),'action','data-cite-page'):'')+'</div>';
 for(const [id,k] of [['cite-anchor','anchor'],['cite-direction','direction'],['cite-facet','facet'],['cite-sort','csort']]){
  if(el(id))el(id).onchange=e=>{setValue(k,e.target.value);el(id)?.focus({preventScroll:true});};
 }
 let clock;
 el('cite-find').oninput=e=>{const val=e.target.value;clearTimeout(clock);clock=setTimeout(()=>{if(qstate().branch!==branch.id)return;setValue('find',val,true);el('cite-find')?.focus({preventScroll:true});},160);};
 box.querySelectorAll('[data-cite-page]').forEach(a=>a.onclick=e=>{if(e.metaKey||e.ctrlKey)return;e.preventDefault();e.stopPropagation();history.pushState(branchContext(),'',a.href);renderCitations(branch,data);el('citations').scrollIntoView({block:'start'});});
}

const workCache=new Map();
let peerSerial=0;
async function showPeer(id,recordUrl=true){
 if(!/^w[0-9a-f]{16}$/.test(id))return;

 const serial=++peerSerial;
 let modal=document.getElementById('paper-network');
 if(!modal){
  modal=document.createElement('dialog');modal.id='paper-network';modal.setAttribute('aria-labelledby','peer-heading');
  modal.innerHTML='<div class="peer-head"><strong>'+say('Citation trail','沿引文阅读')+'</strong><button type="button" class="action">'+say('Close','关闭')+'</button></div><div id="peer-content" aria-live="polite"></div>';
  document.body.append(modal);modal.querySelector('button').onclick=()=>modal.close();
  modal.addEventListener('close',()=>{++peerSerial;const u=new URL(location.href);u.searchParams.delete('work');history.replaceState(history.state,'',u);});
 }
 if(recordUrl){const u=new URL(location.href);u.searchParams.set('work',id);history.replaceState(history.state,'',u);}
 const box=modal.querySelector('#peer-content');box.textContent=say('Loading citation records…','正在读取引文记录…');if(!modal.open)modal.showModal();
 try{
  if(!workCache.has(id)){
   const resp=await PagesData.fetch(lineageUrl('/api/lineage/work?id='+encodeURIComponent(id)));if(!resp.ok)throw Error();workCache.set(id,await resp.json());
  }
  if(serial!==peerSerial||!modal.open)return;
  const work=workCache.get(id);
  const group=(dir,name)=>{
   const rows=work.links.filter(l=>l.direction===dir).sort((a,b)=>b.year-a.year||a.title.localeCompare(b.title));
   if(!rows.length)return '';
   return '<h3>'+name+' ('+rows.length+')</h3><ul>'+rows.map(w=>'<li><small>'+enc(w.year+' · '+w.venue)+'</small>'+external(w.url,w.title,'',w.id)+'<div>'+external(w.evidence,say('Check citation','核对引文'),'edge-citation')+' · <button type="button" class="peer-link" data-peer="'+enc(w.id)+'">'+say('Follow this paper','继续读')+'</button></div></li>').join('')+'</ul>';
  };
  box.innerHTML='<h2 id="peer-heading">'+external(work.url,work.title,'',work.id)+'</h2><p class="authors">'+enc(work.authors+' · '+work.year)+'</p>'+group('references',say('Papers cited by this work','本文引用的论文'))+group('cited-by',say('Papers that cite this work','引用本文的论文'));
  modal.scrollTop=0;
 }catch{if(serial===peerSerial)box.textContent=say('This citation record could not be loaded.','暂时无法读取这条引文记录。');}
}
document.addEventListener('click',e=>{const button=e.target.closest?.('[data-peer]');if(button)showPeer(button.dataset.peer);});
