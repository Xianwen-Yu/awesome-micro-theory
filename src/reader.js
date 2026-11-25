'use strict';

function authorSurnames(authors) {
 const text=String(authors||'').replace(/,?\s+\b(?:Jr\.?|Sr\.?|III|IV)(?=\s*(?:$|[,·;；、&]|and\b))/gi,'');
 const separator=text.includes('·')?/\s*·\s*/:/\s*[;；、]\s*/;
 const familyName=name=>name.match(/(?:^|\s)((?:(?:da|de|del|den|der|di|dos|du|la|le|ten|ter|van|von)\s+)*\S+)$/iu)?.[1]||name;
 const surnames=[];
 for(const group of text.split(separator)){
  for(const name of group.split(/\s+(?:and|&)\s+/i)){
   const parts=name.split(',').map(s=>s.trim()).filter(Boolean);
   // Preserve inverted names such as “Arrow, Kenneth”, while recognizing a comma-separated list of full names.
   if(parts.length===2&&familyName(parts[0])===parts[0]){surnames.push(parts[0]);continue;}
   surnames.push(...parts.map(familyName));
  }
 }
 return surnames;
}
function paperRef(p) {
 const names=authorSurnames(p.authors);
 return names.length>2?names[0]+' et al.':names.join(' & ');
}

function readerModel(branch,state) {
 const papers=branch.papers.slice().sort(byYear);
 const nodes=new Map(papers.map(p=>[p.id,p]));
 const degree=new Map(papers.map(p=>[p.id,0]));
 for(const edge of branch.edges)for(const id of [edge.from,edge.to])degree.set(id,degree.get(id)+1);
 const selected=nodes.get(state.node)||papers.reduce((best,p)=>degree.get(p.id)>degree.get(best.id)?p:best);
 const links=branch.edges.filter(e=>e.from===selected.id||e.to===selected.id).map(e=>{
  const outgoing=e.from===selected.id;
  return {edge:e,outgoing,peer:nodes.get(outgoing?e.to:e.from)};
 }).sort((a,b)=>byYear(a.peer,b.peer));
 const current=links.find(x=>x.peer.id===state.compare)||links.find(x=>x.outgoing)||links[0];
 return {branch,papers,selected,degree,links,current,year:state.year,timeline:state.layout==='timeline',map:state.layout==='map'};
}

function paperOption(p,selected) {
 return '<option value="'+enc(p.id)+'"'+(selected?' selected':'')+'>'+enc(p.year+' · '+p.title)+'</option>';
}
function localized(obj,key) {
 return isEnglish?obj[key+'En']||obj[key]:obj[key];
}
// A paper can be annotated in multiple branches. Preserve distinct editorial
// notes and deduplicate the same documented connection across map memberships.
function paperLineage(memberships){
 const index=readingPaths(atlas), sides={before:[],after:[]};
 for(const direction of ['before','after']){
  const seen=new Set();
  for(const [branchId,id] of memberships){
   const entry=index.get(branchId)?.papers.get(id);
   for(const relation of entry?.[direction]||[]){
    const {peer,edge}=relation;
    const key=JSON.stringify([peer.title,peer.authors,peer.year,edge.evidence,edge.note,edge.noteEn]);
    if(seen.has(key))continue;
    seen.add(key);sides[direction].push({...relation,originBranch:branchId,origin:id});
   }
  }
  sides[direction].sort((a,b)=>byYear(a.peer,b.peer));
 }
 return sides;
}
function lineageDetails(memberships,preferredBranch){
 const sides=paperLineage(memberships);
 function group(direction,heading){
  const rows=sides[direction];if(!rows.length)return '';
  const lead=rows[0],sample=paperRef(lead.peer)+' ('+lead.peer.year+')';
  const items=rows.map(({peer,branch,edge,originBranch,origin})=>{
   const within=branch===originBranch;
   const href=urlFor(within?{branch,node:origin,compare:peer.id,layout:null}:{branch,node:peer.id,compare:null,layout:null},'')+'#core';
   const destination=byId.get(branch),cross=branch!==preferredBranch&&destination;
   const place=cross?' · '+enc(isEnglish?destination.en:destination.name):'';
   const authors=enc(paperRef(peer)+' ('+peer.year+')');
   return '<li><p class="lineage-byline">'+authors+place+'</p><a class="lineage-paper-title" lang="en" data-nav href="'+enc(href)+'"'+'>'+enc(peer.title)+'</a>'+
    '<p class="lineage-text"><strong>'+enc(localized(edge,'label'))+'</strong> '+enc(localized(edge,'note'))+'</p>'+
    external(edge.evidence,say('Relationship source','关系依据'),'lineage-source')+'</li>';
  }).join('');
  return '<details class="lineage-group"><summary><span class="lineage-direction">'+heading+' <b>'+rows.length+'</b></span>'+
   '<span class="lineage-preview">'+enc(sample)+' · '+enc(localized(lead.edge,'label'))+'</span></summary>'+
   '<ol class="lineage-items">'+items+'</ol></details>';
 }
 const content=group('before',say('Predecessors','前作'))+group('after',say('Successors','后作'));
 return content?'<section class="paper-lineage" aria-label="'+say('Annotated connections','精读关系')+'">'+content+'</section>':
  '<p class="lineage-empty">'+say('No annotated connections yet.','尚无已注释的前后作关系。')+'</p>';
}
function readingCard(p,linked,branch) {
 return '<article class="reading-paper '+(linked?'comparison-paper':'focus-paper')+'">'+
  '<div class="paper-period"><span>'+p.year+'</span><span>'+enc(localized(p,'role'))+'</span></div>'+
  '<h4 lang="en">'+enc(p.title)+'</h4><p class="card-authors">'+enc(p.authors)+'</p>'+
  '<p class="card-note">'+enc(localized(p,'note'))+'</p>'+lineageDetails([[branch.id,p.id]],branch.id)+'<div class="card-actions">'+
  external(p.url,say('Read paper','阅读原文'),'source-link',p.id)+
  (p.publishedUrl&&p.publishedUrl!==p.url?external(p.publishedUrl,say('Journal page','期刊页面'),'source-link',p.id):'')+
  (linked?local({node:p.id,compare:null,layout:null},say('Explore its connections','以这篇为中心'),'refocus-link'):'')+'</div></article>';
}

