// Merges newly selected levels into index.html and orders them: easy, then medium, then hard,
// each tier sorted easiest first by generator score. Progress is saved per puzzle, so reordering is safe.
// Usage: node tools/merge-levels.js <picked.txt>...   (files written by select-levels.js)
const fs = require("fs"), path = require("path");

// score lookup from every candidate file in tools/
const score = new Map();
const readCands = f => {
  const t = fs.readFileSync(f, "utf8").trim();
  if (!t) return [];
  return t.startsWith("[") ? JSON.parse(t) : t.split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
};
const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) walk(p);
  else if (/\.(json|ndjson)$/.test(e.name)) try { readCands(p).forEach(c => c.regions && score.set(c.regions.join(), c.score)); } catch {}
});
walk(path.join(__dirname));

const file = path.join(__dirname, "..", "index.html");
const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
const html = raw.replace(/\r\n/g, "\n");
const a = html.indexOf("const LEVELS = [\n"), b = html.indexOf("\n];", a);
if (a < 0 || b < 0 || html.indexOf("const LEVELS = [\n", a + 1) >= 0) throw new Error("LEVELS block not found exactly once");

const parse = txt => [...txt.matchAll(/\{ tier: "(\w+)", regions: (\[[^\]]+\]) \}/g)].map(m => ({ tier: m[1], regions: JSON.parse(m[2]) }));
const existing = parse(html.slice(a, b));
const added = process.argv.slice(2).flatMap(f => parse(fs.readFileSync(f, "utf8")));
const all = [...existing, ...added];
const keys = all.map(L => L.regions.join());
if (new Set(keys).size !== keys.length) throw new Error("duplicate puzzles");
const missing = all.filter(L => !score.has(L.regions.join())).length;

const ordered = ["easy", "medium", "hard"].flatMap(t => all
  .map((L, i) => ({ ...L, i, s: score.get(L.regions.join()) ?? 0 }))
  .filter(L => L.tier === t)
  .sort((x, y) => x.s - y.s || x.i - y.i));
if (ordered.length !== all.length) throw new Error("unknown tier in levels");

const lines = ordered.map(L => `  { tier: "${L.tier}", regions: ${JSON.stringify(L.regions)} },`).join("\n");
let out = html.slice(0, a) + "const LEVELS = [\n" + lines + html.slice(b);
if (crlf) out = out.replace(/\n/g, "\r\n");
fs.writeFileSync(file, out);

console.log(`existing ${existing.length} + new ${added.length} = ${all.length} levels (scores missing: ${missing})`);
for (const t of ["easy", "medium", "hard"]) {
  const g = ordered.filter(L => L.tier === t);
  const first = ordered.indexOf(g[0]) + 1;
  console.log(`  ${t}: ${g.length} levels, numbers ${first}–${first + g.length - 1}, scores ${g[0].s}–${g[g.length - 1].s}`);
}
