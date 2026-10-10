// Picks levels from generated candidates by playing each one through the game's own hint engine.
// 1. node tools/generate.js 16 <seed> 1 2000 <targetScore> > tools/candidates/t<target>.json
// 2. extract the <script> of index.html to game.js
// 3. node tools/select-levels.js game.js tools/candidates levels.txt   (paste levels.txt into LEVELS)
const fs = require("fs"), vm = require("vm"), path = require("path");
const [,, gameFile, dir, outFile] = process.argv;
const cands = [];
for (const f of fs.readdirSync(dir).filter(f => /^t\d+b?\.json$/.test(f))) cands.push(...JSON.parse(fs.readFileSync(path.join(dir, f))));
const el = () => { const e = { classList: { toggle(){}, add(){}, remove(){} }, style: { setProperty(){} }, dataset: {}, children: [],
  setAttribute(){}, addEventListener(){}, appendChild(c){ e.children.push(c); }, getBoundingClientRect: () => ({ left:0, top:0, width:100, height:100 }),
  innerHTML: "", textContent: "", hidden: false, firstElementChild: null }; return e; };
const els = {};
const ctx = { document: { getElementById: id => els[id] ??= el(), createElement: el, createElementNS: el, addEventListener(){} },
  window: { addEventListener(){} }, performance, setTimeout(){}, clearTimeout(){}, setInterval: () => 1, clearInterval(){}, console, CANDS: cands, RESULTS: [] };
const test = `
const fixed = LEVELS.length;
for (const c of CANDS) LEVELS.push({ regions: c.regions });
for (let L = fixed; L < LEVELS.length; L++) {
  openLevel(L);
  const m = { cover: 0, chain: 0, fall: 0, multi: 0, steps: 0 };
  while (!lvlState().solved && m.steps < 300) {
    const s = findStep(); m.steps++;
    if (s.msg1.startsWith("This one")) m.fall++;
    else if (s.msg2.includes("would cross out every")) m.cover++;
    else if (s.msg2.includes("forces other")) m.chain++;
    else if (/rows? \d+–|columns? \d+–/.test(s.msg2)) m.multi++;
    const star = s.msg2.includes("Place a star");
    for (const i of s.targets) cells[i] = star ? STAR : CROSS;
    lastPlaced = -1; render(false);
  }
  RESULTS.push({ ...CANDS[L - fixed], ...m, ok: lvlState().solved });
}`;
vm.runInNewContext(fs.readFileSync(gameFile, "utf8") + test, ctx);
const seen = new Set();
const good = ctx.RESULTS.filter(r => r.ok && !r.fall && r.chain <= 1 && !seen.has(r.regions.join()) && seen.add(r.regions.join()));
console.log("candidates", cands.length, "usable", good.length);
// normal: score 18-31, fewest "running out of room" steps; hard: 32-45
const normal = good.filter(r => r.score >= 18 && r.score <= 31).sort((a, b) => a.cover - b.cover).slice(0, 40).sort((a, b) => a.score - b.score);
const hard = good.filter(r => r.score >= 32 && r.score <= 45).sort((a, b) => a.cover - b.cover).slice(0, 7).sort((a, b) => a.score - b.score);
console.log("normal", normal.length, "hard", hard.length);
// a harder level after every ~6 normal ones
const order = [];
let h = 0;
normal.forEach((p, i) => { order.push({ ...p, hard: false }); if ((i + 1) % 6 === 0 && h < hard.length) order.push({ ...hard[h++], hard: true }); });
while (h < hard.length) order.push({ ...hard[h++], hard: true });
for (const p of order) console.log(p.hard ? "HARD" : "    ", "score", p.score, "cover", p.cover, "chain", p.chain, "multi", p.multi);
fs.writeFileSync(outFile, order.map(p => `  { ${p.hard ? "hard: true, " : ""}regions: ${JSON.stringify(p.regions)} },`).join("\n"));
