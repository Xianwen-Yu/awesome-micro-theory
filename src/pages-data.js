'use strict';
(() => {
  const script = new URL(document.currentScript.src);
  const inferred = new URL(script.pathname.endsWith('/assets/pages-data.js') ? '../' : './', script);
  const base = new URL(document.documentElement.dataset.base || inferred.href, script);
  const directory = new URL('data/', base);
  const assets = new Map();
  const direct = new Map([
    ['/api/catalog', 'catalog'], ['/baseline.json','catalog'],
    ['/api/atlas','atlas'], ['/atlas-baseline.json','atlas'],
    ['/api/lineage/stats','lineage-stats'], ['/api/lineage/search','lineage-search']
  ]);
  const validBranch = /^[a-z\d]+(?:-[a-z\d]+)*$/;
  function error(status, message, head = false) {
    return new Response(head ? null : JSON.stringify({error:message}), {
      status, headers:{'Content-Type':'application/json; charset=utf-8', ...(status === 405 ? {Allow:'GET, HEAD'} : {})}
    });
  }

  // Native Blob-backed responses preserve text(), clone(), streams and headers.
  // The JSON view is memoized for callers sharing a page or work-detail shard.
  function parse(asset) {
    return asset.parsed ??= asset.blob.text().then(text => JSON.parse(text));
  }
  function assetResponse(asset) {
    const response = new Response(asset.blob,{headers:asset.headers});
    response.json = () => {
      if (response.bodyUsed || response.body.locked) return Promise.reject(new TypeError('Response body is already in use'));
      response.body.cancel().catch(() => {});
      return parse(asset);
    };
    return response;
  }
  function readAsset(name) {
    const key = new URL(name + '.json',directory).href;
    let loading = assets.get(key);
    if (loading) assets.delete(key);
    else {
      loading = window.fetch(key,{credentials:'omit',referrerPolicy:'no-referrer'}).then(async response => {
        if (!response.ok) throw response;
        return {headers:response.headers,blob:await response.blob()};
      }).catch(failure => {
        if (assets.get(key) === loading) assets.delete(key);
        throw failure;
      });
    }
    assets.set(key,loading);
    if (assets.size > 8) assets.delete(assets.keys().next().value);
    return loading;
  }

  async function dispatch(input, options) {
    const request = input instanceof Request ? input : null;
    const method = String(options.method || request?.method || 'GET').toUpperCase();
    const target = new URL(request?.url || String(input),base);
    if (target.origin !== base.origin || base.origin !== script.origin) return error(404,'Unknown route');
    if (method !== 'GET' && method !== 'HEAD') return error(405,'Method not allowed');
    const head = method === 'HEAD';
    let path = target.pathname;
    if (base.pathname !== '/' && path.startsWith(base.pathname)) path = '/' + path.slice(base.pathname.length);
    const branch = target.searchParams.get('branch');
    let name = direct.get(path);
    if (path === '/api/lineage') {
      if (branch && !validBranch.test(branch)) return error(404,'Unknown branch',head);
      name = branch ? 'branches/' + branch : 'lineage';
    } else if (path === '/api/lineage/work') {
      const id = target.searchParams.get('id') || '';
      if (!/^w[\da-f]{16}$/.test(id)) return error(404,'Unknown paper',head);
      const shard = await readAsset('works/' + id.slice(1,3)).then(parse);
      if (!Object.hasOwn(shard.items,id)) return error(404,'Unknown paper',head);
      if (head) return new Response(null,{headers:{'Content-Type':'application/json; charset=utf-8'}});
      const links = shard.items[id].map(([peer,direction,evidence]) => ({
        id:peer,...shard.books[peer][0],direction,evidence,count:shard.books[peer][1]
      }));
      return Response.json({id,...shard.books[id][0],links});
    } else if (path === '/api/atlas/network') {
      const scope = target.searchParams.get('scope') || 'field';
      if (!branch || !validBranch.test(branch) || !['branch','field','all'].includes(scope)) return error(400,'Unknown scope',head);
      const fields = await readAsset('network/index').then(parse);
      if (!Object.hasOwn(fields,branch)) return error(400,'Unknown scope',head);
      if (scope === 'all') name = 'network/all';
      else if (scope === 'field') name = 'network/field-' + fields[branch];
      else name = 'network/branch-' + branch;
    }
    if (!name) return error(404,'Unknown route',head);
    if (head) {
      const response = await window.fetch(new URL(name + '.json',directory),{method:'HEAD',credentials:'omit',referrerPolicy:'no-referrer'});
      return response.ok ? response : error(response.status,'Data unavailable',true);
    }
    return assetResponse(await readAsset(name));
  }
  function fetchPublic(input, options = {}) {
    const signal = options.signal || (input instanceof Request ? input.signal : null);
    if (signal?.aborted) return Promise.reject(signal.reason);
    const loading = dispatch(input,options).catch(failure => {
      if (failure instanceof Response) return error(failure.status,'Data unavailable',
        String(options.method || (input instanceof Request && input.method) || 'GET').toUpperCase() === 'HEAD');
      throw failure;
    });
    if (!signal) return loading;
    // Each consumer may cancel independently without interrupting a shared read.
    return new Promise((resolve,reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener('abort',abort,{once:true});
      loading.then(resolve,reject).finally(() => signal.removeEventListener('abort',abort));
    });
  }
  window.PagesData = Object.freeze({fetch:fetchPublic});
})();
