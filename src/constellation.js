'use strict';

const mapScopes=['branch','field','all'];
let mapPauseOverride=null;
const scopeName=s=>({branch:say('Branch','本分支'),field:say('Field','本领域'),all:say('Whole Atlas','整个 Atlas')})[s];
const mapScope=()=>mapScopes.includes(qstate().mapScope)?qstate().mapScope:'field';
function mapPanel(){
 const pageSide=(side,name)=>'<div class="sky-neighbor-side" data-side="'+side+'"><span class="sky-neighbor-range" aria-live="polite" aria-atomic="true"></span>'+
  '<button type="button" data-step="-1" aria-label="'+say('Previous page of '+name[0], '上一组'+name[1])+'">‹</button>'+
  '<button type="button" data-step="1" aria-label="'+say('Next page of '+name[0], '下一组'+name[1])+'">›</button></div>';
 const pager='<div class="sky-neighbor-pages">'+pageSide('before',['predecessors','前作'])+pageSide('after',['successors','后作'])+'</div>';
 const btn=(id,text,title)=>'<button type="button" data-camera="'+id+'" aria-label="'+title+'" title="'+title+'">'+text+'</button>';
 return '<section class="constellation"><header class="sky-head"><div><h3>'+say('Literature map','文献地图')+'</h3><p class="sky-stats" role="status">'+say('Loading papers…','正在读取论文…')+'</p></div>'+
  '<div class="sky-scopes">'+mapScopes.map(s=>local({mapScope:s,mapFocus:null,mapPaper:null,mapPeer:null,layout:'map'},scopeName(s),'','data-core-control="scope" aria-current="'+(s===mapScope())+'"')).join('')+'</div></header>'+
  '<div class="sky-tools"><div class="sky-search"><input type="search" placeholder="'+say('Find a paper or author on this map','在图中找论文或作者')+'" aria-label="'+say('Find a paper on the map','在图中找论文')+'"><div class="sky-matches" hidden></div></div>'+
  '<label class="sky-cut"><span>'+say('Citations','被引数')+'</span><select aria-label="'+say('Minimum citation count','被引次数下限')+'">'+[0,100,500,1000].map(n=>'<option value="'+n+'"'+(Number(qstate().mapMin||0)===n?' selected':'')+'>'+(n?'≥ '+n.toLocaleString():say('All','全部'))+'</option>').join('')+'</select></label></div>'+
  '<p class="sky-gesture">'+(mapScope()==='field'?say('Select a paper to see its predecessors and successors. Drag circles to move them.','点击论文，只看它的前作与后作。拖动圆点调整位置。'):say('Drag a paper to move it. Drag the background to pan.','拖动圆点调整论文位置，拖动空白平移画布。'))+'</p><div class="sky-context" hidden><button type="button" class="sky-back">'+say('Back to field map','返回领域全图')+'</button><span class="sky-context-status" role="status" aria-live="polite"></span>'+pager+'</div><div class="sky-caption"><span class="sky-caption-key">'+say('Selected paper','当前论文')+'</span><strong class="sky-caption-title"></strong></div><div class="sky-stage"><canvas tabindex="0" aria-label="'+say('Paper map. Use the search field to select a paper, or arrow keys to pan.','论文地图。可搜索并选择论文，方向键平移。')+'"></canvas>'+
  '<div class="sky-tip" hidden></div><div class="sky-compass">'+btn('out','−',say('Zoom out','缩小'))+btn('in','+',say('Zoom in','放大'))+btn('fit',say('Fit','全图'),say('Fit all papers','显示全部论文'))+btn('locate',say('Locate','定位'),say('Locate selected paper','定位选中论文'))+btn('motion',say('Pause','暂停'),say('Pause floating','暂停浮动'))+'</div></div>'+
  '<div class="sky-legend"><span><i class="legend-core"></i>'+say('Annotated','精读论文')+'</span><span><i class="legend-linked"></i>'+say('Other papers','其他论文')+'</span><span class="sky-size">'+say('Size by citations','圆大小表示被引数')+'</span><details class="sky-legend-more"><summary>'+say('Map key','如何读图')+'</summary><div>'+
  say('Circle size follows Crossref citation counts. A hollow circle has no verified count. Arrows run from predecessor to successor. Solid lines show citations and dashed lines show annotated relationships. The overview draws a selection of links.',
  '圆的大小按 Crossref 被引数缩放，空心圆表示被引数待核。箭头从前作指向后作。实线表示引文，虚线表示经核实的精读关系。总览优先绘出部分关系。')+(mapScope()==='branch'?say(' Year bands widen with the number and size of papers they contain.',' 年代分段的宽度随论文数量和圆大小调整。'):'')+'</div></details></div>'+
  '<div class="sky-detail"></div></section>';
}

const mapCache=new Map();
function getMap(scope,branch){
 const key=scope==='field'?scope+branch.group:scope==='all'?scope:scope+branch.id;
 if(!mapCache.has(key)){
  const u=new URL('/api/atlas/network',location.origin);
  u.search=new URLSearchParams({scope,branch:branch.id,v:document.documentElement.dataset.mapEdition,atlas:atlas.revision||''});
  mapCache.set(key,PagesData.fetch(u).then(r=>{if(!r.ok)throw Error();return r.json();}).catch(error=>{mapCache.delete(key);throw error;}));
 }
 return mapCache.get(key);
}
const bound=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
function citationRadius(count){return count==null?3.2:4+2.6*Math.log1p(count)/Math.log(2.6);}


