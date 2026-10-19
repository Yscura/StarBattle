// Picks levels from generated candidates by playing each one through the game's own hint engine.
// 1. node tools/generate.js <count> <seed> 1 <hardenIterations> <targetScore> <size> > tools/candidates3/x.json
// 2. extract the <script> of index.html to game.js
// 3. node tools/select-levels.js game.js out.txt <tier> <minScore> <maxScore> <count> <candidates.json...>
//    Prints LEVELS lines (sorted easiest first) to out.txt; skips puzzles already in the game,
//    any that need a fallback hint, and prefers ones with few "running out of room" steps.
const fs = require("fs"), vm = require("vm");
const [,, gameFile, outFile, tier, minS, maxS, countS, ...files] = process.argv;
const MIN = +minS, MAX = +maxS, COUNT = +countS;
// Candidate files are either a JSON array or one JSON puzzle per line (generate.js --ndjson)
const readCands = f => {
  const t = fs.readFileSync(f, "utf8").trim();
  return t.startsWith("[") ? JSON.parse(t) : t.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
};
const cands = files.flatMap(readCands)
  .filter(c => c.score >= MIN && c.score <= MAX);

const el = () => { const e = { classList: { toggle(){}, add(){}, remove(){} }, style: { setProperty(){} }, dataset: {}, children: [],
  setAttribute(){}, addEventListener(){}, appendChild(c){ e.children.push(c); }, getBoundingClientRect: () => ({ left:0, top:0, width:100, height:100 }),
  innerHTML: "", textContent: "", hidden: false, firstElementChild: null }; return e; };
const els = {};
const ctx = { document: { getElementById: id => els[id] ??= el(), createElement: el, createElementNS: el, addEventListener(){} },
  window: { addEventListener(){} }, navigator: {}, location: { protocol: "file:" }, performance,
  setTimeout(){}, clearTimeout(){}, setInterval: () => 1, clearInterval(){}, console,
  CANDS: cands, RESULTS: [], EXISTING: [] };
const test = `
const fixed = LEVELS.length;
LEVELS.forEach(L => EXISTING.push(L.regions.join()));
for (const c of CANDS) LEVELS.push({ tier: "medium", regions: c.regions, id: puzzleId(c.regions) });
for (let L = fixed; L < LEVELS.length; L++) {
  openLevel(L);
  const m = { cover: 0, chain: 0, fall: 0, steps: 0 };
  while (!lvlState().solved && m.steps < 300) {
    const s = findStep(); m.steps++;
    if (s.msg1.startsWith("This one")) m.fall++;
    else if (s.msg2.includes("would cross out every")) m.cover++;
    else if (s.ghosts) m.chain++;
    const star = s.msg2.includes("Place a star");
    for (const i of s.targets) cells[i] = star ? STAR : CROSS;
    lastPlaced = -1; render(false);
  }
  RESULTS.push({ ...CANDS[L - fixed], ...m, ok: lvlState().solved });
}`;
vm.runInNewContext(fs.readFileSync(gameFile, "utf8") + test, ctx);

const seen = new Set(ctx.EXISTING);
// MAX_CHAIN (env, default 1): how many "forced chain" hints a level may need
const MAX_CHAIN = +(process.env.MAX_CHAIN ?? 1);
const good = ctx.RESULTS.filter(r => r.ok && !r.fall && r.chain <= MAX_CHAIN && !seen.has(r.regions.join()) && seen.add(r.regions.join()));
// Keep the cleanest candidates (fewest "running out of room" steps), then spread the picks
// evenly over the score range so the tier ramps up smoothly.
good.sort((a, b) => a.cover - b.cover);
const coverCap = good.length ? good[Math.min(good.length, Math.ceil(COUNT * 1.3)) - 1].cover : 0;
const pool = good.filter(r => r.cover <= coverCap).sort((a, b) => a.score - b.score);
const picked = pool.length <= COUNT ? pool
  : Array.from({ length: COUNT }, (_, k) => pool[Math.round(k * (pool.length - 1) / (COUNT - 1))]);
console.log(`${tier}: ${cands.length} in score range, ${good.length} usable, picked ${picked.length}` +
  (picked.length ? ` (scores ${picked[0].score}–${picked[picked.length - 1].score}, max cover ${Math.max(...picked.map(p => p.cover))})` : ""));
fs.writeFileSync(outFile, picked.map(p => `  { tier: "${tier}", regions: ${JSON.stringify(p.regions)} },`).join("\n") + "\n");
