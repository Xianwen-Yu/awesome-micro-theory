'use strict';

function yearPapers(model,year) {
 return model.papers.filter(p=>p.year===year).map(p=>'<article class="year-paper"><small>'+enc(p.authors)+'</small>'+
  '<h4>'+local({node:p.id,layout:'map',compare:null},enc(p.title))+'</h4><p>'+enc(localized(p,'note'))+'</p></article>').join('');
}
function timelineExplorer(model) {
 const years=[...new Set(model.papers.map(p=>p.year))];
 const year=years.includes(Number(model.year))?Number(model.year):model.selected.year;
 const i=years.indexOf(year);
 return '<section class="year-explorer" aria-label="'+say('Explore by publication year','按发表年份探索')+'"><div class="year-panel">'+
  '<div class="year-clock"><label for="year-slider">'+say('Publication year','发表年份')+'</label><output id="year-value" for="year-slider">'+year+'</output></div>'+
  '<div class="year-rail"><div class="year-track"><input type="range" min="0" max="'+(years.length-1)+'" step="1" value="'+i+'" id="year-slider" aria-valuetext="'+year+'"'+(years.length===1?' disabled':'')+'></div>'+
  '<div class="year-bounds"><span>'+years[0]+'</span><span>'+years.at(-1)+'</span></div></div>'+
  '<div class="year-steps">'+[-1,1].map(delta=>'<button type="button" data-year-step="'+delta+'"'+(i+delta<0||i+delta>=years.length?' disabled':'')+'>'+ (delta<0?say('Earlier','上一年'):say('Later','下一年'))+'</button>').join('')+'</div></div>'+
  '<div class="year-papers">'+yearPapers(model,year)+'</div></section>';
}
function bindYearExplorer() {
 const slider=document.getElementById('year-slider');if(!slider)return;
 const model=readerModel(byId.get(qstate().branch),qstate());
 const years=[...new Set(model.papers.map(p=>p.year))],section=slider.closest('section');
 const steps=[...section.querySelectorAll('[data-year-step]')];
 function sync(shouldWrite){
  const i=Number(slider.value),year=years[i];
  section.style.setProperty('--year-progress',(years.length>1?i/(years.length-1)*100:0)+'%');
  if(!shouldWrite)return;
  document.getElementById('year-value').value=year;
  slider.setAttribute('aria-valuetext',year);
  section.querySelector('.year-papers').innerHTML=yearPapers(model,year);
  steps.forEach(b=>b.disabled=i+Number(b.dataset.yearStep)<0||i+Number(b.dataset.yearStep)>=years.length);
  history.replaceState(history.state,'',urlFor({year:String(year)})+'#core');
 }
 slider.addEventListener('input',()=>sync(true));
 steps.forEach(b=>b.addEventListener('click',()=>{slider.value=Number(slider.value)+Number(b.dataset.yearStep);sync(true);}));
 sync(false);
}

