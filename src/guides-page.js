'use strict';
(() => {
 const host=document.getElementById('reading-view');
 let branches,serial=0;
 function render(){
  document.title=(AppLang.language==='en'?'Reading Guides':'阅读指南')+' · Awesome Micro Theory';
  AtlasGuides.render(host,{branches,state:Object.fromEntries(new URLSearchParams(location.search)),english:AppLang.language==='en',urlFor});

 }
 async function load(){
  const request=++serial;
  try{
   const res=await PagesData.fetch('/api/atlas');
   if(!res.ok)throw Error();
   const data=await res.json();
   await AppLang.ready;if(request!==serial)return;
   if(!data.branches?.length)throw Error();
   branches=data.branches;render();
  }catch{
   const en=AppLang.language==='en',message=document.createElement('p'),retry=document.createElement('button');
   message.textContent=en?'The bibliography could not be loaded.':'暂时无法读取书目。';
   retry.type='button';retry.textContent=en?'Try again':'重新读取';retry.onclick=load;host.replaceChildren(message,retry);
  }
 }
 function restorePosition(){
  const state=history.state?.guideListPosition;
  if(!state)return;
  const entry=[...host.querySelectorAll('a[data-reading-id]')].find(a=>a.dataset.readingId===state.id);
  if(entry){entry.focus({preventScroll:true});window.scrollBy({top:entry.getBoundingClientRect().top-state.top,behavior:'instant'});}
 }
 host.addEventListener('click',e=>{
  if(!branches||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  const link=e.target.closest('a[data-nav]');if(!link)return;
  const next=new URL(link.href);if(next.origin!==location.origin||PagesSite.section(next)!=='guides')return;
  e.preventDefault();
  if(link.dataset.readingId)history.replaceState({...history.state,guideListPosition:{id:link.dataset.readingId,top:link.getBoundingClientRect().top}},'');
  history.pushState(null,'',next);render();host.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
 });
 window.addEventListener('popstate',()=>{if(branches){render();restorePosition();}});
 load();
})();
