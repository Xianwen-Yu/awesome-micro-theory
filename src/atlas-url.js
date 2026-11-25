'use strict';
const urlFor=(updates,from=location.search)=>{
 const q=new URLSearchParams(from);if(updates.branch!==undefined&&q.get('branch')!==updates.branch){for(const k of ['node','find','facet','anchor','direction','cp','csort','work','compare','layout','year','mapScope','mapPaper','mapPeer','mapMin','mapFocus'])q.delete(k);}q.set('lang',AppLang.language);
 if(updates.view==='reading'){
  for(const name of ['branch','group','q','node','layout','find','year','compare','mapFocus','mapScope','mapPaper','mapMin','mapPeer','anchor','facet','direction','cp','csort','work'])q.delete(name);
 }else if(updates.view!==undefined||updates.branch){
  for(const name of ['view','guideType','guideQ','guideBranch','guideAccess','guideItem'])q.delete(name);
 }
 if(updates.layout!==undefined&&updates.layout!=='map'){q.delete('mapPaper');q.delete('mapPeer');q.delete('mapFocus');}
 if(updates.layout!==undefined&&updates.layout!=='timeline')q.delete('year');
 if(updates.node!==undefined&&updates.node!==q.get('node')){
  if(updates.compare===undefined)q.delete('compare');
  if(updates.mapPaper===undefined)for(const name of ['mapPaper','mapPeer','mapFocus','mapMin'])q.delete(name);
 }
 for(const [k,v] of Object.entries(updates))v?q.set(k,v):q.delete(k);
 const path=PagesSite.route(updates.view==='reading'?'guides':'atlas');q.delete('view');
 return path+(q.size?'?'+q.toString():'');
};
