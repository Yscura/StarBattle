const fs = require("fs");
// Star Battle puzzle generator (NxN, K stars per row/column/region; K = 1 or 2).
// Usage: node tools/generate.js [count] [seed] [stars] [hardenIterations] [targetScore] [size=10] [--ndjson]
// With --ndjson each puzzle is written as one JSON line as soon as it is made, so a long run can be stopped any time.
// Prints JSON puzzles with a unique solution plus a difficulty rating.

const N = +process.argv[7] || 10;
const NDJSON = process.argv.includes("--ndjson");
const count = +process.argv[2] || 30;
let seed = +process.argv[3] || Date.now() % 1e9;
const K = +process.argv[4] || 1;

function rand() { // mulberry32
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = n => Math.floor(rand() * n);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const nb4 = (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N);

// Row patterns: K non-adjacent columns
const PATTERNS = [];
for (let a = 0; a < N; a++) {
  if (K === 1) PATTERNS.push([a]);
  else for (let b = a + 2; b < N; b++) PATTERNS.push([a, b]);
}
const touchesPrev = (p, prev) => p.some(c => prev.some(d => Math.abs(c - d) <= 1));

function randomSolution() {
  const sol = [];
  const colCnt = new Array(N).fill(0);
  function rec(r) {
    if (r === N) return true;
    for (const p of shuffle(PATTERNS.slice())) {
      if (p.some(c => colCnt[c] >= K)) continue;
      if (r > 0 && touchesPrev(p, sol[r - 1])) continue;
      sol[r] = p; p.forEach(c => colCnt[c]++);
      if (rec(r + 1)) return true;
      p.forEach(c => colCnt[c]--);
    }
    return false;
  }
  rec(0);
  return sol;
}

// Count solutions up to limit
function countSolutions(reg, limit) {
  const colCnt = new Array(N).fill(0), regCnt = new Array(N).fill(0);
  // remaining cells per region from row r down, for pruning
  const regRemain = [];
  for (let r = 0; r <= N; r++) {
    regRemain[r] = new Array(N).fill(0);
    for (let rr = r; rr < N; rr++) for (let c = 0; c < N; c++) regRemain[r][reg[rr][c]]++;
  }
  const prev = [];
  let found = 0;
  function rec(r) {
    if (r === N) { found++; return; }
    for (const p of PATTERNS) {
      if (p.some(c => colCnt[c] >= K)) continue;
      if (r > 0 && touchesPrev(p, prev[r - 1])) continue;
      p.forEach(c => { colCnt[c]++; regCnt[reg[r][c]]++; });
      let ok = p.every(c => regCnt[reg[r][c]] <= K);
      // prune: every region must still be able to reach K
      for (let g = 0; g < N && ok; g++) if (regCnt[g] < K && regRemain[r + 1][g] === 0) ok = false;
      if (ok) { prev[r] = p; rec(r + 1); }
      p.forEach(c => { colCnt[c]--; regCnt[reg[r][c]]--; });
      if (found >= limit) return;
    }
  }
  rec(0);
  return found;
}

function connected(reg, g, without) {
  const cells = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (reg[r][c] === g && !(r === without[0] && c === without[1])) cells.push([r, c]);
  if (!cells.length) return false;
  const seen = new Set([cells[0].join()]), st = [cells[0]];
  while (st.length) {
    const [r, c] = st.pop();
    for (const [a, b] of nb4(r, c)) {
      if (reg[a][b] !== g || (a === without[0] && b === without[1])) continue;
      const k = a + ',' + b;
      if (!seen.has(k)) { seen.add(k); st.push([a, b]); }
    }
  }
  return seen.size === cells.length;
}

function buildRegions(sol) {
  // Grow one blob per star; for K = 2, merge adjacent blobs into pairs.
  for (let attempt = 0; attempt < 200; attempt++) {
    const blob = Array.from({ length: N }, () => new Array(N).fill(-1));
    const stars = [];
    sol.forEach((p, r) => p.forEach(c => { blob[r][c] = stars.length; stars.push([r, c]); }));
    let frontier = stars.map(s => [s]);
    let left = N * N - stars.length;
    while (left > 0) {
      const b = ri(stars.length);
      const f = frontier[b];
      if (!f.length) continue;
      const [r, c] = f[ri(f.length)];
      const opts = nb4(r, c).filter(([a, d]) => blob[a][d] === -1);
      if (!opts.length) { frontier[b] = f.filter(x => !(x[0] === r && x[1] === c)); continue; }
      const [a, d] = opts[ri(opts.length)];
      blob[a][d] = b; f.push([a, d]); left--;
    }
    // adjacency between blobs
    const adj = stars.map(() => new Set());
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [a, d] of nb4(r, c))
      if (blob[a][d] !== blob[r][c]) adj[blob[r][c]].add(blob[a][d]);
    // random perfect matching via backtracking
    const mate = new Array(stars.length).fill(-1);
    function match() {
      const u = mate.indexOf(-1);
      if (u === -1) return true;
      for (const v of shuffle([...adj[u]])) {
        if (mate[v] !== -1) continue;
        mate[u] = v; mate[v] = u;
        if (match()) return true;
        mate[u] = mate[v] = -1;
      }
      return false;
    }
    if (K === 1) return blob;
    if (!match()) continue;
    const id = new Array(stars.length).fill(-1); let next = 0;
    for (let u = 0; u < stars.length; u++) if (id[u] === -1) { id[u] = id[mate[u]] = next++; }
    return blob.map(row => row.map(b => id[b]));
  }
  return null;
}

