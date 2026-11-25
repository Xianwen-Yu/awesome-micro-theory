import {cp, mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {buildPagesData} from './build-pages-data.mjs';

const {values} = parseArgs({options:{base:{type:'string',default:'/'}}});
if(!/^\/(?:[a-zA-Z0-9._~-]+\/)*$/.test(values.base)||values.base.split('/').some(segment=>segment==='.'||segment==='..')){
 throw Error('Use --base / for an account site, or --base /repository-name/ for a project site.');
}
const base=values.base;
const root=fileURLToPath(new URL('../',import.meta.url)), src=path.join(root,'src'), data=path.join(root,'data');
const output=path.join(root,'_site'), stage=path.join(root,'_site-tmp-'+process.pid);
const sections=new Map([['','atlas'],['atlas','atlas'],['papers','index'],['guides','guides'],['about','about'],['privacy','privacy'],['help','help']]);
const datasets=['atlas','catalog','programs','taxonomy','lineage','influence','linked-counts'];
const assets=(await readdir(src)).filter(name=>/\.(?:js|css|svg|json)$/.test(name));
function localLink(value){
 if(value==='/')return base;
 const [,name,suffix]=value.match(/^\/([^?#]*)(.*)$/s);
 if(sections.has(name))return base+name+'/'+suffix;
 if(assets.includes(name))return base+'assets/'+name+suffix;
 if(name.startsWith('data/')&&datasets.some(key=>name==='data/'+key+'.json'))return base+name+suffix;
 throw Error('Unknown local URL in HTML: '+value);
}
const security="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
try{
 await mkdir(path.join(stage,'assets'),{recursive:true});
 await mkdir(path.join(stage,'data'),{recursive:true});
 await Promise.all(assets.map(name=>cp(path.join(src,name),path.join(stage,'assets',name))));
 const edition=createHash('sha256');
 for(const key of datasets){
  const file=key+'.json', bytes=await readFile(path.join(data,file));
  await writeFile(path.join(stage,'data',file),bytes);
  edition.update(bytes);
 }
 const revision=edition.digest('hex').slice(0,16);
 await buildPagesData(data,path.join(stage,'data'));
 for(const [section,template] of sections){
  const file=await readFile(path.join(src,template+'.html'),'utf8');
  const dataScript=['atlas','guides'].includes(template)?'<script defer src="/pages-data.js"></script>':'';
  const head='<meta http-equiv="Content-Security-Policy" content="'+security+'"><meta name="referrer" content="same-origin"><script defer src="/pages-site.js"></script>'+dataScript;
  const html=file.replace('<html ', '<html data-base="'+base+'" data-lineage="'+revision+'" data-map-edition="'+revision+'" ')
   .replace(/(<meta charset="utf-8">)/i,'$1'+head)
   .replace(/\b(href|src)="(\/(?!\/)[^"]*)"/g,(_,attr,url)=>attr+'="'+localLink(url)+'"');
  await mkdir(path.join(stage,section),{recursive:true});
  await writeFile(path.join(stage,section,'index.html'),html);
 }
 await writeFile(path.join(stage,'.nojekyll'),'');
 await rm(output,{recursive:true,force:true});
 await rename(stage,output);
 console.log('Built '+sections.size+' pages for '+base+' in '+output);
}finally{await rm(stage,{recursive:true,force:true});}
