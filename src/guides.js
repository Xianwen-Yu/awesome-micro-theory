'use strict';
window.AtlasGuides = (() => {
  const types = [
    ['textbook', '教材', 'Textbooks'],
    ['monograph', '专著', 'Monographs'],
    ['lecture', '讲义与讲演', 'Lectures and course notes'],
    ['survey', '综述', 'Surveys'],
    ['chapter', '章节', 'Chapters'],
    ['other', '其他读物', 'Other readings']
  ];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  const key = value => fold(value).replace(/[^\p{L}\p{N}]/gu, '');
  const option = (value, label, selected) =>
    '<option value="' + escape(value) + '"' + (selected ? ' selected' : '') + '>' + escape(label) + '</option>';
  const validUrl = value => {
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  };

  function readingId(resource) {
    const title = fold(resource.title);
    const slug = title.replace(/[^a-z0-9]+/g, '-').slice(0,48).replace(/^-|-$/g,'') || 'reading';
    const identity = [key(resource.title), key(resource.authors), resource.year || ''].join('|');
    let hash = 2166136261;
    for (const c of identity) hash = Math.imul(hash ^ c.codePointAt(0), 16777619);
    return slug + '-' + (hash >>> 0).toString(16).padStart(8,'0');
  }
  function categories(reading) {
    const label = reading.type + ' ' + reading.typeEn;
    const result = new Set();
    if (/教材|textbook/i.test(label)) result.add('textbook');
    if (/讲义|讲演|课程|lecture|course notes/i.test(label)) result.add('lecture');
    if (/综述|survey|review/i.test(label)) result.add('survey');
    if (/章节|手册章|chapter/i.test(label)) result.add('chapter');
    if (!result.has('chapter') && /专著|monograph/i.test(label)) result.add('monograph');
    if (!result.size) result.add('other');
    return result;
  }

  function catalog(branches, selections = window.AtlasGuideData || []) {
    const shelf = new Map(), byTitle = new Map(), branchById = new Map(branches.map(b => [b.id, b]));
    // These survey articles have distinct publisher and citation-record URLs.
    const paperByUrl = new Map([
      ['https://www.sciencedirect.com/science/article/pii/S0167268105001502', 'w71d8c7c046a66503'],
      ['https://www.aeaweb.org/articles?id=10.1257/jel.20181489', 'w3f4da1c663298429']
    ]);
    for (const branch of branches) for (const paper of branch.papers || []) {
      if (paper.url) paperByUrl.set(paper.url, paper.id);
      if (paper.publishedUrl) paperByUrl.set(paper.publishedUrl, paper.id);
    }
    function register(resource, branchIds) {
      if (!resource.title || !validUrl(resource.url)) return;
      const id = [key(resource.title), key(resource.authors), String(resource.year || '')].join('|');
      let entry = shelf.get(id);
      if (!entry) {
        entry = {...resource, id: readingId(resource), url: validUrl(resource.url), branches: new Map(), categories: categories(resource)};
        shelf.set(id, entry);
        const title = key(resource.title);
        if (!byTitle.has(title)) byTitle.set(title, []);
        byTitle.get(title).push(entry);
      }
      for (const id of branchIds) if (branchById.has(id)) entry.branches.set(id, branchById.get(id));
      return entry;
    }
    for (const branch of branches) for (const resource of branch.resources || []) register(resource, [branch.id]);
    for (const [rank, selection] of selections.entries()) {
      const url = validUrl(selection.url);
      if (!url || !selection.title || !selection.access || !selection.accessEn || !selection.note || !selection.noteEn) continue;
      const matches = byTitle.get(key(selection.matchTitle || selection.title)) || [];
      let entry = matches.find(row => String(row.year) === String(selection.year));
      if (!entry) entry = register({...selection, url: validUrl(selection.landingUrl) || url}, selection.branchIds || []);
      if (!entry) continue;
      for (const id of selection.branchIds || []) if (branchById.has(id)) entry.branches.set(id, branchById.get(id));
      if (selection.type && selection.typeEn) {
        entry.type = selection.type; entry.typeEn = selection.typeEn; entry.categories = categories(selection);
      }
      entry.open = {...selection, url, rank};
    }
    return [...shelf.values()].map(entry => {
      const branches = [...entry.branches.values()];
      const typeWords = types.filter(([id]) => entry.categories.has(id)).flat().join(' ');
      const fields = [entry.title, entry.authors, entry.year, entry.type, entry.typeEn, typeWords,
        entry.open?.note, entry.open?.noteEn, ...branches.flatMap(b => [b.name, b.en, b.group, b.question, b.questionEn])];
      const journalSurvey = entry.categories.size === 1 && entry.categories.has('survey');
      const sourcePaperId = journalSurvey ? paperByUrl.get(entry.url) : undefined;
      const paperId = sourcePaperId || (journalSurvey ? paperByUrl.get(entry.open?.url) : undefined);
      return {...entry, branches, paperId, sourcePaperId, search: fold(fields.join(' '))};
    });
  }

  const shelves = [
    {id:'surveys', zh:'综述与章节', en:'Surveys and chapters'},
    {id:'books', zh:'教材与专著', en:'Textbooks and monographs'},
    {id:'lectures', zh:'讲义与讲演', en:'Lectures and course notes'},
    {id:'other', zh:'其他读物', en:'Other readings'}
  ];
  function shelfFor(item) {
    if (item.categories.has('lecture')) return 'lectures';
    if (item.categories.has('textbook') || item.categories.has('monograph')) return 'books';
    if (item.categories.has('survey') || item.categories.has('chapter')) return 'surveys';
    return 'other';
  }
  const sessions = new WeakMap();
  let nextItemReturn;
  function validListLocation(value) {
    if (!value) return null;
    try {
      const url = new URL(value, location.origin);
      const path = PagesSite.section(url);
      if (url.origin === location.origin && (path === 'guides' || (path === 'atlas' && url.searchParams.get('view') === 'reading'))
        && !url.searchParams.get('guideItem')) return url;
    } catch {}
    return null;
  }
  function render(host, {branches, state = {}, english = false, urlFor}) {
    if (!host) return;
    sessions.get(host)?.abort();
    const events = new AbortController();
    sessions.set(host, events);
    const listen = (target, name, callback) => target.addEventListener(name, callback, {signal: events.signal});
    const say = (zh, en) => english ? en : zh;
    const entries = catalog(branches);
    const byBranch = new Map(branches.map(b => [b.id, b]));
    const localizedBranch = branch => english ? branch.en || branch.name : branch.name || branch.en;
    const collate = new Intl.Collator(english ? 'en' : 'zh-Hans', {sensitivity: 'base', numeric: true});
    const sortedBranches = [...branches].sort((a, b) => collate.compare(localizedBranch(a), localizedBranch(b)));
    const localLink = (href, label, className = '') => '<a data-nav class="' + className + '" href="' + escape(href) + '">' + escape(label) + '</a>';
    const ext = (url, text, className = '', paperId) => '<a class="' + className + '" href="' + escape(url) + '" target="_blank" rel="noopener noreferrer"'
      + '>'
      + escape(text) + '<span class="rg-external" aria-hidden="true">↗</span></a>';
    const branchUrl = id => urlFor({view:null, guideQ:null, guideType:null, guideBranch:null, guideAccess:null, guideItem:null,
      branch:id, layout:'map', node:null, group:null, q:null});
    const branchLinks = item => item.branches.map(b => {
      const question = (english ? b.questionEn : b.question) || '';
      return '<li><a class="rg-question" data-nav href="'+escape(branchUrl(b.id))+'"><strong>'+escape(localizedBranch(b))+'</strong>'
        +(question ? '<span>'+escape(question)+'</span>' : '')+'</a></li>';
    }).join('');
    const authorName = value => english ? String(value || '').replace(/（编）/g, ' (eds.)') : value;
    const rawType = item => (english ? item.typeEn || item.type : item.type || item.typeEn) || '';
    const accessText = item => english ? item.open.accessEn : item.open.access;
    const openCount = entries.filter(e => e.open && !e.open.requiresRegistration).length;
    const filter = {guideQ: state.guideQ || '', guideType: state.guideType || '', guideBranch: state.guideBranch || '',
      guideAccess: state.guideAccess === 'open' ? 'open' : ''};
    const frontMatter = url => /(?:^|\/)frontmatter(?:\/|[_-])|[_-]frontmatter\.pdf(?:$|[?#])/i.test(url);
    const sourceLabel = url => frontMatter(url) ? say('出版社书前页', 'Publisher front matter') : say('书目来源', 'Bibliographic source');
    const share = label => '<div class="rg-share"><button type="button" class="rg-share-button">' + label
      + '</button><span class="rg-share-status" role="status"></span><input type="url" readonly hidden aria-label="'
      + say('可复制的链接', 'Link to copy') + '"></div>';
    function bindShare(link) {
      const status = host.querySelector('.rg-share-status'), fallback = host.querySelector('.rg-share input');
      listen(host.querySelector('.rg-share-button'),'click',async () => {
        const url = new URL(link(),location.href).href;
        try {
          if (!navigator.clipboard?.writeText) throw Error();
          await navigator.clipboard.writeText(url); status.textContent=say('链接已复制', 'Link copied');
        } catch {
          fallback.value=url; fallback.hidden=false; fallback.focus(); fallback.select();
          status.textContent=say('请复制选中的链接', 'Copy the selected link');
        }
      });
    }
    const branchReturn = () => {
      const branch = byBranch.get(filter.guideBranch);
      return branch ? localLink(branchUrl(branch.id),say('返回分支 · ', 'Return to branch · ') + localizedBranch(branch), 'rg-back-branch') : '';
    };
    const canonicalItem = id => urlFor({view:'reading',guideItem:id,guideQ:null,guideType:null,guideBranch:null,guideAccess:null});
    const viewItem = id => urlFor({view:'reading', ...filter, guideItem:id});
    const listUrl = () => urlFor({view:'reading', ...filter, guideItem:null});
    if (state.guideItem) {
      const item=entries.find(e => e.id===state.guideItem);
      if (nextItemReturn?.id === state.guideItem) {
        history.replaceState({...history.state,readingReturn:nextItemReturn.url},'');
        nextItemReturn=null;
      }
      const previous=validListLocation(history.state?.readingReturn);
      if (previous && !filter.guideBranch) filter.guideBranch=previous.searchParams.get('guideBranch') || '';
      const back=localLink(previous?.href || listUrl(),say('返回书目列表','Back to the bibliography'),'rg-back-list');
      if (!item) {
        host.innerHTML='<div class="rg-page"><div class="rg-context-links">'+back+branchReturn()+'</div><h1>'
          +say('未找到这项书目','Reading not found')+'</h1><p>'+say('可以返回书目列表，按题名或作者查找。','Return to the bibliography to search by title or author.')+'</p></div>';
        return;
      }
      document.title=item.title+' · '+say('阅读指南','Reading Guides')+' · Awesome Micro Theory';
      const access = item.open ? accessText(item) : frontMatter(item.url) ? say('仅书前页','Front matter only')
        : /\.pdf(?:$|[?#])/i.test(item.url) ? say('PDF 文档', 'PDF document') : say('出版或来源页面', 'Publication or source page');
      host.innerHTML='<article class="rg-page rg-item"><div class="rg-context-links">'+back+branchReturn()+'</div>'
        +'<header class="rg-head"><div><p class="rg-kind">'+escape(rawType(item))+'</p><h1>'+escape(item.title)+'</h1>'
        +'<p class="rg-by">'+escape(authorName(item.authors))+(item.year?' · '+escape(item.year):'')+'</p></div>'
        +share(say('复制此书目链接','Copy link to this reading'))+'</header>'
        +(item.open?'<p class="rg-item-note">'+escape(english?item.open.noteEn:item.open.note)+'</p>':'')
        +'<div class="rg-item-access">'+ext(item.open?.url||item.url,access,'rg-primary',item.paperId)
        +(item.open && item.open.url!==item.url?ext(item.url,sourceLabel(item.url),'',item.sourcePaperId):'')+'</div>'
        +'<section class="rg-item-branches"><h2>'+say('相关研究问题','Related research questions')+'</h2>'
        +'<ul>'+branchLinks(item)+'</ul></section></article>';
      if (previous) listen(host.querySelector('.rg-back-list'),'click',event => {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); event.stopPropagation(); history.back();
      });
      bindShare(() => canonicalItem(item.id));
      return;
    }
    const allText = say('全部类型', 'All types');
    const allBranches = say('所有分支', 'All branches');

    const oddType = filter.guideType && !types.some(([id]) => id === filter.guideType);
    const oddBranch = filter.guideBranch && !byBranch.has(filter.guideBranch);
    const typeLabel = say('资料类型', 'Resource type');
    const branchLabel = say('研究分支', 'Research branch');
    const controls = '<form class="rg-filters" role="search" aria-label="' + say('查找阅读资料', 'Find reading material') + '">'
      + '<label class="rg-query-label"><span>' + say('搜索书目', 'Search the bibliography') + '</span><input class="rg-query" type="search" aria-keyshortcuts="Alt+/"'
      + ' value="' + escape(filter.guideQ) + '" placeholder="' + say('题名、作者或研究问题', 'Title, author or research topic') + '"></label>'
      + '<label><span>' + typeLabel + '</span><select class="rg-type">' + option('', allText, !filter.guideType)
      + (oddType ? option(filter.guideType, say('未识别的类型', 'Unknown type'), true) : '')
      + types.map(([id,zh,en]) => option(id,say(zh,en),filter.guideType===id)).join('') + '</select></label>'
      + '<label><span>' + branchLabel + '</span><select class="rg-branch-select">' + option('',allBranches,!filter.guideBranch)
      + (oddBranch ? option(filter.guideBranch,say('未识别的分支','Unknown branch'),true) : '')
      + sortedBranches.map(b => option(b.id,localizedBranch(b),b.id===filter.guideBranch)).join('') + '</select></label>'
      + '<div class="rg-filter-foot"><label class="rg-check"><input class="rg-open-check" type="checkbox"'
      + (filter.guideAccess ? ' checked' : '') + '> ' + say('仅限免费、无需注册的读物', 'Free to read without registration') + ' (' + openCount + ')</label>'
      + '<button type="button" class="rg-reset">' + say('清除筛选', 'Clear filters') + '</button></div></form>';

    host.innerHTML = '<div class="rg-page"><header class="rg-head"><div><h1>' + say('阅读指南', 'Reading Guides')
      + '</h1><p>' + say('按研究问题查找微观理论的教材、讲义和综述。', 'Find textbooks, lecture notes and surveys by research question.') + '</p></div>'
      + share(say('复制本页链接', 'Copy page link')) + '</header>' + controls
      + '<div class="rg-branch-return"></div><section class="rg-library" aria-labelledby="rg-library-title">'
      + '<div class="rg-linehead"><h2 id="rg-library-title"></h2><p class="rg-count" role="status" aria-atomic="true"></p></div>'
      + '<div class="rg-results"></div><p class="rg-empty" hidden></p></section></div>';
    const find = name => host.querySelector('.rg-' + name);
    const count = find('count'), results = find('results'), empty = find('empty');
    const textBox = find('query'), typeBox = find('type'), branchBox = find('branch-select'), openBox = find('open-check');
    const reset = find('reset'), shareStatus = find('share-status'), shareFallback = find('share').querySelector('input');
    const hasFilters = () => Object.values(filter).some(Boolean);
    const pageSize = 8;
    let matched = [], groups = new Map();
    const remembered = history.state?.guideBrowse || {};
    let activeShelf = remembered.shelf || '';
    let visibleCount = Number.isSafeInteger(remembered.limit) ? Math.max(pageSize, remembered.limit) : pageSize;
    const remember = () => history.replaceState({...history.state, guideBrowse:{shelf:activeShelf, limit:visibleCount}}, '');
    function row(item) {
      const primary = item.open?.url || item.url;
      const label = item.open ? accessText(item) : frontMatter(primary) ? say('仅书前页', 'Front matter only')
        : /\.pdf(?:$|[?#])/i.test(primary) ? say('PDF 文档', 'PDF document') : sourceLabel(primary);
      const detail = '<a class="rg-permalink" data-nav data-reading-id="'+escape(item.id)+'" href="'+escape(viewItem(item.id))+'" aria-label="'
        +escape(say('书目信息 · ', 'Reading details · ')+item.title)+'">'+say('书目信息', 'Details')+'</a>';
      return '<li class="rg-row"><div class="rg-row-main"><h3>'+ext(primary,item.title,'',item.paperId)+'</h3>'
        +'<p class="rg-by">'+escape([authorName(item.authors),item.year,rawType(item)].filter(Boolean).join(' · '))+'</p></div>'
        +'<div class="rg-row-links"><span class="rg-row-access">'+escape(label)+'</span>'+detail+'</div></li>';
    }
    function listHtml(items) {
      return '<ul class="rg-list">'+items.slice(0,visibleCount).map(row).join('')+'</ul>'
        +(items.length>visibleCount ? '<button class="rg-more" type="button">'+say('再显示 ','Show ')+Math.min(pageSize,items.length-visibleCount)
          +say(' 项',' more')+' <span>('+visibleCount+'/'+items.length+')</span></button>' : '');
    }
    function populate(panel,items) {
      panel.querySelector('.rg-shelf-content').innerHTML=listHtml(items);
    }
    function setShelf(id, persist=true) {
      activeShelf=id;
      for (const shelf of results.querySelectorAll('.rg-shelf')) {
        const open=shelf.dataset.shelf===activeShelf, button=shelf.querySelector('.rg-shelf-toggle');
        const panel=shelf.querySelector('.rg-shelf-panel');
        button.setAttribute('aria-expanded', String(open));
        panel.inert=!open;
        if (open) populate(panel,groups.get(activeShelf));
      }
      if (persist) remember();
    }
    function showResults() {
      const terms = fold(filter.guideQ).trim().split(/\s+/).filter(Boolean);
      matched = entries.filter(e => (!filter.guideType || e.categories.has(filter.guideType))
        && (!filter.guideBranch || e.branches.some(b => b.id === filter.guideBranch))
        && (!filter.guideAccess || (e.open && !e.open.requiresRegistration)) && terms.every(t => e.search.includes(t)));
      matched.sort((a,b) => collate.compare(a.title,b.title) || a.year-b.year);
      const filtered=hasFilters();
      count.textContent = filtered ? say('匹配 '+matched.length+' / '+entries.length+' 项',matched.length+' of '+entries.length+' readings')
        : say(entries.length+' 项书目',entries.length+' readings');
      host.querySelector('#rg-library-title').textContent=filtered?say('筛选结果','Results'):say('按类型浏览','Browse by type');
      find('branch-return').innerHTML=branchReturn();
      empty.hidden=!!matched.length;
      if (!matched.length) {
        empty.textContent = filter.guideBranch && !entries.some(e => e.branches.some(b => b.id === filter.guideBranch))
          ? say('这个分支还没有关联读物。清除筛选可浏览所有书目。', 'This branch has no linked readings yet. Clear the filters to browse the bibliography.')
          : say('没有找到匹配的读物。可以缩短搜索词，或清除筛选重新查找。', 'No readings match. Try a shorter search or clear the filters.');
      }
      if (filtered) {
        results.innerHTML=matched.length?listHtml(matched):'';
      } else {
        groups=new Map(shelves.map(s=>[s.id,[]]));
        for (const item of matched) groups.get(shelfFor(item)).push(item);
        for (const items of groups.values()) items.sort((a,b)=>{
          const rank=x=>x.open&&!x.open.requiresRegistration ? x.open.rank : Infinity;
          return rank(a)-rank(b) || collate.compare(a.title,b.title);
        });
        results.innerHTML=shelves.filter(s=>groups.get(s.id).length).map(s=>{
          const items=groups.get(s.id),open=activeShelf===s.id;
          return '<section class="rg-shelf" data-shelf="'+s.id+'"><h3><button type="button" id="rg-toggle-'+s.id
            +'" class="rg-shelf-toggle" aria-expanded="'+open+'" aria-controls="rg-panel-'+s.id+'"><span class="rg-shelf-name">'+escape(say(s.zh,s.en))
            +'<small aria-hidden="true" lang="en">'+escape(items[0].title)+'</small></span><span class="rg-shelf-count">'+items.length+'</span></button></h3><div id="rg-panel-'+s.id
            +'" class="rg-shelf-panel" aria-labelledby="rg-toggle-'+s.id+'" role="region"'+(open?'':' inert')
            +'><div class="rg-shelf-clip"><div class="rg-shelf-content">'+(open?listHtml(items):'')+'</div></div></div></section>';
        }).join('');
      }
      reset.disabled=!filtered;
      shareStatus.textContent='';
      shareFallback.hidden=true;
    }
    listen(results,'click',event=>{
      const button=event.target.closest('button');
      if (!button) return;
      if (button.classList.contains('rg-shelf-toggle')) {
        const id=button.closest('.rg-shelf').dataset.shelf;
        visibleCount=pageSize;
        setShelf(activeShelf===id?'':id);
      } else if (button.classList.contains('rg-more')) {
        const previousLimit=visibleCount;
        visibleCount+=pageSize;
        const content=button.closest('.rg-shelf-content')||results;
        content.innerHTML=listHtml(hasFilters()?matched:groups.get(activeShelf));
        remember();
        // Move keyboard focus to the first newly revealed title.
        content.querySelectorAll('.rg-row h3 a')[previousLimit]?.focus();
      }
    });
    let typing = false;
    function setFilter(changes, mode = 'pushState') {
      Object.assign(filter,changes);
      activeShelf=''; visibleCount=pageSize;
      const next = urlFor({view:'reading', guideItem:null, guideQ:filter.guideQ || null, guideType:filter.guideType || null,
        guideBranch:filter.guideBranch || null, guideAccess:filter.guideAccess || null});
      const url = new URL(next,location.href);
      if (url.href !== location.href) history[mode]({...history.state,guideBrowse:{shelf:'',limit:visibleCount}},'',url);
      showResults();
    }
    function search() {
      if (textBox.value === filter.guideQ) return;
      setFilter({guideQ:textBox.value},typing ? 'replaceState' : 'pushState');
      typing = true;
    }
    listen(textBox,'input',event => {if (!event.isComposing) search();});
    listen(textBox,'compositionend',search);
    listen(textBox,'blur',() => {typing = false;});
    listen(find('filters'),'submit',event => {event.preventDefault();search();typing = false;});
    listen(typeBox,'change',() => setFilter({guideType:typeBox.value}));
    listen(branchBox,'change',() => setFilter({guideBranch:branchBox.value}));
    listen(openBox,'change',() => setFilter({guideAccess:openBox.checked ? 'open' : ''}));
    listen(reset,'click',() => {
      textBox.value=''; typeBox.value=''; branchBox.value=''; openBox.checked=false; typing=false;
      setFilter({guideQ:'',guideType:'',guideBranch:'',guideAccess:''});textBox.focus();
    });
    listen(results,'click',event => {
      const link=event.target.closest?.('.rg-permalink');
      if (link && !event.button && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        nextItemReturn={id:link.dataset.readingId,url:location.href};
      }
    });
    bindShare(() => location.href);
    showResults();
  }
  return {render, catalog};
})();