const pathCache=new WeakMap();
function readingPaths(data){
 if(pathCache.has(data))return pathCache.get(data);
 const branches=new Map(data.branches.map(branch=>[branch.id,{branch,papers:new Map(
  branch.papers.map(paper=>[paper.id,{paper,before:[],after:[]}])
 )}]));
 function connect(edge,fromBranch,toBranch){
  const from=branches.get(fromBranch)?.papers.get(edge.from),to=branches.get(toBranch)?.papers.get(edge.to);
  if(!from||!to)return;
  from.after.push({peer:to.paper,branch:toBranch,edge});
  to.before.push({peer:from.paper,branch:fromBranch,edge});
 }
 for(const b of data.branches)for(const e of b.edges)connect(e,b.id,b.id);
 for(const e of data.bridges||[])connect(e,e.fromBranch,e.toBranch);
 for(const b of branches.values()){
  for(const node of b.papers.values()){
   for(const side of [node.before,node.after])side.sort((a,b)=>byYear(a.peer,b.peer));
  }
 }
 pathCache.set(data,branches);return branches;
}
function bindFeaturedAtlas(){
 const box=document.getElementById('sample-route');if(!box)return;
 const paths=readingPaths(atlas);
 if(!paths.size)return;
 const compact=matchMedia('(max-width:700px)'),toggle=document.querySelector('.route-preview-toggle');
 toggle.hidden=false;
 if(location.hash==='#sample-route')toggle.setAttribute('aria-expanded','true');
 const sync=()=>{box.hidden=compact.matches&&toggle.getAttribute('aria-expanded')!=='true';};
 toggle.onclick=()=>{toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded')!=='true'));sync()};
 compact.addEventListener('change',sync);sync();
 const branchName=b=>isEnglish?b.en||b.name:b.name;
 const routeLink=(b,p,changes,fragment)=>enc(urlFor({branch:b,node:p,...changes},''))+fragment;
 const branchOptions=groups.map(g=>'<optgroup label="'+enc(AppLang.t(g,isEnglish))+'">'+
  atlas.branches.filter(b=>b.group===g).map(b=>'<option value="'+enc(b.id)+'">'+enc(branchName(b))+'</option>').join('')+'</optgroup>').join('');
 box.setAttribute('aria-label',say('Explore paper connections','探索论文脉络'));
 box.innerHTML='<div class="path-heading"><h2>'+say('Explore paper connections','探索论文脉络')+'</h2>'+
  '<button type="button" class="path-change" aria-expanded="false" aria-controls="path-controls">'+say('Change starting point','更换起点')+'</button></div>'+
  '<div class="path-pickers" id="path-controls" hidden><label for="route-topic">'+say('Research branch','研究分支')+' <span>('+paths.size+')</span></label>'+
  '<select id="route-topic">'+branchOptions+'</select><label for="route-origin">'+say('Annotated paper','精读论文')+'</label><select id="route-origin"></select></div>'+
  '<div class="path-start"></div><div class="path-directions" role="group" aria-label="'+say('Relationship direction','关系方向')+'"></div>'+
  '<div class="path-rows"></div><div class="path-footer"></div>';
 const $=s=>box.querySelector(s),topic=$('#route-topic'),origin=$('#route-origin'),change=$('.path-change'),pickers=$('.path-pickers');
 const restored=history.state?.readingPath||{};
 let branchId,node,side='after',expanded=false;
 const limit=3;
 function storeState(){history.replaceState({...history.state,readingPath:{branchId,paper:node?.paper.id,side,expanded}},'');}
 function setPickers(open){pickers.hidden=!open;change.setAttribute('aria-expanded',String(open));}
 change.onclick=()=>{setPickers(pickers.hidden);if(!pickers.hidden)topic.focus();};
 pickers.onkeydown=e=>{if(e.key==='Escape'){setPickers(false);change.focus();}};
 function selectBranch(id,paperId,preferredSide,showAll=false){
  const entry=paths.get(id);if(!entry)return;
  branchId=id;topic.value=id;
  const entries=[...entry.papers.values()].sort((a,b)=>byYear(a.paper,b.paper));
  const degree=x=>x.before.length+x.after.length;
  node=entry.papers.get(paperId)||entries.reduce((best,x)=>!best||degree(x)>degree(best)?x:best,null);
  origin.innerHTML=entries.map(({paper:p})=>'<option value="'+enc(p.id)+'">'+enc(p.year+' · '+p.title)+'</option>').join('');
  origin.disabled=!node;
  if(node)origin.value=node.paper.id;
  side=(preferredSide==='before'||preferredSide==='after')?preferredSide:node?.after.length?'after':'before';
  expanded=showAll;
  render();storeState();
 }
 function render(){
  const b=paths.get(branchId).branch;
  if(!node){
   $('.path-start').innerHTML='<p>'+say('No annotated papers in this branch yet.','这个分支尚未收录精读论文。')+'</p>';
   $('.path-directions').replaceChildren();$('.path-rows').replaceChildren();$('.path-footer').replaceChildren();return;
  }
  const p=node.paper,rows=node[side];
  $('.path-start').innerHTML='<div class="path-meta">'+say('Starting paper','起点论文')+' <span>·</span> '+enc(branchName(b))+'</div>'+
   '<a class="path-title" data-nav lang="en" href="'+routeLink(branchId,p.id,{layout:null},'#core')+'"'+'>'+enc(p.title)+'</a>'+
   '<div class="path-author">'+enc(paperRef(p)+' · '+p.year)+'</div>';
  const directions=$('.path-directions');
  // Keep the buttons in place so switching direction preserves keyboard focus.
  if(!directions.children.length)directions.innerHTML=['before','after'].map(s=>'<button type="button" data-side="'+s+'"></button>').join('');
  directions.querySelectorAll('button').forEach(button=>{
   const s=button.dataset.side;button.setAttribute('aria-pressed',String(s===side));
   button.innerHTML=(s==='before'?say('Predecessors','前作'):say('Successors','后作'))+' <b>'+node[s].length+'</b>';
  });
  const list=expanded?rows:rows.slice(0,limit);
  $('.path-rows').innerHTML=list.map(({peer,branch,edge},i)=>{
   const cross=branch!==branchId;
   const target=cross?routeLink(branch,peer.id,{layout:null},'#core'):routeLink(branchId,p.id,{compare:peer.id,layout:null},'#core');
   return '<details class="path-entry"><summary data-row="'+i+'"><span class="path-year">'+enc(peer.year)+'</span><span class="path-paper">'+
    '<strong lang="en">'+enc(peer.title)+'</strong><small>'+enc(paperRef(peer))+(cross?' · '+enc(branchName(paths.get(branch).branch)):'')+'</small></span></summary>'+
    '<div class="path-note"><b>'+enc(localized(edge,'label'))+'</b><p>'+enc(localized(edge,'note'))+'</p>'+
    '<div class="path-actions"><a data-nav href="'+target+'"'+'>'+(cross?say('Open in its branch','到所在分支阅读'):say('Compare papers','对读这两篇'))+'</a>'+
    '<button type="button" data-follow="'+i+'">'+say('Continue from here','以此为起点')+'</button>'+
    external(edge.evidence,say('Source','关系依据'),'path-evidence')+'</div></div></details>';
  }).join('')||'<p class="path-empty">'+(side==='before'?say('No predecessor is documented for this paper yet.','这篇论文尚无已收录的前作关系。'):say('No successor is documented for this paper yet.','这篇论文尚无已收录的后作关系。'))+'</p>';
  const all=expanded?say('Show fewer','收起列表'):say('Show all '+rows.length, '展开全部 '+rows.length+' 条');
  $('.path-footer').innerHTML=(rows.length>limit?'<button type="button" class="path-all" aria-expanded="'+expanded+'">'+all+'</button>':'')+
   '<a data-nav href="'+routeLink(branchId,p.id,{anchor:p.id},'#citations')+'">'+say('Browse citations','查看引文')+'</a>';
 }
 topic.onchange=()=>{selectBranch(topic.value)};
 origin.onchange=()=>{selectBranch(branchId,origin.value);};
 box.addEventListener('click',e=>{

  const btn=e.target.closest('button');if(!btn)return;
  if(btn.dataset.side){side=btn.dataset.side;expanded=false;render();storeState();}
  else if(btn.classList.contains('path-all')){expanded=!expanded;render();storeState();$('.path-all')?.focus({preventScroll:true});}
  else if(btn.dataset.follow!==undefined){
   const next=node[side][Number(btn.dataset.follow)];
   if(next){selectBranch(next.branch,next.peer.id);setPickers(false);$('.path-title')?.focus();}
  }
 });
 const first=paths.has('org-persuasion')?'org-persuasion':paths.keys().next().value;
 const saved=paths.has(restored.branchId);
 selectBranch(saved?restored.branchId:first,saved?restored.paper:'org-kg11',saved?restored.side:null,saved&&restored.expanded);
}
