import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {buildGraph, subgraph} from './pages-graph.mjs';

export async function buildPagesData(dataDir, outputDir) {
  const read = async name => JSON.parse(await readFile(join(dataDir, name + '.json'), 'utf8'));
  const [atlas, lineage, metrics, linked] = await Promise.all(['atlas','lineage','influence','linked-counts'].map(read));
  await Promise.all(['branches','network','works'].map(name => mkdir(join(outputDir,name),{recursive:true})));
  const write = (path, value) => writeFile(join(outputDir,path + '.json'), JSON.stringify(value));
  const memberships = new Map(), neighbors = new Map();
  function addNeighbor(from, to, direction, evidence) {
    if (!neighbors.has(from)) neighbors.set(from, []);
    neighbors.get(from).push([to, direction, evidence]);
  }
  for (const [citing, groups] of Object.entries(lineage.betweenWorks)) {
    for (const [evidence, targets] of groups) {
      for (const cited of targets) {
        addNeighbor(citing, cited, 'references', evidence);
        addNeighbor(cited, citing, 'cited-by', evidence);
      }
    }
  }
  for (const [id, rows] of Object.entries(lineage.branches)) {
    if (!/^[a-z\d]+(?:-[a-z\d]+)*$/.test(id)) throw Error('Invalid atlas branch: ' + id);
    const details = rows.map(([work, facets, links]) => {
      if (!memberships.has(work)) memberships.set(work, []);
      memberships.get(work).push(id);
      return {...lineage.works[work],id:work,facets,links,peerCount:neighbors.get(work)?.length || 0};
    });
    await write('branches/' + id,{facets:lineage.facets[id] || [],rows:details});
  }
  const search = Object.entries(lineage.works).map(([id, w]) => [w.title,w.authors,memberships.get(id) || [],id]);
  await write('lineage-search',search);
  const workBuckets = new Map();
  for (const id of Object.keys(lineage.works)) {
    if (!/^w[\da-f]{16}$/.test(id)) throw Error('Invalid public work id: ' + id);
    const key = id.slice(1,3);
    if (!workBuckets.has(key)) workBuckets.set(key,[]);
    workBuckets.get(key).push(id);
  }
  // A detail view needs one small shard with its neighbors, even for a paper
  // cited by work in many branches. Shared metadata is written once per shard.
  for (const [bucket, ids] of workBuckets) {
    const items = {}, books = {};
    for (const id of ids) {
      const adjacent = neighbors.get(id) || [];
      items[id] = adjacent;
      for (const key of [id,...adjacent.map(([peer]) => peer)]) {
        if (!Object.hasOwn(books, key)) books[key] = [lineage.works[key], neighbors.get(key)?.length || 0];
      }
    }
    await write('works/' + bucket,{items,books});
  }
  const graph = buildGraph(atlas,lineage,metrics,linked);
  const fields = new Map(), branchFields = {};
  for (const [i,[id,field]] of graph.branches.entries()) {
    if (!fields.has(field)) fields.set(field,{index:fields.size,branches:new Set()});
    const group = fields.get(field);
    group.branches.add(i);
    branchFields[id] = group.index;
    await write('network/branch-' + id,subgraph(graph,new Set([i])));
  }
  for (const {index,branches} of fields.values()) {
    await write('network/field-' + index,subgraph(graph,branches));
  }
  await write('network/index',branchFields);
  await write('network/all',graph);
  const distinct = graph.nodes.length, core = graph.nodes.filter(node=>node[7].length).length;
  await write('lineage-stats',{...lineage.stats,distinct,core,additional:distinct-core});
  return {branches:graph.branches.length,fields:fields.size,works:search.length,distinct};
}