function makeUnique(sol) {
  const reg = buildRegions(sol);
  if (!reg) return null;
  const isStar = (r, c) => sol[r].includes(c);
  let cur = countSolutions(reg, 300);
  for (let it = 0; it < 4000 && cur > 1; it++) {
    const r = ri(N), c = ri(N);
    if (isStar(r, c)) continue;
    const from = reg[r][c];
    const tos = [...new Set(nb4(r, c).map(([a, b]) => reg[a][b]).filter(g => g !== from))];
    if (!tos.length) continue;
    if (!connected(reg, from, [r, c])) continue;
    reg[r][c] = tos[ri(tos.length)];
    const n = countSolutions(reg, 300);
    if (n <= cur) cur = n; else reg[r][c] = from;
  }
  return cur === 1 ? reg : null;
}

// ---------- Logical solver used for difficulty rating ----------
// cell: 0 unknown, 1 star, -1 empty
function units(reg) {
  const U = [];
  for (let i = 0; i < N; i++) {
    U.push(Array.from({ length: N }, (_, j) => [i, j]));
    U.push(Array.from({ length: N }, (_, j) => [j, i]));
  }
  for (let g = 0; g < N; g++) {
    const u = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (reg[r][c] === g) u.push([r, c]);
    U.push(u);
  }
  return U;
}

function canFit(cells, need) {
  if (need <= 0) return true;
  if (cells.length < need) return false;
  if (need === 1) return true;
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++)
    if (Math.abs(cells[i][0] - cells[j][0]) > 1 || Math.abs(cells[i][1] - cells[j][1]) > 1) return true;
  return false;
}

function basic(g, U) { // returns false on contradiction
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (g[r][c] === 1)
      for (let a = r - 1; a <= r + 1; a++) for (let b = c - 1; b <= c + 1; b++)
        if (a >= 0 && b >= 0 && a < N && b < N && (a !== r || b !== c)) {
          if (g[a][b] === 1) return false;
          if (g[a][b] === 0) { g[a][b] = -1; changed = true; }
        }
    for (const u of U) {
      const stars = u.filter(([r, c]) => g[r][c] === 1).length;
      const unk = u.filter(([r, c]) => g[r][c] === 0);
      if (stars > K) return false;
      if (!canFit(unk, K - stars)) return false;
      if (stars === K && unk.length) { unk.forEach(([r, c]) => g[r][c] = -1); changed = true; }
      else if (unk.length === K - stars && unk.length) { unk.forEach(([r, c]) => g[r][c] = 1); changed = true; }
    }
  }
  return true;
}

