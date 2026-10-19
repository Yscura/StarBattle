// Checks every level in index.html by playing it from an empty board using only the hints,
// and checks that old saves (keyed by level number) still migrate to puzzle IDs.
// Usage: node tools/check-levels.js
const fs = require("fs"), vm = require("vm"), path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const script = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

function sandbox(store = {}) {
  const el = () => { const e = { classList: { toggle(){}, add(){}, remove(){} }, style: { setProperty(){} }, dataset: {}, children: [],
    setAttribute(){}, addEventListener(){}, appendChild(c) { e.children.push(c); }, focus(){}, scrollIntoView(){},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }), offsetWidth: 0,
    innerHTML: "", textContent: "", hidden: false, firstElementChild: null }; return e; };
  const els = {};
  return { document: { getElementById: id => els[id] ??= el(), createElement: el, createElementNS: el, addEventListener(){} },
    window: { addEventListener(){} }, navigator: {}, location: { protocol: "file:" }, performance,
    setTimeout(){}, clearTimeout(){}, setInterval: () => 1, clearInterval(){}, console,
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => store[k] = v }, OUT: [] };
}

// 1. every level solvable with hints alone
const ctx = sandbox();
vm.runInNewContext(script + `
for (let L = 0; L < LEVELS.length; L++) {
  openLevel(L);
  const m = { tier: LEVELS[L].tier, single: 0, conf: 0, cover: 0, chain: 0, fall: 0, solved: false };
  let steps = 0;
  while (!lvlState().solved && steps++ < 400) {
    const s = findStep();
    if (s.msg1.startsWith("This one")) m.fall++;
    else if (s.ghosts) m.chain++;
    else if (s.msg2.includes("Only one cell is left")) m.single++;
    else if (s.msg2.includes("would cross out every")) m.cover++;
    else m.conf++;
    const star = s.msg2.includes("Place a star");
    for (const i of s.targets) cells[i] = star ? STAR : CROSS;
    lastPlaced = -1; render(false);
  }
  m.solved = lvlState().solved;
  OUT.push(m);
}`, ctx);
const rows = ctx.OUT;
let failed = 0;
for (const t of ["easy", "medium", "hard"]) {
  const g = rows.filter(r => r.tier === t);
  const sum = k => g.reduce((a, r) => a + r[k], 0);
  console.log(`${t.padEnd(6)} ${String(g.length).padStart(4)} levels | solved ${g.filter(r => r.solved).length} | fallbacks ${sum("fall")} | chain hints ${sum("chain")} | avg "running out of room" ${(sum("cover") / g.length).toFixed(1)}`);
  failed += g.filter(r => !r.solved || r.fall).length;
}

// 2. old saves (keyed by level number) migrate to puzzle IDs
const blank = new Array(100).fill(0);
const store = { "starbattle.v3": JSON.stringify({ level: 2, levels: {
  0: { cells: blank, time: 95, solved: true, best: 95 },
  2: { cells: blank, time: 300, solved: true, best: 280 } } }) };
const m = sandbox(store);
vm.runInNewContext(script + `
const i0 = LEVELS.findIndex(L => L.id === LEGACY_ORDER[0]), i2 = LEVELS.findIndex(L => L.id === LEGACY_ORDER[2]);
OUT.push({ best0: stateOf(i0)?.best, best2: stateOf(i2)?.best, current: level === i2 });`, m);
const r = m.OUT[0];
const migrated = r.best0 === 95 && r.best2 === 280 && r.current;
console.log(`migration of old saves: ${migrated ? "ok" : "FAILED"}`);

// 3. no duplicate puzzles or IDs
const d = sandbox();
vm.runInNewContext(script + `LEVELS.forEach(L => OUT.push([L.id, L.regions.join()]));`, d);
const dup = d.OUT.length - new Set(d.OUT.map(x => x[0])).size + d.OUT.length - new Set(d.OUT.map(x => x[1])).size;
console.log(`total ${d.OUT.length} levels | duplicate puzzles or IDs: ${dup}`);
process.exit(failed || !migrated || dup ? 1 : 0);
