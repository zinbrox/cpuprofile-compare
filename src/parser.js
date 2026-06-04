const IDLE_NAMES = new Set(['(idle)', '(program)', '(garbage collector)', '(root)']);

/**
 * @param {string} text - raw .cpuprofile JSON
 * @returns {{ functions: Map<string, FunctionEntry>, totalDurationMs: number }}
 *
 * @typedef {{ functionName: string, url: string, lineNumber: number,
 *             selfHits: number, totalHits: number, selfPct: number,
 *             totalPct: number, selfMs: number, totalMs: number,
 *             isIdle: boolean, packageName: string|null }} FunctionEntry
 */
export function parseProfile(text) {
  const profile = JSON.parse(text);
  const { nodes, timeDeltas } = profile;

  const totalDurationUs = timeDeltas.reduce((s, d) => s + d, 0);
  const totalDurationMs = totalDurationUs / 1000;

  // nodeId → node
  const nodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, totalHits: 0 });
  }

  // compute totalHits by DFS from root (id=1)
  // totalHits(node) = hitCount + Σ totalHits(children)
  const visited = new Set();
  function dfs(id) {
    if (visited.has(id)) return 0;
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node) return 0;
    let total = node.hitCount || 0;
    for (const childId of (node.children || [])) {
      total += dfs(childId);
    }
    node.totalHits = total;
    return total;
  }
  dfs(1);

  const totalSamples = nodes.reduce((s, n) => s + (n.hitCount || 0), 0) || 1;

  // aggregate by function key
  const functions = new Map();

  for (const node of nodeMap.values()) {
    const { functionName = '(anonymous)', url = '', lineNumber = 0, columnNumber = 0 } = node.callFrame;
    const key = `${functionName}|${url}|${lineNumber}|${columnNumber}`;

    if (!functions.has(key)) {
      functions.set(key, {
        functionName,
        url,
        lineNumber,
        columnNumber,
        selfHits: 0,
        totalHits: 0,
        isIdle: IDLE_NAMES.has(functionName),
        packageName: packageFromUrl(url),
      });
    }

    const entry = functions.get(key);
    entry.selfHits += node.hitCount || 0;
    entry.totalHits += node.totalHits || 0;
  }

  // convert to percentages and ms
  for (const entry of functions.values()) {
    entry.selfPct = (entry.selfHits / totalSamples) * 100;
    entry.totalPct = (entry.totalHits / totalSamples) * 100;
    entry.selfMs = (entry.selfHits / totalSamples) * totalDurationMs;
    entry.totalMs = (entry.totalHits / totalSamples) * totalDurationMs;
  }

  return { functions, totalDurationMs };
}

export function packageFromUrl(url) {
  if (!url) return null;
  const nm = url.lastIndexOf('node_modules/');
  if (nm === -1) return null;
  const after = url.slice(nm + 'node_modules/'.length);
  const parts = after.split('/');
  if (parts[0].startsWith('@') && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return parts[0] || null;
}

export function shortUrl(url) {
  if (!url) return '';
  // strip node_modules path to just package/file
  const nm = url.lastIndexOf('node_modules/');
  if (nm !== -1) return url.slice(nm + 'node_modules/'.length);
  // strip file:// and long absolute paths — keep last 3 segments
  const clean = url.replace(/^file:\/\//, '');
  const parts = clean.split('/');
  return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : clean;
}
