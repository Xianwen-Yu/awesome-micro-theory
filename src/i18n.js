'use strict';
window.AppLang=(()=>{
 const read=()=>{try{return localStorage.getItem('awesome-micro-theory:'+PagesSite.base+':language')}catch{return null}};
 const explicit=new URL(location.href).searchParams.get('lang');
 const language=['zh','en'].includes(explicit)?explicit:(read()==='zh'?'zh':'en');
 const en=language==='en',dict=new Map();
 document.documentElement.lang=en?'en':'zh-CN';
 const cjk=/[\u3400-\u9fff]/;
 const add=entries=>Object.entries(entries||{}).forEach(([k,v])=>dict.set(k,v));
 function url(path){
  const u=new URL(path,location.href);
  if(u.origin===location.origin&&PagesSite.section(u)!==null)u.searchParams.set('lang',language);
  return u.href;
 }
 const patterns=[
  [/^([\d,]+) 篇 · 同题同作者的多处记录合并展示$/,(_,n)=>n+(n==='1'?' paper':' papers')+' · matching titles and authors grouped'],
  [/^([\d,]+) 个分支$/,(_,n)=>n+(n==='1'?' branch':' branches')],[/^([\d,]+) 个登记来源$/,'$1 registered source scopes'],
  [/^([\d,]+) 篇不同题名的论文$/,'$1 distinct paper titles'],
  [/^([\d,]+) 篇原始论文$/,'$1 original papers'],[/^([\d,]+) 条关系$/,'$1 connections'],
  [/^展开本分支全部 (\d+) 条关系$/,'Show all $1 connections'],
  [/^([\d,]+) 个作者姓名组$/,'$1 author names'],[/^([\d,]+) 个已关联披露来源$/,'$1 linked disclosure sources'],
  [/^([\d,]+) 个目录条目$/,'$1 directory entries'],[/^([\d,]+) 条匹配$/,'$1 matches'],
  [/^([\d,]+) 条记录$/,'$1 records'],[/^浏览 ([\d,]+) 条记录$/,'Browse $1 records'],
  [/^预定 (.+)$/,'Scheduled $1'],[/^最近核查 ([\d-]+)$/,'Last checked $1'],[/^核验 ([\d-]+)$/,'Checked $1'],
  [/^报告人[：:]\s*(.*)$/,'Presenter: $1'],[/^报告人$/,'Presenter'],
  [/^(.*)录用名单$/,'$1accepted papers'],[/^(\S+) 市场季$/,'$1 job market season'],
  [/^(.*?) 修订$/,'$1 revision'],[/^(.*?) 初稿$/,'$1 initial release'],[/^(.*?) 系列发布$/,'$1 series release'],
  [/^卷期 (.+)$/,'issue $1'],[/^卷期日期$/,'Issue date'],[/^首次发表$/,'First publication'],[/^页 (.+)$/,'pp. $1'],[/^第 (\d+) 卷$/,'vol. $1'],
  [/^(\d{4}) 年 (\d+) 月目录$/,'$1-$2 directory'],[/^(\d{4}) 年 (\d+) 月$/,'$1-$2'],
  [/^查看“(.+)”的近期论文 →$/,(_,v)=>'Recent papers on '+translate(v)],
  [/^研究大类筛选：(.+)$/,(_,v)=>'Filter by area: '+translate(v)],[/^研究方法筛选：(.+)$/,(_,v)=>'Filter by method: '+translate(v)],
  [/^未能完成本批核查。(.*)$/,'Batch check failed. $1'],[/^本次处理 (\d+) 项，本轮剩余 (\d+) 项。$/,'Processed $1 sources. $2 remain in this pass.']
 ];
 function translate(s){
  if(typeof s!=='string'||!cjk.test(s))return s;
  if(dict.has(s))return dict.get(s);
  const exact=s.trim();if(dict.has(exact))return s.replace(exact,dict.get(exact));
  for(const [rule,to] of patterns)if(rule.test(exact))return exact.replace(rule,to);
  if(exact.includes(' ｜ '))return exact.split(' ｜ ').map(translate).join(' | ');
  if(exact.includes(' · '))return exact.split(' · ').map(translate).join(' · ');
  return s;
 }
 function apply(root){
  if(!en||!root)return;
  function attrs(e){
   if(!e.getAttribute)return;
   for(const name of ['aria-label','placeholder','title','content']){
    const old=e.getAttribute(name);if(old&&cjk.test(old)){const next=translate(old);if(next!==old)e.setAttribute(name,next);}
   }
  }
  function text(n){
   if(n.parentElement?.closest('script,style,[data-language]'))return;
   const v=n.nodeValue;if(v&&cjk.test(v)){const next=translate(v);if(next!==v)n.nodeValue=next;}
  }
  if(root.nodeType===3){text(root);return;}
  attrs(root);const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  for(let n=w.nextNode();n;n=w.nextNode())n.nodeType===3?text(n):attrs(n);
 }
 for(const b of document.querySelectorAll('[data-lang]')){
  b.setAttribute('aria-pressed',String(b.dataset.lang===language));
  b.onclick=()=>{
   const chosen=b.dataset.lang;
   try{localStorage.setItem('awesome-micro-theory:'+PagesSite.base+':language',chosen)}catch{}
   if(language===chosen)return;
   const u=new URL(location.href);u.searchParams.set('lang',chosen);location.assign(u.href);
  };
 }
 document.addEventListener('click',e=>{
  const a=e.target.closest?.('a[href]');if(!a||a.namespaceURI!=='http://www.w3.org/1999/xhtml')return;
  const u=new URL(a.href,location.href);if(u.origin===location.origin&&PagesSite.section(u)!==null&&!a.getAttribute('href').startsWith('#'))a.href=url(u.href);
 },true);
 const ready=Promise.all(['/ui-en.json','/source-en.json'].map(async path=>{
  try{const r=await fetch(PagesSite.base+'assets'+path);if(r.ok)add(await r.json());}catch{}
 })).then(()=>{
  apply(document.documentElement);
  if(en)new MutationObserver(changes=>{
   for(const c of changes){
    if(c.type==='childList'){for(const n of c.addedNodes)apply(n);}
    else apply(c.target);
   }
  }).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
 });
 return {language,ready,url,t:(v,force=false)=>(en||force)?translate(v):v,add,
  addWords(data){for(const [cn,[english]] of Object.entries(data.words))dict.set(cn,english);
   for(const [,cn,english] of data.areas)dict.set(cn,english);}
 };
})();

document.addEventListener('keydown',event=>{
 if(!event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.defaultPrevented||event.isComposing)return;
 if(event.key!=='/'&&event.code!=='Slash')return;
 if(event.target.isContentEditable||event.target.closest?.('input,textarea,select')||document.querySelector('dialog[open]'))return;
 const search=document.querySelector('input[aria-keyshortcuts="Alt+/"]');
 if(search?.getClientRects().length){
  event.preventDefault();
  search.focus();
 }
});