// Divide the map among subfields in proportion to their papers.
function partitionGroups(groups,x,y,w,h,place){
 if(!groups.length)return;
 if(groups.length===1){place(groups[0],x,y,w,h);return;}
 const total=groups.reduce((s,g)=>s+g.mass,0);
 let sum=groups[0].mass,cut=1;
 while(cut<groups.length-1&&Math.abs(total/2-sum-groups[cut].mass)<Math.abs(total/2-sum)){sum+=groups[cut++].mass;}
 const f=sum/total,left=groups.slice(0,cut),right=groups.slice(cut);
 if(w>h){partitionGroups(left,x,y,w*f,h,place);partitionGroups(right,x+w*f,y,w*(1-f),h,place);}
 else{partitionGroups(left,x,y,w,h*f,place);partitionGroups(right,x,y+h*f,w,h*(1-f),place);}
}
function layoutNetwork(data,nodes,scope,branchIdx){
 if(scope==='branch'){
  const aspect=globalThis.innerWidth<650?1.07:2.05;
  const area=n=>(n.r+7)**2;
  const dates=new Map(),undated=[];
  for(const n of nodes){
   const year=Number(n.row[3]);
   if(!Number.isInteger(year)||year<=0){undated.push(n);continue;}
   if(!dates.has(year))dates.set(year,[]);
   dates.get(year).push(n);
  }
  const years=[...dates.keys()].sort((a,b)=>a-b);
  const mass=list=>list.reduce((sum,n)=>sum+area(n),0);
  const datedMass=mass(nodes)-mass(undated),yearSpan=years.at(-1)-years[0]||1;
  const target=bound(Math.round(Math.sqrt(nodes.length)/2.1),2,6);
  const bands=[];
  let previousKey,accumulated=0;
  for(const year of years){
   const list=dates.get(year),weight=mass(list);
   // Give long historical intervals some room, and dense publishing years enough room for their papers.
   const share=.30*(year-years[0])/yearSpan+.70*(accumulated+weight/2)/datedMass;
   const key=Math.min(target-1,Math.floor(share*target));
   if(key!==previousKey)bands.push({first:year,last:year,list:[]});
   const band=bands.at(-1);band.last=year;band.list.push(...list);
   accumulated+=weight;previousKey=key;
  }
  if(undated.length)bands.push({list:undated});
  const total=mass(nodes)||1,baseH=Math.max(360,Math.sqrt(6.5*total/aspect)),baseW=baseH*aspect;
  const border=16,head=37,foot=18,columns=[];
  let W=border*2,H=baseH;
  for(const band of bands){
   const weight=mass(band.list);
   const preferred=(baseW-2*border)*(.18/bands.length+.82*weight/total);
   const count=Math.max(1,Math.round(Math.sqrt(band.list.length*preferred/(baseH-head-foot))));
   const rows=Array.from({length:count},()=>[]);
   // Ordering by publication year continues within a band. Papers from the same year can share a column.
   const heightNeeded=band.list.reduce((sum,n)=>sum+2*n.r+6,0);
   let used=0;
   for(const n of band.list){
    const size=2*n.r+6;
    rows[Math.min(count-1,Math.floor((used+size/2)*count/heightNeeded))].push(n);used+=size;
   }
   const bandColumns=rows.filter(row=>row.length).map(row=>{
    const minWidth=2*Math.max(...row.map(n=>n.r))+10;
    const diameter=row.reduce((sum,n)=>sum+2*n.r,0);
    H=Math.max(H,head+foot+diameter+6*(row.length+1));
    return {row,minWidth,diameter};
   });
   const minimum=bandColumns.reduce((s,c)=>s+c.minWidth,0)+12;
   const width=Math.max(preferred,minimum),surplus=(width-minimum)/bandColumns.length;
   band.x0=W-border;band.x1=band.x0+width;W+=width;
   let left=band.x0+6;
   for(const col of bandColumns){
    const colWidth=col.minWidth+surplus;
    col.row.forEach(n=>{
     const room=colWidth/2-n.r-3;
     n.x=left+colWidth/2+Math.sin((n.index+1)*2.39996)*room*.85;
     n.y=(n.index*.61803398875)%1;
    });
    columns.push(col);left+=colWidth;
   }
  }
  // Two sweeps sort each column by the vertical positions of its actual graph neighbors.
  // The vertical coordinate has no categorical interpretation.
  for(const order of [columns,[...columns].reverse()]){
   for(const {row} of order){
    const scores=new Map(row.map(n=>[n,n.adj.reduce((sum,e)=>sum+nodes[e.other].y,n.y)/(1+n.adj.length)]));
    row.sort((a,b)=>scores.get(a)-scores.get(b)||a.index-b.index);
    row.forEach((n,i)=>{n.y=(i+.5)/row.length;});
   }
  }
  for(const {row,diameter} of columns){
   const weights=[...row.map(n=>1+.32*Math.sin((n.index+1)*1.98)),1];
   const slack=H-head-foot-diameter-6*weights.length;
   const unit=Math.max(0,slack)/weights.reduce((sum,value)=>sum+value,0);
   let y=head;
   row.forEach((n,i)=>{y+=6+unit*weights[i];n.y=y+n.r;y+=2*n.r;});
  }
  const yearBands=bands.map(({x0,x1,first,last})=>({
   x0,x1,label:first==null?say('Undated','年份待核'):first===last?String(first):first+'–'+last
  }));
  return {W,H,captions:[],yearBands};
 }
 const groups=new Map(),captions=[];
 const allowed=i=>scope==='all'||i===branchIdx||scope==='field'&&data.branches[i][1]===data.branches[branchIdx][1];
 for(const n of nodes){
  const core=n.row[7].find(([b])=>allowed(b));
  const bi=core?.[0]??n.row[8].find(allowed)??branchIdx;
  const key=String(bi),label=isEnglish?data.branches[bi][3]:data.branches[bi][2];
  n.group=key;
  if(!groups.has(key))groups.set(key,{key,label,list:[],mass:0});
  const g=groups.get(key);g.list.push(n);g.mass+=(n.r+7)**2;
 }
 const total=[...groups.values()].reduce((s,g)=>s+g.mass,0);
 const W=Math.max(700,Math.sqrt(total)*2.65),H=W*.65;
 const sorted=[...groups.values()].sort((a,b)=>b.mass-a.mass||a.key.localeCompare(b.key));
 const pack=(g,x,y,w,h)=>{
  const count=g.list.length,pad=Math.min(22,w*.055,h*.06);
  const iw=w-2*pad,ih=h-2*pad,freeX=Math.max(0,iw/2-10),freeY=Math.max(0,ih/2-10);
  const list=g.list.sort((a,b)=>(b.row[7].length>0)-(a.row[7].length>0)||b.r-a.r||a.index-b.index);
  let area=0;
  for(let i=0;i<count;i++){
   const n=list[i],m=(n.r+7)**2,angle=i*2.3999632297+g.key.length*.7;
   const t=i===0?0:Math.sqrt((area+m*.45)/g.mass);
   const cx=Math.cos(angle),sy=Math.sin(angle),edge=1/Math.max(.001,Math.abs(cx),Math.abs(sy));
   n.x=x+w/2+cx*t*freeX*edge;n.y=y+h/2+sy*t*freeY*edge;area+=m;
  }
  if(count>3)captions.push({x:x+w*.5,y:y+pad*.7,w:w*.8,text:g.label});
 };
 partitionGroups(sorted,0,0,W,H,pack);
 // A local grid separates intersecting circles without an all-pairs simulation.
 const cell=85;
 for(let pass=0;pass<14;pass++){
  const grid=new Map();
  for(const n of nodes){
   const cx=Math.floor(n.x/cell),cy=Math.floor(n.y/cell);
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const p of grid.get((cx+dx)+','+(cy+dy))||[]){
    const vx=n.x-p.x||.1,vy=n.y-p.y||.1,d=Math.hypot(vx,vy),gap=n.r+p.r+3-d;
    if(gap<=0)continue;const f=gap*.47/d;n.x+=vx*f;n.y+=vy*f;p.x-=vx*f;p.y-=vy*f;
   }
   const k=cx+','+cy;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(n);
  }
 }
 return {W,H,captions};
}

