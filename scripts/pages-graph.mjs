// This is the same compact public representation used by the Atlas renderer:
// [id, title, authors, year, URL, citations, checked, annotated memberships, all memberships].
const titleKey = text => text.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function buildGraph(atlas, network, metrics, linked) {
  const nodes = [], nodeByWork = new Map(), nodeByDoi = new Map();
  const nodesByTitle = new Map(), anchors = new Map();
  function addNode(key, title, authors, year, url, count, date) {
    const index = nodes.length;
    nodes.push([key, title, authors, year, url, count, date, [], []]);
    nodeByWork.set(key, index);
    const label = titleKey(title);
    if (!nodesByTitle.has(label)) nodesByTitle.set(label, []);
    nodesByTitle.get(label).push(index);
    return index;
  }
  for (const [key, work] of Object.entries(network.works)) {
    const measurement = linked.values[key];
    const node = addNode(key, work.title, work.authors, work.year, work.url,
      measurement?.[0] ?? null, measurement ? linked.dates[measurement[1]] : null);
    nodeByDoi.set(work.doi.toLowerCase(), node);
  }

  // An edge may be a citation (1), an annotated relationship (2), or both (3).
  const edges = new Map();
  function connect(from, to, type) {
    if (from == null || to == null || from === to) return;
    const key = from + ':' + to;
    const existing = edges.get(key);
    if (existing) existing[2] |= type;
    else edges.set(key, [from, to, type]);
  }
  function addMembership(nodeIndex, branchIndex) {
    const memberships = nodes[nodeIndex][8];
    if (!memberships.includes(branchIndex)) memberships.push(branchIndex);
  }
  for (const [bi, branch] of atlas.branches.entries()) {
    for (const paper of branch.papers) {
      const raw = metrics.papers[paper.id];
      const measurement = raw?.[0] === paper.title ? raw : null;
      const doi = measurement?.[1] || paper.url.match(/10\.\d{4,9}\/[^?#\s]+/i)?.[0];
      const surname = paper.authors.split(/ · |;| and | & /)[0].trim().split(/\s+/).at(-1);
      const samePaper = nodesByTitle.get(titleKey(paper.title))?.find(i =>
        Math.abs(nodes[i][3] - paper.year) <= 3 && titleKey(nodes[i][2]).includes(titleKey(surname)));
      const node = (doi ? nodeByDoi.get(doi.toLowerCase()) : undefined) ?? samePaper ??
        addNode(paper.id, paper.title, paper.authors, paper.year, paper.url,
          measurement?.[2] ?? null, measurement?.[3] || null);
      if (doi) nodeByDoi.set(doi.toLowerCase(), node);
      if (measurement) {
        nodes[node][5] = measurement[2];
        nodes[node][6] = measurement[3];
      }
      if (paper.publishedUrl && paper.publishedUrl !== nodes[node][4]) nodes[node][9] = paper.publishedUrl;
      addMembership(node, bi);
      nodes[node][7].push([bi, paper.id]);
      anchors.set(branch.id + '/' + paper.id, node);
    }
    for (const edge of branch.edges) {
      connect(anchors.get(branch.id + '/' + edge.from), anchors.get(branch.id + '/' + edge.to), 2);
    }
    for (const [id, , links] of network.branches[branch.id] || []) {
      const node = nodeByWork.get(id);
      if (node == null) continue;
      addMembership(node, bi);
      for (const [anchor, direction] of links) {
        const other = anchors.get(branch.id + '/' + anchor);
        if (direction === 'cites-anchor') connect(other, node, 1);
        else connect(node, other, 1);
      }
    }
  }
  for (const edge of atlas.bridges || []) {
    connect(anchors.get(edge.fromBranch + '/' + edge.from), anchors.get(edge.toBranch + '/' + edge.to), 2);
  }
  for (const [citing, groups] of Object.entries(network.betweenWorks)) {
    for (const [, targets] of groups) {
      for (const cited of targets) connect(nodeByWork.get(cited), nodeByWork.get(citing), 1);
    }
  }
  return {branches: atlas.branches.map(b => [b.id, b.group, b.name, b.en]), nodes, edges: [...edges.values()]};
}

export function subgraph(graph, branchIndexes) {
  const ids = new Int32Array(graph.nodes.length).fill(-1);
  const nodes = [], edges = [];
  graph.nodes.forEach((node, i) => {
    if (node[8].some(branch => branchIndexes.has(branch))) {
      ids[i] = nodes.length;
      nodes.push(node);
    }
  });
  for (const [from, to, type] of graph.edges) {
    if (ids[from] >= 0 && ids[to] >= 0) edges.push([ids[from], ids[to], type]);
  }
  return {branches: graph.branches, nodes, edges};
}