// Confinement: k consecutive rows/cols vs regions fully inside them
function confinement(g, reg) {
  let changed = false;
  for (const axis of [0, 1]) {
    const at = (i, j) => axis === 0 ? [i, j] : [j, i];
    for (let k = 1; k <= 4; k++) for (let s = 0; s + k <= N; s++) {
      const inBand = i => i >= s && i < s + k;
      // regions whose live cells are all inside band
      const inside = new Set(), touching = new Set();
      for (let g2 = 0; g2 < N; g2++) {
        let all = true, any = false;
        for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
          const [r, c] = at(i, j);
          if (reg[r][c] !== g2 || g[r][c] === -1) continue;
          if (inBand(i)) any = true; else all = false;
        }
        if (all) inside.add(g2);
        if (any) touching.add(g2);
      }
      if (inside.size === k) { // other regions can't use band
        for (let i = s; i < s + k; i++) for (let j = 0; j < N; j++) {
          const [r, c] = at(i, j);
          if (!inside.has(reg[r][c]) && g[r][c] === 0) { g[r][c] = -1; changed = true; }
        }
      }
      if (touching.size === k) { // those regions can't use cells outside band
        for (let i = 0; i < N; i++) if (!inBand(i)) for (let j = 0; j < N; j++) {
          const [r, c] = at(i, j);
          if (touching.has(reg[r][c]) && g[r][c] === 0) { g[r][c] = -1; changed = true; }
        }
      }
    }
  }
  return changed;
}

function deep(h, U, reg) { // basic + confinement to a fixpoint
  for (;;) {
    if (!basic(h, U)) return false;
    if (!confinement(h, reg)) return true;
  }
}

// Tiers: conf = region/row counting, look = one-step lookahead with simple
// propagation, deepLook = lookahead that also needs counting to find the clash.
function rate(reg) {
  const U = units(reg);
  const g = Array.from({ length: N }, () => new Array(N).fill(0));
  let conf = 0, look = 0, deepLook = 0;
  const tryLook = full => {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (g[r][c] !== 0) continue;
      const h = g.map(row => row.slice()); h[r][c] = 1;
      if (!(full ? deep(h, U, reg) : basic(h, U))) { g[r][c] = -1; return true; }
    }
    return false;
  };
  for (;;) {
    if (!basic(g, U)) return null;
    if (g.every(row => row.every(v => v !== 0))) return { conf, look, deepLook };
    if (confinement(g, reg)) { conf++; continue; }
    if (tryLook(false)) { look++; continue; }
    if (tryLook(true)) { deepLook++; continue; }
    return { conf, look, deepLook, stuck: true };
  }
}

// Reshape region borders while the solution stays unique, keeping changes
// that make the puzzle harder (but still solvable by the rated techniques).
const scoreOf = r => r.conf + 2 * r.look + 10 * r.deepLook;
// With TARGET set, aim for that score instead of "as hard as possible".
function harden(reg, sol, iters) {
  const isStar = (r, c) => sol[r].includes(c);
  let best = rate(reg), bestScore = scoreOf(best);
  const better = sc => TARGET ? Math.abs(sc - TARGET) <= Math.abs(bestScore - TARGET) : sc >= bestScore;
  for (let it = 0; it < iters; it++) {
    if (TARGET && Math.abs(bestScore - TARGET) <= 2) break;
    const r = ri(N), c = ri(N);
    if (isStar(r, c)) continue;
    const from = reg[r][c];
    const tos = [...new Set(nb4(r, c).map(([a, b]) => reg[a][b]).filter(g => g !== from))];
    if (!tos.length || !connected(reg, from, [r, c])) continue;
    reg[r][c] = tos[ri(tos.length)];
    const rt = countSolutions(reg, 2) === 1 && rate(reg);
    if (rt && !rt.stuck && better(scoreOf(rt))) { best = rt; bestScore = scoreOf(rt); }
    else reg[r][c] = from;
  }
  return best;
}
const HARDEN = +process.argv[5] || 0;
const TARGET = +process.argv[6] || 0;

const out = [];
let tries = 0;
while (out.length < count && tries < count * 50) {
  tries++;
  const sol = randomSolution();
  const reg = makeUnique(sol);
  if (!reg) continue;
  let r = rate(reg);
  if (!r || r.stuck) continue;
  if (HARDEN && (!TARGET || Math.abs(scoreOf(r) - TARGET) > 2)) r = harden(reg, sol, HARDEN);
  const score = scoreOf(r);
  const puzzle = { score, conf: r.conf, look: r.look, deepLook: r.deepLook, regions: reg.map(row => row.join('')), solution: sol };
  out.push(puzzle);
  if (NDJSON) fs.appendFileSync(1, JSON.stringify(puzzle) + "\n");
  process.stderr.write(`#${out.length} score=${score} conf=${r.conf} look=${r.look} deep=${r.deepLook}
`);
}
if (!NDJSON) {
  out.sort((a, b) => a.score - b.score);
  console.log(JSON.stringify(out, null, 1));
}