function comparePanel(model) {
 const {branch,selected,links,current}=model;
 if(!current)return readingCard(selected,false,branch);
 const {peer,edge,outgoing}=current;
 const chip=(z)=>local({node:selected.id,compare:z.peer.id},'<span class="chip-year">'+z.peer.year+'</span> '+enc(paperRef(z.peer)),
  'connection-chip','data-core-control="peer" title="'+enc(z.peer.title)+'" aria-label="'+enc(z.peer.title)+'" aria-current="'+(z===current)+'"');
 return '<div class="compare-panel"><div class="compare-choices"><span>'+say('Compare with','与哪篇比较')+'</span><div>'+links.map(chip).join('')+'</div></div>'+
  '<div class="compare-spread" data-connection-stage>'+readingCard(selected,false,branch)+readingCard(peer,true,branch)+'</div>'+
  '<div class="connection-note"><div class="relation-direction"><span class="connection-symbol" aria-hidden="true"></span><span>'+
  enc((outgoing?paperRef(selected):paperRef(peer))+' → '+(outgoing?paperRef(peer):paperRef(selected)))+'</span></div>'+
  '<h4>'+enc(localized(edge,'label'))+'</h4><p>'+enc(localized(edge,'note'))+'</p>'+
  external(edge.evidence,say('Source for this connection','核对这条关系'),'source-link')+'</div></div>';
}

function chronologicalView(model) {
 const {papers,degree}=model;
 return timelineExplorer(model)+'<div class="chronological"><ol>'+papers.map(p=>'<li><span class="chrono-year">'+p.year+'</span>'+
  '<div><p class="chrono-author">'+enc(paperRef(p))+'</p><h4>'+local({node:p.id,compare:null,layout:null},enc(p.title))+'</h4>'+
  '<p>'+enc(localized(p,'note'))+'</p>'+lineageDetails([[model.branch.id,p.id]],model.branch.id)+'</div>'+local({node:p.id,compare:null,layout:null},
   enc(say('Connections','关联')+' · '+degree.get(p.id)),'chron-open')+'</li>').join('')+'</ol></div>';
}
function coreSection(branch,state) {
 const m=readerModel(branch,state),p=m.selected;
 const mode=(on,layout,label)=>local({node:p.id,layout},label,'reader-mode','data-core-control="mode" aria-current="'+on+'"');
 return '<div class="reader-head"><div><h2>'+say('How papers connect','论文如何相连')+'</h2><p class="guide">'+
  say('Compare two papers, explore their neighbors, or follow the chronology.','并排比较两篇论文、沿关系图寻找前后作，也可以按发表年份阅读。')+'</p></div>'+
  '<div class="reader-modes" aria-label="'+say('Reading view','阅读视图')+'">'+mode(!m.timeline&&!m.map,null,say('Compare','对读'))+mode(m.map,'map',say('Map','关系图'))+mode(m.timeline,'timeline',say('Timeline','时间线'))+'</div></div>'+
  (m.timeline?chronologicalView(m):m.map?'<div class="reader-surface">'+mapPanel()+'</div>':'<div class="reader-surface"><div class="reader-toolbar"><label for="reader-pick">'+say('Focus paper','中心论文')+'</label>'+
   '<select id="reader-pick">'+m.papers.map(x=>paperOption(x,p.id===x.id)).join('')+'</select>'+
   '<span class="reader-total">'+enc(say(m.papers.length+' papers',m.papers.length+' 篇论文'))+'</span></div>'+comparePanel(m)+'</div>')+
  '<details class="all-edges"><summary>'+say('All connections in this branch','本分支全部关系')+' ('+branch.edges.length+')</summary><ul>'+
  branch.edges.map(e=>edgeEntry(branch,e,true,true)).join('')+'</ul></details>';
}
