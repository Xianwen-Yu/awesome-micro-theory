'use strict';
const $=id=>document.getElementById(id);
const pages={papers:['近期论文','收录微观理论的期刊论文、作者公开的 R&R、美国求职市场论文、会议报告和工作论文。'],coverage:['来源与覆盖','查看每份目录的核验范围、已录记录和仍待补齐的部分。'],updates:['更新记录','核查每轮采集结果，区分来源变动、收录进度与访问失败。']};
const channels=['全部论文','期刊论文','公开 R&R','美国 JMP','会议','研讨会','工作论文'];
const statusNames={complete:'指定范围已核清',partial:'部分收录',listed:'已登记来源',blocked:'暂不可访问',unavailable:'暂不可访问',pending:'待核验'};
const journalKinds=['期刊记录','R&R','Reject & Resubmit','条件接收','待刊','在线发表','已发表'];
let catalog={papers:[],sources:[],checks:[]},sources=new Map(),works=[],frame={programs:[]},ready=false,currentTab='sources',coverPage=1,listPage=1,listWorkIds=[];
const compactLayout=window.matchMedia('(max-width: 760px)');
let compactFiltersOpen=false,desktopSourcesOpen=false;
function syncFilterPanel(){
 const compact=compactLayout.matches,focused=document.activeElement;
 const toggle=$('compact-filters'),panel=$('paper-filters'),sourceToggle=$('source-options'),fields=$('source-fields');
 const moveToToggle=compact&&!compactFiltersOpen&&panel.contains(focused);
 const moveToArea=!compact&&focused===toggle;
 const moveToSource=!compact&&!desktopSourcesOpen&&fields.contains(focused);
 toggle.hidden=!compact;
 toggle.setAttribute('aria-expanded',String(compactFiltersOpen));
 panel.hidden=compact&&!compactFiltersOpen;
 sourceToggle.hidden=compact;
 sourceToggle.setAttribute('aria-expanded',String(desktopSourcesOpen));
 fields.hidden=!compact&&!desktopSourcesOpen;
 if(moveToToggle)toggle.focus({preventScroll:true});
 else if(moveToSource)sourceToggle.focus({preventScroll:true});
 else if(moveToArea)$('area-filter').focus({preventScroll:true});
 else if(compact&&focused===sourceToggle)toggle.focus({preventScroll:true});
}
$('compact-filters').onclick=()=>{compactFiltersOpen=!compactFiltersOpen;syncFilterPanel()};
$('source-options').onclick=()=>{desktopSourcesOpen=!desktopSourcesOpen;syncFilterPanel()};
compactLayout.addEventListener('change',syncFilterPanel);
syncFilterPanel();
const params=()=>new URLSearchParams(location.search);
function setURL(changes,replace=false){const u=new URL(location.href);Object.entries(changes).forEach(([k,v])=>v?u.searchParams.set(k,v):u.searchParams.delete(k));if(u.href!==location.href)history[replace?'replaceState':'pushState'](changes.paper?{openedPaper:changes.paper}:{},'',u)}
function elem(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e}
function btn(text,handler,cls){const b=elem('button',text,cls);b.type='button';b.onclick=handler;return b}
function link(text,raw){const a=elem('a',text);try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer'}catch{a.removeAttribute('href')}return a}
function select(id,values,current,all){const s=$(id);s.replaceChildren(new Option(all,''));for(const [key,name] of values)s.add(new Option(name,key));s.value=Array.from(s.options).some(x=>x.value===current)?current:'';return s.value}
function norm(x){return (x||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')}
function people(x){return new Set((x||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().split(/[^\p{L}]+/u).filter(a=>a.length>2&&!['and','with','presenter','speaker','research'].includes(a)))}
function checked(p){return String(p.checked||p.firstSeen||p.observedAt||'').slice(0,10)}
function src(p){return sources.get(p.source)||{name:p.venue||p.source||'公开来源',group:''}}
function matchesChannel(p,c){const k=p.kind;if(c==='全部论文')return true;if(c==='期刊论文')return journalKinds.includes(k)&&!k.includes('R&R')&&k!=='Reject & Resubmit';if(c==='公开 R&R')return k==='R&R'||k==='Reject & Resubmit';if(c==='美国 JMP')return k==='JMP';if(c==='会议')return k.startsWith('会议');if(c==='研讨会')return k.includes('研讨会');return k==='工作论文'}
function venue(p){return p.venue||src(p).name}
function journalName(p){if(!(journalKinds.includes(p.kind)))return '';return (p.venue||src(p).name).split(' · ')[0].replace(/^The /i,'').replace(/’/g,"'")}
function jgroup(p){const s=src(p);if(['五大刊','理论领域刊','相邻领域刊'].includes(s.group))return s.group;const n=norm(p.venue);if(!n)return '';if(['americaneconomicreview','aer','econometrica','journalofpoliticaleconomy','jpe','qje','quarterlyjournalofeconomics','thequarterlyjournalofeconomics','reviewofeconomicstudies','thereviewofeconomicstudies','restud'].includes(n))return '五大刊';const found=catalog.sources.find(s=>['理论领域刊','相邻领域刊'].includes(s.group)&&(norm(s.name)===n||norm(s.name).includes(n)&&n.length>6));return found?.group||'其他刊物'}
function makeWorks(records){const byTitle=new Map(),result=[];for(const p of records){const key=norm(p.title),a=people(p.authors);if(!key)continue;const candidates=byTitle.get(key)||[];const group=candidates.find(w=>w.records.some(r=>r.id===p.id||[...a].some(s=>people(r.authors).has(s))));if(group){group.records.push(p)}else{const w={id:p.id,title:p.title,records:[p]};result.push(w);candidates.push(w);byTitle.set(key,candidates)}}return result}
function activeRR(p,w){return !journalKinds.slice(-3).some(kind=>w.records.some(r=>r.kind===kind))||!(p.kind==='R&R'||p.kind==='Reject & Resubmit')}
function keyDate(p){return /^\d{4}-\d{2}(-\d{2})?/.test(p.date||'')?p.date:''}
function dateStr(p){return [p.date,p.dateLabel].filter(Boolean).join(' · ')||'来源未注明日期'}
function paginate(node,page,total,limit,fn){node.replaceChildren();const n=Math.ceil(total/limit);if(n<2)return;const prev=btn('上一页',()=>fn(page-1)),next=btn('下一页',()=>fn(page+1));prev.disabled=page<=1;next.disabled=page>=n;node.append(prev,elem('span',page+' / '+n),next)}
let taxonomy={areas:[],words:{}};
const wordAliases={'r&r':'revise resubmit','jmp':'job market paper','contract':'contracting contracts','mechanism design':'mechanism-design','贝叶斯劝说':'贝叶斯说服','稳健合同':'稳健合约','模糊合同':'ambiguous contract','模糊合约':'ambiguous contract','稳健契约':'robust contract','信息设计':'information design','拍卖理论':'auction','理性疏忽':'理性忽视','博弈理论':'博弈论','机制设计理论':'机制设计','行为经济':'行为经济学','labour':'labor','behaviour':'behavior','organisation':'organization','模糊厌恶':'ambiguity aversion','契约':'合约','博弈网络':'博弈与网络'};
const normalizeSearch=s=>String(s||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑‒–—_]/g,'-');
const haystacks=new WeakMap();
function searchText(r){
 if(haystacks.has(r))return haystacks.get(r);
 const fields=(r.areas||[]).map(id=>taxonomy.areas.find(a=>a[0]===id)?.slice(1).join(' ')||'');
 const tokens=[r.title,r.authors,venue(r),src(r).name,r.kind,AppLang.t(r.kind,true),methodOf(r),AppLang.t(methodOf(r),true),...fields];
 for(const word of topicsOf(r))tokens.push(word,taxonomy.words[word]?.[0]||'');
 const text=normalizeSearch(tokens.join(' '));haystacks.set(r,text);return text;
}
function nearWord(a,b){
 if(a.length<5||Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,d=0;
 for(;i<a.length&&j<b.length;){if(a[i]===b[j]){i++;j++;continue}
  if(++d>1)return false;
  if(a.length===b.length){if(a[i]===b[j+1]&&a[i+1]===b[j]){i++;j++;}i++;j++;}
  else if(a.length>b.length)i++;else j++;
 }
 return d+a.length-i+b.length-j<=1;
}
function matchesSearch(records,query){
 const terms=normalizeSearch(query).trim().split(/\s+/).filter(Boolean).flatMap(term=>{
  if(!/[\u3400-\u9fff]/u.test(term))return [term];
  const canonical=wordAliases[term]||term;
  return normalizeSearch(taxonomy.words[canonical]?.[0]||canonical).split(/\s+/).filter(Boolean);
 });
 if(!terms.length)return true;
 const text=records.map(searchText).join(' ');
 return terms.every(t=>text.includes(t)||(wordAliases[t]&&text.includes(wordAliases[t]))||
  (/^[a-z]{5,}$/.test(t)&&text.split(/[^a-z]+/).some(w=>nearWord(t,w))));
}
const methodNames=['理论','实证','实验','计算','理论与实证','未判定'];
function topicsOf(record){
 return Array.isArray(record.topics)&&record.topics.length?record.topics:['主题待核'];
}
function methodOf(record){
 return methodNames.includes(record.method)?record.method:'未判定';
}
function shareView(target){
 const region=$(target),url=location.href;
 region.hidden=false;region.replaceChildren();
 const fallback=()=>{
  const label=elem('label','选择并复制当前链接'),input=elem('input');
  input.type='url';input.readOnly=true;input.value=url;label.append(input);region.replaceChildren(label);
  input.select();
 };
 if(!navigator.clipboard?.writeText){fallback();return}
 navigator.clipboard.writeText(url).then(()=>{region.textContent='链接已复制。'}).catch(fallback);
}
function tagControls(record){
 const bar=elem('div',null,'record-tags');bar.setAttribute('aria-label','论文主题与研究方法');
 const p=params();
 function control(text,key,value,style){
  const selected=p.get(key)===value;
  const b=btn(text,()=>{
   listPage=1;setURL({[key]:selected?'':value,paper:'',pn:''});render();
   const filter=$(key==='area'?'area-filter':'method-filter');
   (compactLayout.matches&&!compactFiltersOpen?$('compact-filters'):filter).focus({preventScroll:true});
   $('section-name').scrollIntoView({block:'nearest'});
  },style);
  b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',(key==='area'?'研究大类':'研究方法')+'筛选：'+text);
  return b;
 }
 for(const area of (record.areas||[])){const label=taxonomy.areas.find(v=>v[0]===area);if(label)bar.append(control(label[1],'area',area,'topic-chip'));}
 const method=methodOf(record),label=method==='未判定'?'方法待判':method;
 if(method!=='未判定')bar.append(control(label,'method',method,'method-chip'+(method==='未判定'?' unknown':'')));
 return bar;
}
function applyPapers(){
 const p=params(),channel=channels.includes(p.get('channel'))?p.get('channel'):channels[0],q=(p.get('q')||'').trim().toLowerCase();
 $('query').value=p.get('q')||'';$('section-name').textContent=channel;
 const ch=$('channels'),restoreChannelFocus=ch.contains(document.activeElement);
 ch.replaceChildren();
 for(const c of channels){
  const b=btn(c,()=>{
   listPage=1;setURL({channel:c===channels[0]?'':c,kind:'',source:'',jgroup:'',journal:'',paper:'',pn:''});render();
  });
  b.append(elem('b',works.filter(w=>w.records.some(r=>matchesChannel(r,c)&&activeRR(r,w))).length.toLocaleString()));
  b.setAttribute('aria-pressed',c===channel);ch.append(b);
 }
 if(restoreChannelFocus)ch.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
 const options=works.flatMap(w=>w.records.filter(r=>matchesChannel(r,channel)&&activeRR(r,w)));
 const kinds=[...new Set(options.map(r=>r.kind))].sort(),k=select('kind',kinds.map(t=>[t,t]),p.get('kind'),'全部状态');
 const jf=$('jgroup').closest('label');jf.hidden=!['全部论文','期刊论文','公开 R&R'].includes(channel);
 const jg=select('jgroup',['五大刊','理论领域刊','相邻领域刊','其他刊物'].map(a=>[a,a]),p.get('jgroup'),'全部刊组');
 const pool=options.filter(r=>(!k||r.kind===k)&&(!jg||jgroup(r)===jg));
 const ss=[...new Set(pool.flatMap(r=>[r.source,...(r.memberships||[])]))].map(id=>[id,sources.get(id)?.name||id]).sort((a,b)=>a[1].localeCompare(b[1]));
 const sourceId=select('source',ss,p.get('source'),'全部来源');
 const sort=['date','updated','title'].includes(p.get('sort'))?p.get('sort'):'date';$('sort').value=sort;
 const morePool=pool.filter(r=>!sourceId||r.source===sourceId||r.memberships?.includes(sourceId));
 const journals=[...new Set(morePool.map(journalName).filter(Boolean))].sort(),selectedJournal=select('venue-filter',journals.map(t=>[t,t]),p.get('journal'),'全部期刊');
 $('venue-filter').parentElement.hidden=!journals.length;if(selectedJournal||jg||sourceId)desktopSourcesOpen=true;
 const requested=p.get('topic')||'';
 const area=select('area-filter',taxonomy.areas.map(([id,zh])=>[id,zh]),p.get('area'),'全部大类');
 const selectedTopic=requested;
 if(selectedTopic&&!q)$('query').value=AppLang.language==='en'?(taxonomy.words[selectedTopic]?.[0]||selectedTopic):selectedTopic;
 const selectedMethod=select('method-filter',methodNames.map(t=>[t,t==='未判定'?'方法待判':t]),p.get('method'),'全部方法');
 const subset=[];
 for(const w of works){
  const events=w.records.filter(r=>activeRR(r,w)&&matchesChannel(r,channel)&&(!k||r.kind===k)&&(!jg||jgroup(r)===jg)&&(!sourceId||r.source===sourceId||r.memberships?.includes(sourceId))&&(!selectedJournal||journalName(r)===selectedJournal)&&(!area||r.areas?.includes(area))&&(!selectedTopic||topicsOf(r).includes(selectedTopic))&&(!selectedMethod||methodOf(r)===selectedMethod));
  if(!events.length)continue;
  const hit=!q||matchesSearch(events,q);
  if(!hit)continue;
  const extract=sort==='updated'?checked:keyDate;events.sort((a,b)=>extract(b).localeCompare(extract(a)));
  subset.push({w,rep:events[0],order:extract(events[0])});
 }
 subset.sort((a,b)=>(sort==='title'?0:b.order.localeCompare(a.order))||a.w.title.localeCompare(b.w.title,'en'));
 const total=subset.length;
 listWorkIds=subset.map(item=>item.w.id);
 listPage=Math.min(Math.max(1,parseInt(p.get('pn'),10)||1),Math.max(1,Math.ceil(total/20)));
 $('count').textContent=total.toLocaleString()+' 篇 · 同题同作者的多处记录合并展示';
 $('clear').hidden=!(channel!==channels[0]||q||k||sourceId||jg||selectedJournal||area||selectedTopic||selectedMethod||sort!=='date'||listPage!==1);
 const selectedCount=[channel!==channels[0],q,k,sourceId,jg,selectedJournal,area,selectedTopic,selectedMethod,sort!=='date'].filter(Boolean).length;
 $('filter-count').textContent=String(selectedCount);$('filter-count').hidden=selectedCount===0;
 const toggleName=AppLang.t('筛选与排序');
 $('compact-filters').setAttribute('aria-label',selectedCount?toggleName+' ('+AppLang.t('已选条件')+' '+selectedCount+')':toggleName);
 syncFilterPanel();
 const rows=$('results');rows.replaceChildren();
 for(const {w,rep} of subset.slice((listPage-1)*20,listPage*20)){
  const a=elem('article',null,'paper'),meta=elem('div',null,'eyeline');
  meta.append(elem('span',rep.kind,'pill'+(/R&R|Resubmit/.test(rep.kind)?' warm':'')),elem('span',venue(rep),'venue'));
  if(w.records.length>1)meta.append(elem('span',w.records.length+' 条记录'));
  if(rep.date)meta.append(elem('span',(keyDate(rep)>new Date().toISOString().slice(0,10)&&/会议|研讨会/.test(rep.kind)?'预定 ':'')+rep.date,'date'));
  const title=btn(w.title,()=>{

   const paperReturn={id:w.id,top:title.getBoundingClientRect().top,width:window.innerWidth,height:window.innerHeight};
   history.replaceState({...history.state,paperReturn},'',location.href);
   setURL({paper:w.id});openPaper(w);
  },'paper-title');
  title.dataset.work=w.id;
  const paperHeading=elem('h3');paperHeading.append(title);
  a.append(meta,paperHeading,elem('p',rep.authors||'来源未列作者','authors'),tagControls(rep));rows.append(a);
 }
 if(!total){
  const empty=elem('div',null,'empty');
  if(q){
   const target=new URL(AppLang.url(PagesSite.route('atlas')));
   target.searchParams.set('q',p.get('q').trim());
   const searchAtlas=elem('a','在文献地图中搜索','empty-atlas-link');
   searchAtlas.href=target.href;
   empty.append(elem('p','暂时没有找到符合这些条件的论文。'),searchAtlas);
  }else{
   empty.textContent='没有匹配的论文。可以清除筛选或换一个搜索词。';
  }
  rows.append(empty);
 }
 paginate($('pagination'),listPage,total,20,n=>{setURL({pn:n>1?String(n):''});applyPapers();$('section-name').focus({preventScroll:true});$('section-name').scrollIntoView({block:'start'})});
}
// Many records link to an author profile or a meeting program. Only mark a
// destination as a paper when the link identifies an individual work.
function isPaperDestination(record){
 let url;
 try{url=new URL(record.url)}catch{return false}
 const path=url.pathname;
 if(/10\.\d{4,9}\/[^/?#]+/i.test(path)||/^10\.\d{4,9}\//.test(url.searchParams.get('id')||''))return true;
 if(/(?:^|\.)arxiv\.org$/i.test(url.hostname)&&/^\/(abs|pdf|html)\//.test(path))return true;
 if(/(?:^|\.)ssrn\.com$/i.test(url.hostname)&&/^\d+$/.test(url.searchParams.get('abstract_id')||''))return true;
 if(/\/article\/view\/[\w-]+|\/science\/article\/pii\/[\w-]+/.test(path))return true;
 if(/(?:^|\.)nber\.org$/i.test(url.hostname)&&/^\/papers\/w\d+/.test(path))return true;
 if(/(?:^|\.)cepr\.org$/i.test(url.hostname)&&/\/publications\/dp\d+/i.test(path))return true;
 if(url.hostname==='cowles.yale.edu'&&/^\/research\/cfdp-\d+/.test(path))return true;
 if(!/\.pdf$/i.test(path)||/(?:^|[\W_])(?:cv|vitae|program(?:me)?|schedule|agenda|proceedings)(?:[\W_]|$)/i.test(path.split('/').pop()))return false;
 return !catalog.papers.some(other=>other.url===record.url&&norm(other.title)!==norm(record.title));
}
function openPaper(w){
 const d=$('detail');d.replaceChildren();
 const records=[...w.records].sort((a,b)=>keyDate(b).localeCompare(keyDate(a))),heading=elem('h2',w.title);
 heading.id='detail-title';heading.tabIndex=-1;d.append(heading,elem('p',w.records.find(a=>a.authors&&!a.presenter)?.authors||records[0].authors,'authors'),elem('h3','收录记录与主题依据'));
 for(const r of records){
  const ev=elem('article',null,'event'),top=elem('div',null,'event-head');
  top.append(elem('span',r.kind,'pill'),elem('span',venue(r)));ev.append(top,elem('p',dateStr(r)+(checked(r)?' ｜ 核验 '+checked(r):'')));
  if(r.decisionText)ev.append(elem('p',r.decisionText));if(r.presenter)ev.append(elem('p','报告人 · '+r.presenter));
  ev.append(tagControls(r));
  ev.append(elem('p','关键词 · '+topicsOf(r).map(t=>AppLang.language==='en'?(taxonomy.words[t]?.[0]||t):t).join(' · '),'detail-keywords'));
  ev.append(elem('p','研究方法 · '+methodOf(r)));
  const audit=elem('div',null,'label-audit'),basis=r.tagBasis||'尚无公开标注';
  audit.append(elem('span','标注依据 · '+basis));
  if(r.tagEvidence)audit.append(link('核对标注证据',r.tagEvidence));
  const links=elem('div',null,'event-links');
  const isPaper=isPaperDestination(r);
  if(r.evidence&&(r.evidence!==r.url||!isPaper))links.append(link('核对收录来源',r.evidence));
  if(r.url&&(r.url!==r.evidence||isPaper)){
   const itemLink=link('查看论文或条目',r.url);
   links.append(itemLink);
  }
  ev.append(audit,links);d.append(ev);
 }
 $('detail-share-feedback').hidden=true;const dialog=$('paper-dialog');dialog.dataset.work=w.id;if(!dialog.open){dialog.showModal();heading.focus();}
}

function applyCoverage(){const p=params();currentTab=['programs','authors'].includes(p.get('registry'))?p.get('registry'):'sources';const n=$('coverage-nav'),restoreTabFocus=n.contains(document.activeElement);n.replaceChildren();for(const [id,title] of [['sources','来源目录'],['programs','美国博士项目底册'],['authors','R&R 作者底册']]){const b=btn(title,()=>{coverPage=1;setURL({registry:id==='sources'?'':id,cs:'',cg:'',cq:''});render()});b.setAttribute('aria-pressed',currentTab===id);n.append(b)}
if(restoreTabFocus)n.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
const desc=$('coverage-description'),q=(p.get('cq')||'').toLowerCase();$('source-query').value=p.get('cq')||'';desc.replaceChildren();const isSources=currentTab==='sources';$('cov-group-field').hidden=!isSources;$('cov-state-field').hidden=!isSources;const groups=[...new Set(catalog.sources.map(s=>s.group))];const cg=select('cov-group',groups.map(x=>[x,x]),p.get('cg'),'全部类别');const cs=select('cov-state',Object.entries(statusNames),p.get('cs'),'全部进度');let data=[];
if(isSources){desc.append(elem('strong',catalog.sources.length+' 个登记来源'),elem('p','“指定范围已核清”仅适用于行内写明的期次、名单或网页截面。R&R 统计覆盖可找到的作者公开披露；未披露的决定没有可核对的总数。'));
data=catalog.sources.filter(s=>(!cg||s.group===cg)&&(!cs||cs===s.state)&&[s.name,s.group,s.note,s.scope,...[s.group,s.note,s.scope].map(v=>AppLang.t(v,true))].join(' ').toLowerCase().includes(q)).sort((a,b)=>a.group.localeCompare(b.group,'zh-CN')||a.name.localeCompare(b.name));}
else if(currentTab==='authors'){
 const authorPages=new Map(catalog.sources.filter(s=>s.group==='作者披露').map(s=>[norm(s.name),s]));
 const names=new Map(), items=catalog.papers.filter(r=>[r.source,...(r.memberships||[])].some(id=>id.startsWith('window-')&&sources.get(id)?.group==='五大刊'));
 for(const r of items){for(const name of r.authors.split(/\s*·\s*|,\s*(?:and\s+)?|\s+and\s+/i)){const n=name.trim();if(!n)continue;const key=norm(n);if(!names.has(key))names.set(key,{name:n,titles:new Set(),link:authorPages.get(key)});names.get(key).titles.add(r.title)}}
 const known=[...names.values()].filter(a=>a.link).length;desc.append(elem('strong',names.size+' 个作者姓名组 · '+known+' 个已关联披露来源'),elem('p','基于五大刊已逐条核验的刊期与待刊窗口，按署名生成发现清单。已关联表示能追到作者的公开披露页；未关联的作者仍待寻找。姓名同形或异拼有待消歧。其他已登记的作者可从“来源目录 → 作者披露”浏览。'));
 data=[...names.values()].filter(x=>x.name.toLowerCase().includes(q)).sort((a,b)=>Number(!!b.link)-Number(!!a.link)||a.name.localeCompare(b.name));
 }
 else{desc.append(elem('strong',frame.programs.length+' 个目录条目'),elem('p',frame.definition||''),link('AEA 博士项目目录',frame.url));data=frame.programs.filter(r=>[r.name,r.location,r.domain].join(' ').toLowerCase().includes(q))}
$('coverage-count').textContent=data.length+' 条匹配';const list=$('coverage-list');list.replaceChildren();coverPage=Math.min(coverPage,Math.max(1,Math.ceil(data.length/20)));
for(const s of data.slice((coverPage-1)*20,coverPage*20)){const article=elem('article',null,'registry-row'),h=elem('h3',s.name);article.append(h);if(isSources){h.append(elem('span',statusNames[s.state]||s.state,'pill'));article.append(elem('p',s.group+' · '+(s.scope||'范围待补')),elem('p',s.note));const recent=catalog.checks.find(x=>x.source===s.id);if(recent)article.append(elem('p','最近核查 '+String(recent.at||'').slice(0,10)+(recent.lane?' · '+(recent.note||''):''),'minor'));const ln=elem('div',null,'links');ln.append(link('原始来源',s.url));const count=catalog.papers.filter(r=>r.source===s.id||r.memberships?.includes(s.id)).length;if(count){const b=btn('浏览 '+count+' 条记录',()=>{listPage=1;setURL({page:'papers',source:s.id,kind:'',jgroup:'',journal:'',topic:'',area:'',method:'',channel:'',q:'',paper:'',pn:''});render();window.scrollTo(0,0)},'text-btn');ln.append(b)}article.append(ln)}else if(currentTab==='authors'){article.append(elem('p',[...s.titles].join(' · ')));if(s.link)article.append(link('作者公开来源',s.link.url));else article.append(elem('span','作者披露来源待关联','minor'))}else{article.append(elem('p',[s.location,s.domain].filter(Boolean).join(' · ')));const matches=catalog.sources.filter(r=>r.group==='JMP'&&r.programName&&norm(r.programName)===norm(s.name));if(matches.length){for(const r of matches)article.append(link(r.name+' · '+(statusNames[r.state]||r.state),r.url))}else{article.append(elem('span','尚未与当季来源逐项关联','minor'))}}list.append(article)}
if(!data.length)list.append(elem('div','未找到匹配的来源。','empty'));paginate($('cov-pagination'),coverPage,data.length,20,i=>{coverPage=i;applyCoverage();$('coverage-count').focus({preventScroll:true});$('coverage-count').scrollIntoView({block:'start'})})}
function applyUpdates(){const node=$('update-list');node.replaceChildren();const checks=[...(catalog.checks||[])].sort((a,b)=>String(b.at||b.checked||b.date||'').localeCompare(String(a.at||a.checked||a.date||'')));for(const x of checks.slice(0,100)){const row=elem('article',null,'entry'),body=elem('div'),s=sources.get(x.source||x.sourceId);row.append(elem('time',String(x.at||x.checked||x.date||x.checked_at||'').replace('T',' ').slice(0,16)),body);const status={ok:'已核验',success:'已核验',failed:'访问失败',blocked:'访问受限',deferred:'稍后重试',changed:'来源已变化',unchanged:'内容无变化',checked:'已核验',baseline:'首次检查',error:'访问失败',partial:'部分核验',complete:'已核清',listed:'已登记'}[x.status]||x.status||'';body.append(elem('b',x.title||[s?.name||x.source||'来源检查',status].filter(Boolean).join(' · ')),elem('p',x.note||x.message||x.summary||''));if(x.url)body.append(link('核对来源',x.url));node.append(row)}if(!checks.length)node.append(elem('p','暂未记录核验批次。'))}
function render(){if(!ready)return;$('share-feedback').hidden=true;const p=params(),page=Object.hasOwn(pages,p.get('page'))?p.get('page'):'papers';document.querySelectorAll('[data-page]').forEach(a=>{if(a.dataset.page===page)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});Object.keys(pages).forEach(k=>$(k+'-view').hidden=k!==page);$('heading').textContent=pages[page][0];$('intro').textContent=pages[page][1];document.title=pages[page][0]+' · Awesome Micro Theory';if(page==='papers')applyPapers();if(page==='coverage')applyCoverage();if(page==='updates')applyUpdates();const w=p.get('paper')&&works.find(w=>w.id===p.get('paper')||w.records.some(r=>r.id===p.get('paper')));if(w)openPaper(w);else if($('paper-dialog').open)$('paper-dialog').close()}
document.querySelectorAll('[data-page]').forEach(a=>a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;e.preventDefault();history.pushState({},'',AppLang.url(a.getAttribute('href')));coverPage=listPage=1;render();window.scrollTo(0,0)});
$('clear').onclick=()=>{history.pushState({},'',AppLang.url(PagesSite.route('papers')));listPage=1;render();(compactLayout.matches?$('compact-filters'):$('section-name')).focus({preventScroll:true})};for(const id of ['kind','jgroup','source','sort','venue-filter','area-filter','method-filter','cov-group','cov-state'])$(id).onchange=()=>{listPage=coverPage=1;const key={'venue-filter':'journal','area-filter':'area','method-filter':'method','cov-group':'cg','cov-state':'cs'}[id]||id;const change={[key]:$(id).value,pn:''};if(id==='jgroup'||id==='kind')change.source='';setURL(change);render()};
for(const [id,key] of [['query','q'],['source-query','cq']]){let timer;$(id).oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{listPage=coverPage=1;setURL({[key]:$(id).value,...(key==='q'?{topic:''}:{}),pn:''},true);render()},140)}}
$('share-list').onclick=()=>shareView('share-feedback');$('share-paper').onclick=()=>shareView('detail-share-feedback');
function restorePaperPosition(id,origin){
 const el=[...document.querySelectorAll('.paper-title')].find(button=>button.dataset.work===id);
 const target=el||$('section-name');
 target.focus({preventScroll:true});
 requestAnimationFrame(()=>{
  if(document.activeElement!==target)return;
  if(el&&origin?.id===id&&Number.isFinite(origin.top)){
   const rect=el.getBoundingClientRect();
   const sameViewport=origin.width===window.innerWidth&&origin.height===window.innerHeight;
   const top=sameViewport?origin.top:Math.max(0,Math.min(origin.top,window.innerHeight-rect.height));
   window.scrollBy({top:rect.top-top,behavior:'instant'});
  }else target.scrollIntoView({block:'nearest',behavior:'instant'});
 });
}
function dismiss(){
 const dialog=$('paper-dialog'),id=dialog.dataset.work;
 if(history.state?.openedPaper===params().get('paper')){
  if(!dialog.dataset.returnPending){dialog.dataset.returnPending='true';history.back()}
  return;
 }
 // A shared detail URL can be the first entry in a new tab.
 const index=listWorkIds.indexOf(id),page=index<0?listPage:Math.floor(index/20)+1;
 setURL({paper:'',pn:page>1?String(page):''},true);
 render();if(!$('papers-view').hidden)restorePaperPosition(id);
}
$('close-dialog').onclick=dismiss;$('paper-dialog').addEventListener('cancel',e=>{e.preventDefault();dismiss()});$('paper-dialog').onclick=e=>{if(e.target===$('paper-dialog')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dismiss()}};
window.onpopstate=event=>{
 const dialog=$('paper-dialog'),id=dialog.open?dialog.dataset.work:null;
 delete dialog.dataset.returnPending;
 listPage=coverPage=1;render();
 if(id&&!dialog.open&&!$('papers-view').hidden&&event.state?.paperReturn?.id===id)restorePaperPosition(id,event.state.paperReturn);
};
async function readJSON(name){const r=await fetch(PagesSite.base+'data/'+name+'.json');if(!r.ok)throw Error('HTTP '+r.status);return r.json()}
async function start(){try{[catalog,frame,taxonomy]=await Promise.all([readJSON('catalog'),readJSON('programs'),readJSON('taxonomy'),AppLang.ready]);AppLang.addWords(taxonomy);sources=new Map(catalog.sources.map(s=>[s.id,s]));works=makeWorks(catalog.papers);$('stamp').textContent=String(catalog.updated||catalog.asOf||'').slice(0,10)||'见记录';ready=true;render()}catch{$('notice').hidden=false;$('notice').textContent='索引暂时无法读取，请稍后刷新。'}}
start();