let closeSky,skyGeneration=0;
function drawMap(clear=false){
 const generation=++skyGeneration;closeSky?.();closeSky=null;
 const box=clear?null:document.querySelector('.constellation');if(!box)return;
 const branch=byId.get(qstate().branch),scope=mapScope();
 setBranchTitle(branch,qstate());
 getMap(scope,branch).then(data=>{
  if(!box.isConnected||generation!==skyGeneration)return;
  closeSky=displaySky(box,branch,scope,data);
 }).catch(()=>{
  if(!box.isConnected||generation!==skyGeneration)return;
  box.querySelector('.sky-stats').textContent=say('The map could not load.','地图未能载入。');
  const btn=document.createElement('button');btn.textContent=say('Retry','重新载入');box.querySelector('.sky-stats').append(' ',btn);btn.onclick=()=>drawMap();
 });
}
function displaySky(box,branch,scope,full){
 const cut=box.querySelector('.sky-cut select');
 cut.onchange=()=>{history.pushState(branchContext(),'',urlFor({layout:'map',mapScope:scope,mapMin:cut.value==='0'?null:cut.value})+'#core');drawMap();};
 const min=Number(cut.value);
 let data=full;
 if(min){
  const renumber=new Int32Array(full.nodes.length).fill(-1),nodes=[],edges=[];
  full.nodes.forEach((n,i)=>{if(n[5]!=null&&n[5]>=min){renumber[i]=nodes.length;nodes.push(n);}});
  for(const [a,b,t] of full.edges)if(renumber[a]>=0&&renumber[b]>=0)edges.push([renumber[a],renumber[b],t]);
  data={nodes,edges,branches:full.branches};
 }
 box.dataset.empty=String(!data.nodes.length);
 if(!data.nodes.length){
  box.querySelector('.sky-context').hidden=true;
  box.querySelector('.sky-stats').textContent=say('No papers at this citation threshold.','当前被引下限下没有论文。');
  box.querySelector('.sky-detail').replaceChildren();
  const c=box.querySelector('canvas');c.getContext('2d').clearRect(0,0,c.width,c.height);
  return ()=>{};
 }
 const canvas=box.querySelector('canvas'),ctx=canvas.getContext('2d'),stage=canvas.parentElement,tip=box.querySelector('.sky-tip');
 const search=box.querySelector('input[type=search]'),matches=box.querySelector('.sky-matches'),detail=box.querySelector('.sky-detail');
 const contextBar=box.querySelector('.sky-context'),back=box.querySelector('.sky-back'),stats=box.querySelector('.sky-stats'),brIndex=data.branches.findIndex(b=>b[0]===branch.id);
 const byKey=new Map(),byAnchor=new Map();
 const nodes=data.nodes.map((row,i)=>{
  const short=paperRef({authors:row[2]});
  const n={index:i,row,short,adj:[],r:citationRadius(row[5]),color:'#675895',text:fold(row[1]+' '+row[2]+' '+row[3])};
  byKey.set(row[0],n);
  for(const [b,id] of row[7])byAnchor.set(data.branches[b][0]+'/'+id,n);
  return n;
 });
 const edges=data.edges.map(([a,b,type],i)=>{
  nodes[a].adj.push({other:b,edge:i,out:true,type});nodes[b].adj.push({other:a,edge:i,out:false,type});
  return {a:nodes[a],b:nodes[b],type};
 });
 const referenceEdges=scope==='branch'?edges.filter(e=>(e.type&2)!==0).sort((a,b)=>
  (b.a.r+b.b.r)-(a.a.r+a.b.r)||a.a.index-b.a.index).slice(0,Math.min(14,Math.ceil(nodes.length/7))):[];
 const model=readerModel(branch,qstate()),state=qstate();
 const requestedAnchor=state.node&&byAnchor.get(branch.id+'/'+state.node);
 let focus=requestedAnchor||byKey.get(state.mapPaper)||byAnchor.get(branch.id+'/'+model.selected.id)||nodes.reduce((best,n)=>n.r>best.r?n:best);
 const initialPeer=byKey.get(state.mapPeer)||byAnchor.get(branch.id+'/'+state.compare);
 let peer=initialPeer&&focus.adj.some(e=>e.other===initialPeer.index)?initialPeer:null;
 let layout=layoutNetwork(data,nodes,scope,brIndex),camera={x:0,y:0,k:1},w=0,h=0,fitK=1,frame=0,hover=null,disposed=false;
 let near=new Set(focus.adj.map(x=>x.other));
 const annotated=nodes.filter(n=>n.row[7].length).length;
 const groupName=scope==='all'?'Atlas':scope==='field'?AppLang.t(branch.group,isEnglish):(isEnglish?branch.en:branch.name);
 stats.textContent=groupName+' · '+say(nodes.length.toLocaleString()+' papers · '+annotated.toLocaleString()+' annotated',nodes.length.toLocaleString()+' 篇论文 · '+annotated.toLocaleString()+' 篇精读');
 const rankedLabels=[...nodes].sort((a,b)=>b.r-a.r||b.adj.length-a.adj.length);
 let neighbors=rankedLabels.filter(n=>near.has(n.index)),viewNodes=nodes,places=null,savedCamera=null;
 let sides=partitionNeighbors(focus),pages={before:0,after:0},lastCapacity=0,visibleLinks=focus.adj;
 let nominalPlaces=new Map(),dragOffsets=new Map();
 let viewFit={x:0,y:0,k:1},transition=null,lastPaint=-Infinity,clock=0,elapsed=0,prevTime=null;
 let onScreen=true,pending=true,drag=null,pinch=null,tug=null,released=null,freeNodes=[],freeCamera='',holdDrift=false;
 const motion=window.matchMedia?.('(prefers-reduced-motion: reduce)');
 const reduced=()=>mapPauseOverride??motion?.matches??true;
 const motionButton=box.querySelector('[data-camera="motion"]');
 const now=()=>globalThis.performance?.now()??0;
 const tick=()=>{pending=true;schedule();};
 function schedule(){
  if(!disposed&&!frame&&onScreen&&!document.hidden)frame=requestAnimationFrame(advance);
 }
 function advance(timestamp){
  frame=0;if(disposed||!onScreen||document.hidden)return;
  clock=timestamp??now();
  if(prevTime!==null&&!reduced())elapsed+=Math.min(80,Math.max(0,clock-prevTime));prevTime=clock;
  const cadence=places||transition||drag?16:nodes.length>5000?45:30;
  if(pending||clock-lastPaint>=cadence){pending=false;lastPaint=clock;paint();}
  if(!reduced()||transition)schedule();
 }
 function resetClock(){
  prevTime=null;lastPaint=-Infinity;cancelAnimationFrame(frame);frame=0;tick();
  const label=reduced()?say('Resume floating','开启浮动'):say('Pause floating','暂停浮动');
  motionButton.title=label;motionButton.setAttribute?.('aria-label',label);
  motionButton.textContent=reduced()?say('Play','浮动'):say('Pause','暂停');
 }
 function setCamera(c){Object.assign(camera,c);tick();}
 function fit(){
  setCamera(places?viewFit:{k:fitK,x:(w-layout.W*fitK)/2,y:(h-layout.H*fitK)/2});
 }
 function locate(n,initial=false){
  if(places){setCamera({...camera,x:w/2-places.get(n.index).x*camera.k,y:h/2-places.get(n.index).y*camera.k});return;}
  camera.k=bound(Math.max(fitK,initial?.78:1.25),fitK,Math.max(4,fitK*5));
  camera.x=w/2-n.x*camera.k;camera.y=h/2-n.y*camera.k;
  if(layout.W*camera.k>w)camera.x=bound(camera.x,w-layout.W*camera.k-10,10);
  if(layout.H*camera.k>h)camera.y=bound(camera.y,h-layout.H*camera.k-10,10);tick();
 }
 // A paper with evidence in both directions occupies one slot. Its detail retains both links.
 function partitionNeighbors(center){
  const records=new Map();
  for(const edge of center.adj){
   if(edge.other===center.index)continue;
   if(!records.has(edge.other))records.set(edge.other,{node:nodes[edge.other],before:false,after:false,annotated:false});
   const record=records.get(edge.other);
   record[edge.out?'after':'before']=true;
   if(edge.type&2)record.annotated=true;
  }
  const ranked=[...records.values()].sort((a,b)=>Number(b.annotated)-Number(a.annotated)||
   Number(Boolean(b.node.row[7].length))-Number(Boolean(a.node.row[7].length))||
   (b.node.row[5]??-1)-(a.node.row[5]??-1)||a.node.row[1].localeCompare(b.node.row[1])||a.node.index-b.node.index);
  const groups={before:[],after:[]};
  for(const r of ranked){
   // Dates resolve placement only when the source data supports both directions.
   const side=r.before&&r.after?(r.node.row[3]>center.row[3]?'after':'before'):r.before?'before':'after';
   groups[side].push(r.node);
  }
  return groups;
 }
 function arrange({animate=false,reveal=null}={}){
  const compact=w<640,capacity=compact?2:3;
  if(lastCapacity&&lastCapacity!==capacity){
   for(const side of ['before','after'])pages[side]=Math.floor(pages[side]*lastCapacity/capacity);
  }
  lastCapacity=capacity;
  for(const [index,p] of places||[]){
   const old=nominalPlaces.get(index);
   if(old)dragOffsets.set(index,{x:p.x-old.x,y:p.y-old.y});
  }
  const visible={before:[],after:[]};
  for(const side of ['before','after']){
   const group=sides[side],index=reveal?group.indexOf(reveal):-1,max=Math.max(0,Math.ceil(group.length/capacity)-1);
   pages[side]=bound(index>=0?Math.floor(index/capacity):pages[side],0,max);
   visible[side]=group.slice(pages[side]*capacity,(pages[side]+1)*capacity);
  }
  neighbors=[...visible.before,...visible.after];
  const next=[focus,...neighbors],animation=animate?capture(next):null;
  viewNodes=next;
  const shown=new Set(neighbors.map(n=>n.index));
  visibleLinks=focus.adj.filter(link=>shown.has(link.other));
  const centerY=(h-54)*.5+9,scale=compact?.86:1;
  // Keep the bottom compass clear. Wide screens read left to right, narrow ones top to bottom.
  const target=new Map([[focus.index,{x:0,y:0}]]);
  for(const side of ['before','after']){
   const list=visible[side],sign=side==='before'?-1:1;
   for(const [i,n] of list.entries()){
    const offset=i-(list.length-1)/2;
    const x=compact?offset*w*.49:sign*w*.32;
    const y=compact?sign*Math.min((h-102)*.39,151):offset*Math.min(117,(h-119)*.39);
    target.set(n.index,{x:x/scale,y:y/scale});
   }
  }
  nominalPlaces=target;
  places=new Map([...target].map(([index,p])=>{
   const delta=dragOffsets.get(index);
   return [index,{x:p.x+(delta?.x||0),y:p.y+(delta?.y||0)}];
  }));
  viewFit={x:w/2,y:centerY,k:scale};transition=animation;fit();
 }
 function resize(){
  const nw=stage.clientWidth,nh=stage.clientHeight;if(!nw||!nh||nw===w&&nh===h)return;
  const old=w,oldH=h,oldFit=fitK,k=camera.k;w=nw;h=nh;const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);freeCamera='';
  fitK=Math.min((w-20)/layout.W,(h-20)/layout.H);
  if(places){savedCamera.x+=(w-old)/2;savedCamera.y+=(h-oldH)/2;transition=null;arrange({reveal:peer});syncView();return;}
  if(!old||Math.abs(k-oldFit)<.0005)fit();
  else{camera.x+=(w-old)/2;camera.y+=(h-oldH)/2;tick();}
  if(!old&&(state.mapPaper||state.node)&&nodes.length>750)locate(focus,true);
 }
 function zoom(z,p){const base=places?viewFit.k:fitK,k=bound(z,base*.65,Math.max(5,base*10)),m=k/camera.k;camera.x=p.x-(p.x-camera.x)*m;camera.y=p.y-(p.y-camera.y)*m;camera.k=k;tick();}
 const at=n=>places?.get(n.index)||n;
 function dot(n){
  const scaled=n.r*camera.k;
  if(scope==='branch'||places){
   const compact=places ? .90 : .74;
   return Math.max(n.row[7].length?2.6:1.8,scaled*compact);
  }
  return Math.max(n.row[7].length?2.1:1.1,scaled);
 }
 const visible=(p,r=0)=>p.x>=-r&&p.y>=-r&&p.x<=w+r&&p.y<=h+r;
 // Cull before animation. The expensive atlas-wide scan runs on camera changes only.
 function inView(){
  if(places)return viewNodes;
  const key=[camera.x,camera.y,camera.k,w,h].join('/');
  if(key!==freeCamera){
   freeCamera=key;freeNodes=rankedLabels.filter(n=>visible({x:n.x*camera.k+camera.x,y:n.y*camera.k+camera.y},dot(n)+40));
  }
  return freeNodes;
 }
 function screen(n){
  const base=at(n);let x=base.x*camera.k+camera.x,y=base.y*camera.k+camera.y;
  if(n.index===undefined)return {x,y};
  if(!reduced()||holdDrift){
   if(drag?.n===n&&drag.moved)return {x:x+drag.offset.x,y:y+drag.offset.y};
   const t=elapsed*.001,phase=n.index*2.39996;
   const amplitude=(places?2.9:scope==='branch'?2.2:Math.min(5.8,1.8+dot(n)*.28))*(n===focus ? .28 : 1);
   x+=amplitude*(Math.sin(t*.82+phase)+.32*Math.sin(t*1.39-phase));
   y+=amplitude*(Math.cos(t*.91-phase*.7)+.36*Math.sin(t*1.17+phase));
   if(released?.n===n){
    const v=Math.max(0,1-(clock-released.time)/300)**2;
    x+=(base.x*camera.k+camera.x+released.offset.x-x)*v;y+=(base.y*camera.k+camera.y+released.offset.y-y)*v;
   }
   if(tug&&tug.peers.has(n.index)){
    const age=(clock-tug.time)/1000,fall=Math.exp(-4*age)*Math.cos(6*age);
    x+=tug.x*fall;y+=tug.y*fall;
   }
   const from=transition?.from.get(n.index);
   if(from){const v=1-transition.progress;x+=(from.x-x)*v;y+=(from.y-y)*v;}
  }
  return {x,y};
 }
 function capture(next){
  if(reduced()||!w)return null;
  const from=new Map();
  for(const n of next)if(!places||places.has(n.index))from.set(n.index,screen(n));
  const ghost=document.createElement('canvas');ghost.width=canvas.width;ghost.height=canvas.height;
  ghost.getContext('2d').drawImage(canvas,0,0);
  return {from,ghost,start:now(),progress:0};
 }
 const overviewPriorities=new WeakMap();
 function overviewLinks(n){
  if(!overviewPriorities.has(n)){
   const ranked=[...n.adj].sort((a,b)=>(b.type&2)-(a.type&2)||nodes[b.other].r-nodes[a.other].r||a.other-b.other);
   const selected=ranked.slice(0,8);
   for(const out of [false,true]){
    const first=ranked.find(link=>link.out===out);
    if(first&&!selected.includes(first))selected[selected.length-1]=first;
   }
   overviewPriorities.set(n,selected);
  }
  return overviewPriorities.get(n);
 }
 function paint(){
  if(!w)return;
  if(transition){
   const t=bound((clock-transition.start)/540,0,1);
   transition.progress=1-Math.pow(1-t,3);
   if(t===1||reduced())transition=null;
  }
  if(tug&&clock-tug.time>1300)tug=null;
  if(released&&clock-released.time>300)released=null;
  const dpr=canvas.width/w;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const drawing=inView(),positions=new Map(),radii=new Map();
  function pointFor(n){if(!positions.has(n))positions.set(n,screen(n));return positions.get(n);}
  function radiusFor(n){if(!radii.has(n))radii.set(n,dot(n));return radii.get(n);}
  if(transition)ctx.globalAlpha=.15+.85*transition.progress;
  const labelZones=[];
  const publicationBands=!places&&layout.yearBands;
  if(publicationBands){
   ctx.font='600 11px system-ui';ctx.textBaseline='middle';ctx.textAlign='left';
   let lastRight=-Infinity;
   for(const band of publicationBands){
    const x=camera.x+band.x0*camera.k,end=camera.x+band.x1*camera.k;
    if(end<0||x>w)continue;
    ctx.strokeStyle='rgba(74,82,101,.12)';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x,16);ctx.lineTo(x,h-18);ctx.stroke();
    const width=ctx.measureText(band.label).width+8,left=Math.max(7,x+7);
    if(left<lastRight+10||left+width>Math.min(w,end+12))continue;
    ctx.fillStyle='#596077';ctx.fillText(band.label,left,19);
    labelZones.push({x:left-3,y:8,width,height:23});lastRight=left+width;
   }
  }
  if(places){
   ctx.font='600 12px system-ui';ctx.textBaseline='middle';ctx.textAlign='center';
   for(const group of ['before','after']){
    const page=sides[group].slice(pages[group]*lastCapacity,(pages[group]+1)*lastCapacity);
    if(!page.length)continue;
    const points=page.map(pointFor),left=Math.min(...points.map(p=>p.x)),right=Math.max(...points.map(p=>p.x));
    const x=(left+right)/2,top=Math.min(...points.map((p,i)=>p.y-radiusFor(page[i])));
    const y=top-(w<640?23:46);
    const name=group==='before'?say('Predecessors','前作'):say('Successors','后作');
    const width=ctx.measureText(name).width+14;
    if(y<12||y>h-18||x-width/2<4||x+width/2>w-4)continue;
    ctx.fillStyle=group==='before'?'#4c716d':'#786789';ctx.fillText(name,x,y);
    labelZones.push({x:x-width/2,y:y-9,width,height:18});
   }
  }
  function segment(e,arrows){
   const a=pointFor(e.a),b=pointFor(e.b);
   if((a.x<-3&&b.x<-3)||(a.x>w+3&&b.x>w+3)||(a.y<-3&&b.y<-3)||(a.y>h+3&&b.y>h+3))return;
   const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
   const r0=radiusFor(e.a)+2,r1=radiusFor(e.b)+2;
   if(d<r0+r1+1)return;
   const ux=dx/d,uy=dy/d,ax=a.x+ux*r0,ay=a.y+uy*r0,bx=b.x-ux*r1,by=b.y-uy*r1;
   ctx.moveTo(ax,ay);
   if(places){
    const horizontal=w>=640;
    const cx=horizontal?(ax+bx)/2:ax,cy=horizontal?ay:(ay+by)/2;
    const ex=horizontal?(ax+bx)/2:bx,ey=horizontal?by:(ay+by)/2;
    ctx.bezierCurveTo(cx,cy,ex,ey,bx,by);
    if(arrows){
     const length=Math.hypot(bx-ex,by-ey)||1;
     arrow(bx,by,(bx-ex)/length,(by-ey)/length);
    }
   }else{
    ctx.lineTo(bx,by);
    if(arrows&&d>r0+r1+9)arrow(bx,by,ux,uy);
   }
  }
  function arrow(x,y,ux,uy){
   const size=4.7;
   ctx.moveTo(x-ux*size-uy*size*.49,y-uy*size+ux*size*.49);
   ctx.lineTo(x,y);ctx.lineTo(x-ux*size+uy*size*.49,y-uy*size-ux*size*.49);
  }
  if(!places&&referenceEdges.length){
   ctx.setLineDash([3,5]);ctx.lineWidth=.85;ctx.strokeStyle='rgba(117,101,151,.22)';ctx.beginPath();
   for(const edge of referenceEdges)if(edge.a!==focus&&edge.b!==focus)segment(edge,false);
   ctx.stroke();
  }
  const incident=places?visibleLinks:overviewLinks(focus);
  const activePeer=hover&&near.has(hover.index)?hover:peer;
  for(const l of incident){
   const isActive=activePeer?.index===l.other;
   ctx.lineWidth=isActive?2:places?1.35:1.15;
   ctx.strokeStyle=isActive?'#574181':l.out?(places?'#aa9eba':'#ab9ec0'):(places?'#7fa6a1':'#81a7a4');
   ctx.setLineDash(l.type===2?[4,4]:[]);ctx.beginPath();segment(edges[l.edge],true);ctx.stroke();
  }
  if(!places&&activePeer&&!incident.some(l=>l.other===activePeer.index)){
   for(const l of focus.adj)if(l.other===activePeer.index){
    ctx.lineWidth=1.8;ctx.strokeStyle='#654f8c';ctx.setLineDash(l.type===2?[4,4]:[]);
    ctx.beginPath();segment(edges[l.edge],true);ctx.stroke();
   }
  }
  ctx.setLineDash([]);
  const layers=new Map();
  for(const n of drawing){
   const p=pointFor(n),r=radiusFor(n);if(!visible(p,r+2))continue;
   const color=n.row[7].length?n.color:(near.has(n.index)?'#929aa8':'#c5c9d0');
   const key=color+(n.row[5]==null?'?':'');if(!layers.has(key))layers.set(key,{color,unknown:n.row[5]==null,items:[]});layers.get(key).items.push(n);
  }
  for(const group of [...layers.values()].sort((a,b)=>(a.items[0].row[7].length>0)-(b.items[0].row[7].length>0))){
   ctx.beginPath();for(const n of group.items){const p=pointFor(n),r=radiusFor(n);ctx.moveTo(p.x+r,p.y);ctx.arc(p.x,p.y,r,0,Math.PI*2);}
   ctx.fillStyle=group.unknown?'#fafafd':group.color;ctx.fill();ctx.strokeStyle=group.unknown?group.color:'rgba(255,255,255,.9)';ctx.lineWidth=group.unknown?1.4:.65;ctx.stroke();
  }
  const fp=pointFor(focus),fr=radiusFor(focus);
  for(const n of new Set([peer,hover].filter(n=>n&&n!==focus&&(!places||places.has(n.index))))){
   const p=pointFor(n),r=radiusFor(n);ctx.strokeStyle='#88799f';ctx.lineWidth=1.3;
   ctx.beginPath();ctx.arc(p.x,p.y,r+2.4,0,Math.PI*2);ctx.stroke();
  }
  if(visible(fp,fr+10)){
   const wave=reduced()?0:(1+Math.sin(elapsed*.0013))*.7;
   ctx.beginPath();ctx.arc(fp.x,fp.y,fr+5.5+wave,0,Math.PI*2);ctx.strokeStyle='rgba(194,151,83,.32)';ctx.lineWidth=3;ctx.stroke();
   ctx.beginPath();ctx.arc(fp.x,fp.y,fr+2.5,0,Math.PI*2);ctx.strokeStyle='#29253e';ctx.lineWidth=1.55;ctx.stroke();
  }
  const occupied=labelZones;
  // Leave the floating camera controls and other labels readable at every zoom.
  occupied.push({x:0,y:h-52,width:w<681?244:216,height:52});
  const intersects=(a,b)=>a.x<b.x+b.width+3&&a.x+a.width+3>b.x&&a.y<b.y+b.height+3&&a.y+a.height+3>b.y;
  if(!places&&camera.k<.42){
   ctx.font='600 11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
   for(const c of layout.captions){
    const p=screen(c),width=ctx.measureText(c.text).width+6,z={x:p.x-width/2,y:p.y-8,width,height:16};
    if(!visible(p)||width>c.w*camera.k||p.y<12||p.y>h-14||occupied.some(v=>intersects(z,v)))continue;
    ctx.fillStyle='#f8f8fb';ctx.fillRect(z.x,z.y,z.width,z.height);
    ctx.fillStyle='#575366';ctx.fillText(c.text,p.x,p.y);occupied.push(z);
   }
  }
  const compact=w<640,priorities=places?drawing:[...incident.map(l=>nodes[l.other]),...drawing.slice(0,330)];
  const labels=new Set([focus,hover,peer,...priorities]);
  const obstacles=places||scope==='branch'?drawing.map(n=>({n,p:pointFor(n),r:radiusFor(n)+2})):null;
  const baseBudget=compact?5:10;
  const budget=places?drawing.length:Math.min(28,Math.max(baseBudget,Math.round(baseBudget*camera.k/fitK)));
  let written=0;
  ctx.textAlign='left';ctx.textBaseline='middle';
  function shorten(text,maxWidth){
   const width=ctx.measureText(text).width;
   if(width<=maxWidth)return text;
   let lo=0,hi=text.length;
   while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(ctx.measureText(text.slice(0,mid)+'…').width<=maxWidth)lo=mid;else hi=mid-1;}
   return text.slice(0,lo).trimEnd()+'…';
  }
  for(const n of labels){
   if(!n||written>=budget||(places&&!places.has(n.index)))continue;
   const pt=pointFor(n),r=radiusFor(n),chosen=n===focus,active=chosen||n===hover||n===peer;
   if(!visible(pt,r)||(!places&&!active&&r<3.2))continue;
   const authorFont=(chosen?'650 ':places?'600 ':'500 ')+(chosen?14:places?(compact?12:14):11.5)+'px system-ui';
   const max=places?(compact?Math.min(150,w*.40):Math.min(270,w*.27)):Math.min(245,w*.69);
   ctx.font=authorFont;
   const name=shorten(n.short+' · '+n.row[3],max),nameWidth=ctx.measureText(name).width;
   let title='',titleWidth=0;
   const titleFont=(compact?12:14)+'px Georgia, serif';
   if(places&&!chosen){
    ctx.font=titleFont;title=shorten(n.row[1],max);titleWidth=ctx.measureText(title).width;
   }
   const width=Math.max(nameWidth,titleWidth)+(chosen?16:8),height=title?34:chosen?23:17;
   const left=bound(pt.x-width/2,5,Math.max(5,w-width-5));
   const candidates=[[left,pt.y+r+(chosen?9:5)],[left,pt.y-r-height-6],[pt.x+r+7,pt.y-height/2],[pt.x-r-width-7,pt.y-height/2]];
   let chosenBox;
   for(const [x,y] of candidates){
    const z={x,y,width,height};
    if(x<3||x+width>w-3||y<3||y+height>h-3||occupied.some(v=>intersects(z,v)))continue;
    if(obstacles?.some(({n:other,p,r})=>other!==n&&(p.x-bound(p.x,x,x+width))**2+(p.y-bound(p.y,y,y+height))**2<r*r))continue;
    chosenBox=z;break;
   }
   if(!chosenBox&&chosen)chosenBox={x:left,y:bound(pt.y+fr+8,3,h-height-3),width,height};
   if(!chosenBox)continue;
   const {x,y}=chosenBox;
   if(chosen){
    ctx.fillStyle='#302d44';ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x,y,width,height,5);else ctx.rect(x,y,width,height);
    ctx.fill();ctx.fillStyle='#fff';ctx.font=authorFont;ctx.fillText(name,x+8,y+height/2);
   }else{
    const cy=y+(title?9:height/2);
    const labelX=places?x+width/2:x+4;
    ctx.textAlign=places?'center':'left';
    ctx.font=authorFont;ctx.lineJoin='round';ctx.lineWidth=2.5;ctx.strokeStyle='#fbfafc';ctx.strokeText(name,labelX,cy);
    ctx.fillStyle=active?'#332b49':places?'#413951':'#535366';ctx.fillText(name,labelX,cy);
    if(title){ctx.font=titleFont;ctx.strokeText(title,labelX,y+26);ctx.fillStyle='#596072';ctx.fillText(title,labelX,y+26);}
    ctx.textAlign='left';
   }
   occupied.push(chosenBox);written++;
  }
  if(transition){
   ctx.globalAlpha=1-transition.progress;ctx.drawImage(transition.ghost,0,0,w,h);ctx.globalAlpha=1;
  }
 }
 function hit(x,y){
  let best=null,bestD=Infinity;
  for(const n of inView()){const p=screen(n),d=Math.hypot(x-p.x,y-p.y),r=Math.max(5,dot(n)+2);if(d<=r&&d/(r+1)<bestD){best=n;bestD=d/(r+1);}}
  return best;
 }
 function hint(n,p){
  hover=n;tip.hidden=!n;canvas.style.cursor=n?'grab':'move';
  if(n){tip.textContent=n.row[1]+' · '+n.row[3];tip.style.left=bound(p.x+12,5,w-Math.min(w-10,260)-5)+'px';tip.style.top=bound(p.y+18,5,h-70)+'px';}
  tick();
 }
 function updateURL(replace=false){
  const anchor=focus.row[7].find(([b])=>b===brIndex),other=peer?.row[7].find(([b])=>b===brIndex);
  const changes={layout:'map',mapScope:scope,mapFocus:places?'1':null,node:anchor?.[1]||null,compare:anchor&&other?other[1]:null,mapPaper:focus.row[0],mapPeer:peer?.row[0]||null};
  const entry={...branchContext()};
  if(places)entry.mapWindow={paper:focus.row[0],before:pages.before,after:pages.after,capacity:lastCapacity};
  history[replace?'replaceState':'pushState'](entry,'',urlFor(changes)+'#core');
  const select=document.getElementById('reader-pick');if(select){select.value=anchor?.[1]||'';}
 }
 function select(n,{move=false,related=null,write=true,restore=null}={}){

  focus=n;near=new Set(n.adj.map(l=>l.other));near.delete(n.index);
  peer=related&&near.has(related.index)?related:null;
  sides=partitionNeighbors(n);tug=null;released=null;
  if(scope==='field'){
   if(!places)savedCamera={...camera};
   const memory=restore?.paper===n.row[0]?restore:null;
   pages={before:memory?.before||0,after:memory?.after||0};lastCapacity=memory?.capacity||0;
   nominalPlaces.clear();dragOffsets.clear();
   arrange({animate:true,reveal:peer});
  }else{
   neighbors=rankedLabels.filter(p=>near.has(p.index));visibleLinks=n.adj;
   if(move)locate(n);
  }
  hint(null,{x:0,y:0});if(write)updateURL();showDetail();syncView();tick();
 }
 function syncView(){
  box.dataset.mapView=places?'neighbors':'overview';box.dataset.visiblePapers=String(viewNodes.length);
  contextBar.hidden=!places;box.querySelector('.sky-gesture').hidden=!!places;
  const fitButton=box.querySelector('[data-camera="fit"]');
  const fitLabel=places?say('Fit the papers on this page','适配本页论文'):say('Fit all papers','显示全部论文');
  fitButton.title=fitLabel;fitButton.setAttribute?.('aria-label',fitLabel);fitButton.textContent=places?say('Fit','适配'):say('Fit','全图');
  if(!places)return;
  const total=sides.before.length+sides.after.length;
  contextBar.querySelector('span').textContent=focus.short+' ('+focus.row[3]+') · '+
   (total?say(neighbors.length+' of '+total+' directly related papers','显示 '+neighbors.length+' / '+total+' 篇直接关联论文'):say('No direct links in this view','当前范围内尚无已收录的直接关联'));
  for(const side of ['before','after']){
   const box=contextBar.querySelector('[data-side="'+side+'"]'),length=sides[side].length,start=pages[side]*lastCapacity;
   const name=side==='before'?say('Predecessors','前作'):say('Successors','后作');
   box.hidden=!length;
   const range=(start+1)+'–'+Math.min(start+lastCapacity,length)+' / '+length;
   box.querySelector('.sky-neighbor-range').textContent=name+' '+(length>lastCapacity?range:length);
   for(const step of [-1,1]){
    const button=box.querySelector('[data-step="'+step+'"]');
    button.hidden=length<=lastCapacity;
    button.disabled=step===-1?start===0:start+lastCapacity>=length;
   }
  }
 }
 function turnPage(side,step){
  if(!places||!sides[side]||![-1,1].includes(step))return;
  const destination=pages[side]+step;
  if(destination<0||destination>=Math.ceil(sides[side].length/lastCapacity))return;
  pages[side]=destination;hover=null;tip.hidden=true;tug=null;released=null;
  arrange({animate:true});
  if(peer&&!places.has(peer.index)){peer=null;showDetail();}
  syncView();updateURL(true);tick();
 }
 function leaveFocus(){
  if(!places)return;
  const animation=capture(viewNodes);places=null;viewNodes=nodes;neighbors=rankedLabels.filter(n=>near.has(n.index));
  visibleLinks=focus.adj;tug=null;setCamera(savedCamera);savedCamera=null;
  transition=animation;hint(null,{x:0,y:0});syncView();updateURL();canvas.focus({preventScroll:true});tick();
 }
 function choosePeer(n){
  if(!near.has(n.index))return;

  peer=n;
  if(places&&!places.has(n.index)){arrange({reveal:n});hint(null,{x:0,y:0});syncView();}
  updateURL();showDetail();tick();
 }
 function annotation(a,b){
  for(const [ai,aid] of a.row[7])for(const [bi,bid] of b.row[7]){
   if(ai===bi){const rel=byId.get(data.branches[ai][0])?.edges.find(e=>e.from===aid&&e.to===bid);if(rel)return [rel,data.branches[ai][0],aid,bid];}
   const rel=atlas.bridges?.find(e=>e.fromBranch===data.branches[ai][0]&&e.toBranch===data.branches[bi][0]&&e.from===aid&&e.to===bid);
   if(rel)return [rel,null,aid,bid];
  }
  return null;
 }
 function showDetail(){
  const row=focus.row,core=!!row[7].length;
  const memberships=row[7].map(([bi,id])=>[data.branches[bi][0],id]);
  const primary=memberships.find(([id])=>id===branch.id)||memberships[0];
  const annotated=primary&&byId.get(primary[0])?.papers.find(p=>p.id===primary[1]);
  const introduction=annotated?.note?'<p class="sky-paper-brief">'+enc(localized(annotated,'note'))+'</p>'+lineageDetails(memberships,primary[0]):'';
  box.querySelector('.sky-caption-title').textContent=row[1];
  setBranchTitle(branch,qstate(),row[1]);
  const m=row[5]==null?say('Citation count unavailable','暂无可核验的被引数'):say(row[5].toLocaleString()+' Crossref citations','Crossref 被引 '+row[5].toLocaleString()+' 次')+' · '+row[6];
  const tag=core?say('Annotated paper','精读论文'):say('Related paper','相关论文');
  const sections=[false,true].map(out=>{
   const list=sides[out?'after':'before'];
   if(!list.length)return '';
   const name=out?say('Successors','后作'):say('Predecessors','前作');
   const options=list.map(n=>'<option value="'+n.index+'"'+(peer===n?' selected':'')+'>'+enc(n.row[3]+' · '+n.row[1])+'</option>').join('');
   return '<label class="sky-related"><span>'+name+' <b>'+list.length+'</b></span><select data-neighbor-side="'+(out?'after':'before')+'" aria-label="'+name+'"><option value="">'+say('Choose a paper','选择论文')+'</option>'+options+'</select></label>';
  }).join('');
  let explanation='';
  if(peer){
   const kinds=new Map();
   for(const link of focus.adj)if(link.other===peer.index)kinds.set(link.out,(kinds.get(link.out)||0)|link.type);
   const descriptions=[...kinds].map(([out,type])=>{
    const a=out?focus:peer,b=out?peer:focus,info=(type&2)?annotation(a,b):null;
    const title=info?localized(info[0],'label'):(type&1)?say('Citation','引文关系'):say('Annotated connection','精读脉络');
    const note=info?localized(info[0],'note'):(type&1)?say(b.row[1]+' cites '+a.row[1]+'.','《'+b.row[1]+'》引用了《'+a.row[1]+'》。'):'';
    const compare=info&&info[1]?local({branch:info[1],node:info[2],compare:info[3],mapPaper:null,mapPeer:null,layout:null},say('Compare papers','对读论文')):'';
    const source=info?external(info[0].evidence,say('Relationship source','关系依据'),'lineage-source'):(type&1)?external(b.row[4],say('Read citing paper','阅读引用方原文'),'lineage-source',b.row[0]):'';
    return '<small>'+enc(a.short+' ('+a.row[3]+') → '+b.short+' ('+b.row[3]+')')+'</small><h5>'+enc(title)+'</h5>'+(note?'<p>'+enc(note)+'</p>':'')+'<div class="sky-relation-links">'+compare+source+'</div>';
   });
   explanation='<div class="sky-note">'+descriptions.join('')+' <button type="button" data-follow>'+say('Follow this paper','沿这篇继续')+'</button></div>';
  }
  detail.innerHTML='<article><small>'+tag+' · '+row[3]+'</small><h4 lang="en">'+enc(row[1])+'</h4><p>'+enc(row[2])+'</p>'+introduction+'<div>'+enc(m)+'</div>'+external(row[4],say('Read paper','阅读原文'),'',row[0])+(row[9]?' '+external(row[9],say('Journal page','期刊页面'),'',row[0]):'')+'</article><div class="sky-detail-right">'+sections+explanation+'</div>';
 }
 detail.onchange=e=>{
  if(!e.target.matches('select')||e.target.value==='')return;
  const side=e.target.dataset.neighborSide,refocus=document.activeElement===e.target;
  choosePeer(nodes[Number(e.target.value)]);
  if(refocus)detail.querySelector('[data-neighbor-side="'+side+'"]')?.focus({preventScroll:true});
 };
 detail.onclick=e=>{if(e.target.closest('[data-follow]')&&peer)select(peer,{move:true});};
 function find(){
  const words=fold(search.value.trim()).split(/\s+/).filter(Boolean);matches.hidden=!words.length;
  if(!words.length)return;
  const found=rankedLabels.filter(n=>words.every(q=>n.text.includes(q))).slice(0,12);
  matches.innerHTML=found.map(n=>'<button data-find="'+n.index+'" type="button"><b>'+enc(n.row[1])+'</b><small>'+enc(n.short+' · '+n.row[3])+'</small></button>').join('')||'<p>'+say('No matching paper','未找到匹配论文')+'</p>';
 }
 search.oninput=find;search.onkeydown=e=>{if(e.key==='Escape'&&!matches.hidden){e.preventDefault();matches.hidden=true;}if(e.key==='ArrowDown'){e.preventDefault();matches.querySelector('button')?.focus();}if(e.key==='Enter'&&!matches.hidden)matches.querySelector('button')?.click();};
 matches.onclick=e=>{const b=e.target.closest('[data-find]');if(b){select(nodes[Number(b.dataset.find)],{move:true});search.value='';matches.hidden=true;search.focus();}};
 matches.onkeydown=e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();(e.key==='ArrowDown'?e.target.nextElementSibling:e.target.previousElementSibling)?.focus();}if(e.key==='Escape'){e.preventDefault();matches.hidden=true;search.focus();}};
 box.querySelector('.sky-search').onfocusout=e=>{if(!e.currentTarget.contains(e.relatedTarget))matches.hidden=true;};
 contextBar.onclick=e=>{
  const button=e.target.closest('[data-step]');
  if(!button||button.disabled)return;
  const group=button.closest('[data-side]'),step=Number(button.dataset.step),refocus=document.activeElement===button;
  turnPage(group.dataset.side,step);
  if(refocus&&button.disabled)group.querySelector('[data-step="'+(-step)+'"]')?.focus({preventScroll:true});
 };
 back.onclick=leaveFocus;
 box.onkeydown=e=>{if(e.key==='Escape'&&places&&!e.defaultPrevented){e.preventDefault();leaveFocus();}};
 box.querySelector('.sky-compass').onclick=e=>{const a=e.target.closest('button')?.dataset.camera;if(a==='motion'){holdDrift=!reduced();mapPauseOverride=holdDrift;tug=null;released=null;resetClock();}else if(a==='fit')fit();else if(a==='locate')locate(focus);else if(a)zoom(camera.k*(a==='in'?1.4:1/1.4),{x:w/2,y:h/2});};
 const pts=new Map();
 const point=e=>{const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};};
 const pinchInfo=()=>{const [a,b]=pts.values();return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};};
 canvas.onpointerdown=e=>{
  if(e.button!==0||pts.size>=2)return;const p=point(e);pts.set(e.pointerId,p);canvas.setPointerCapture(e.pointerId);canvas.focus({preventScroll:true});tip.hidden=true;
  if(pts.size===2){pinch=pinchInfo();drag=null;return;}
  const n=hit(p.x,p.y),base=n?at(n):null,pos=n?screen(n):null;
  const offset=n?{x:pos.x-base.x*camera.k-camera.x,y:pos.y-base.y*camera.k-camera.y}:null;
  drag={id:e.pointerId,n,p,offset,ox:n?base.x:camera.x,oy:n?base.y:camera.y,moved:false};
 };
 canvas.onpointermove=e=>{
  const p=point(e);
  if(!pts.has(e.pointerId)){if(e.pointerType==='mouse')hint(hit(p.x,p.y),p);return;}
  pts.set(e.pointerId,p);
  if(pinch){const s=pinchInfo();camera.x+=s.x-pinch.x;camera.y+=s.y-pinch.y;zoom(camera.k*s.d/pinch.d,s);pinch=s;return;}
  if(!drag||drag.id!==e.pointerId)return;
  const dx=p.x-drag.p.x,dy=p.y-drag.p.y;
  if(!drag.moved&&Math.hypot(dx,dy)<4)return;
  drag.moved=true;hover=null;tip.hidden=true;canvas.style.cursor='grabbing';
  if(drag.n){
   const base=at(drag.n);base.x=drag.ox+dx/camera.k;base.y=drag.oy+dy/camera.k;freeCamera='';
   if(!reduced())tug={peers:new Set(drag.n.adj.map(l=>l.other)),x:bound(dx*.13,-16,16),y:bound(dy*.13,-16,16),time:now()};
  }else{camera.x=drag.ox+dx;camera.y=drag.oy+dy;}
  tick();
 };
 function finish(e,cancel){
  if(!pts.has(e.pointerId))return;
  if(!cancel&&drag?.id===e.pointerId&&!drag.moved&&drag.n){const previous=focus;select(drag.n,{related:near.has(drag.n.index)?previous:null});}
  if(drag?.n&&drag.moved)released={n:drag.n,offset:drag.offset,time:now()};
  pts.delete(e.pointerId);drag=null;pinch=null;canvas.style.cursor='grab';if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
 }
 canvas.onpointerup=e=>finish(e,false);canvas.onpointercancel=canvas.onlostpointercapture=e=>finish(e,true);
 canvas.onpointerleave=()=>{if(!pts.size)hint(null,{x:0,y:0});};
 const wheel=e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();zoom(camera.k*Math.exp(-e.deltaY*.01),point(e));}};
 canvas.addEventListener('wheel',wheel,{passive:false});
 canvas.onkeydown=e=>{
  const d={ArrowLeft:[45,0],ArrowRight:[-45,0],ArrowUp:[0,45],ArrowDown:[0,-45]}[e.key];
  if(d){e.preventDefault();if(e.shiftKey){const base=at(focus);base.x-=d[0]/camera.k;base.y-=d[1]/camera.k;freeCamera='';}else{camera.x+=d[0];camera.y+=d[1];}tick();}
  else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(camera.k*(e.key==='-'?.8:1.25),{x:w/2,y:h/2});}
  else if(e.key==='Home'){e.preventDefault();fit();}
 };
 showDetail();resize();syncView();resetClock();
 if(scope==='field'&&state.mapFocus==='1'&&byKey.has(state.mapPaper))select(focus,{related:peer,write:false,restore:history.state?.mapWindow});
 const observer=new ResizeObserver(resize);observer.observe(stage);
 const visibility=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(([entry])=>{
  onScreen=entry.isIntersecting;resetClock();
 }):null;
 visibility?.observe(stage);document.addEventListener?.('visibilitychange',resetClock);motion?.addEventListener?.('change',resetClock);
 return ()=>{
  disposed=true;observer.disconnect();visibility?.disconnect();cancelAnimationFrame(frame);
  document.removeEventListener?.('visibilitychange',resetClock);motion?.removeEventListener?.('change',resetClock);
  canvas.removeEventListener('wheel',wheel);box.onkeydown=null;
 };
}
