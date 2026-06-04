/**
 * Merges N parsed profiles into a unified list of comparison rows.
 *
 * @param {{ name: string, functions: Map<string, import('./parser.js').FunctionEntry>, totalDurationMs: number }[]} profiles
 * @param {{ sortBy?: string, topN?: number, filter?: string, hideIdle?: boolean,
 *           source?: string, diffBase?: number, diffCompare?: number }} opts
 * @returns {Row[]}
 *
 * @typedef {{ key: string, functionName: string, url: string, lineNumber: number,
 *             columnNumber: number, isIdle: boolean, packageName: string|null,
 *             perProfile: { selfPct: number, totalPct: number, selfMs: number, totalMs: number }[],
 *             delta: number|null, deltaMs: number|null }} Row
 */
export function buildComparisonRows(profiles, opts) {
  const {
    sortBy = 'totalPct',
    topN = 100,
    filter = '',
    hideIdle = true,
    source = 'all',
    diffBase = 0,
    diffCompare = 1,
  } = opts;

  // union of all keys
  const allKeys = new Set();
  for (const p of profiles) {
    for (const key of p.functions.keys()) allKeys.add(key);
  }

  const ZERO = { selfPct: 0, totalPct: 0, selfMs: 0, totalMs: 0 };

  let rows = [];
  for (const key of allKeys) {
    const first = profiles[0]?.functions.get(key);
    const { functionName, url, lineNumber, columnNumber, isIdle, packageName } =
      first || profiles.find(p => p.functions.has(key)).functions.get(key);

    if (hideIdle && isIdle) continue;

    const perProfile = profiles.map(p => p.functions.get(key) ?? { ...ZERO, isIdle });

    const hasDiff = profiles.length >= 2 && diffBase !== diffCompare;
    const bPp = perProfile[diffBase]   ?? { ...ZERO };
    const cPp = perProfile[diffCompare] ?? { ...ZERO };
    const delta   = hasDiff ? cPp.totalPct - bPp.totalPct : null;
    const deltaMs = hasDiff ? cPp.totalMs  - bPp.totalMs  : null;

    rows.push({ key, functionName, url, lineNumber, columnNumber, isIdle, packageName, perProfile, delta, deltaMs });
  }

  // source filter
  if (source !== 'all') {
    if (source === 'user') {
      rows = rows.filter(r => r.packageName === null && !r.isIdle);
    } else if (source.startsWith('pkg:')) {
      const pkg = source.slice(4);
      rows = rows.filter(r => r.packageName === pkg);
    }
  }

  // text filter
  if (filter.trim()) {
    const q = filter.toLowerCase();
    rows = rows.filter(r =>
      r.functionName.toLowerCase().includes(q) ||
      r.url.toLowerCase().includes(q)
    );
  }

  // sort
  rows.sort((a, b) => {
    switch (sortBy) {
      case 'selfPct':  return b.perProfile[0].selfPct  - a.perProfile[0].selfPct;
      case 'totalMs':  return b.perProfile[0].totalMs  - a.perProfile[0].totalMs;
      case 'delta':    return (b.delta ?? 0) - (a.delta ?? 0);
      default:         return b.perProfile[0].totalPct - a.perProfile[0].totalPct;
    }
  });

  return rows.slice(0, topN);
}

/**
 * @param {{ name: string, functions: Map<string, import('./parser.js').FunctionEntry>, totalDurationMs: number }[]} profiles
 * @param {{ hideIdle?: boolean, diffBase?: number, diffCompare?: number }} opts
 * @returns {PackageRow[]}
 *
 * @typedef {{ label: string, packageName: string|null,
 *             perProfile: { selfMs: number, selfPct: number }[],
 *             delta: number|null, deltaPct: number|null }} PackageRow
 */
export function buildPackageRows(profiles, { hideIdle = true, diffBase = 0, diffCompare = 1, sortBy = 'selfMs' } = {}) {
  const allPackages = new Set();
  const perProfileMaps = profiles.map(p => {
    const map = new Map();
    for (const entry of p.functions.values()) {
      if (hideIdle && entry.isIdle) continue;
      const key = entry.packageName ?? '__user__';
      if (!map.has(key)) map.set(key, { selfMs: 0, selfPct: 0 });
      const b = map.get(key);
      b.selfMs += entry.selfMs;
      b.selfPct += entry.selfPct;
    }
    for (const k of map.keys()) allPackages.add(k);
    return map;
  });

  const ZERO = { selfMs: 0, selfPct: 0 };
  const hasDiff = profiles.length >= 2 && diffBase !== diffCompare;

  const rows = [];
  for (const pkg of allPackages) {
    const perProfile = perProfileMaps.map(m => ({ ...(m.get(pkg) ?? ZERO) }));
    const delta = hasDiff
      ? (perProfile[diffCompare]?.selfMs ?? 0) - (perProfile[diffBase]?.selfMs ?? 0)
      : null;
    const deltaPct = hasDiff
      ? (perProfile[diffCompare]?.selfPct ?? 0) - (perProfile[diffBase]?.selfPct ?? 0)
      : null;
    rows.push({
      label: pkg === '__user__' ? 'User Code' : pkg,
      packageName: pkg === '__user__' ? null : pkg,
      perProfile,
      delta,
      deltaPct,
    });
  }
  rows.sort((a, b) => {
    if (sortBy === 'delta') return (b.delta ?? 0) - (a.delta ?? 0);
    return b.perProfile[0].selfMs - a.perProfile[0].selfMs;
  });
  return rows;
}
