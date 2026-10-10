// Draws the app icons (a white star on a region-coloured tile) as PNGs, no dependencies.
// Usage: node tools/make-icons.js
const fs = require("fs"), path = require("path"), zlib = require("zlib");

const BG = [0x7f, 0x80, 0xcf];   // region blue from the board
const STAR = [0xff, 0xff, 0xff];
const SS = 4;                     // supersampling per axis

function starPoly(cx, cy, R) {
  const r = R * 0.45, pts = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r : R;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}
function inside(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function draw(size, starScale) {
  // slightly lower than centre so the star looks optically centred
  const pts = starPoly(size / 2, size * 0.525, size * starScale);
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++)
        if (inside(pts, x + (sx + .5) / SS, y + (sy + .5) / SS)) hit++;
      const t = hit / (SS * SS);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let ch = 0; ch < 3; ch++) raw[o + ch] = Math.round(BG[ch] * (1 - t) + STAR[ch] * t);
    }
  }
  return png(size, size, raw);
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, "..", "icons");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "icon-192.png"), draw(192, 0.36));
fs.writeFileSync(path.join(out, "icon-512.png"), draw(512, 0.36));
// maskable: Android may crop to a circle, so keep the star inside the central safe zone
fs.writeFileSync(path.join(out, "icon-maskable-512.png"), draw(512, 0.28));
console.log("icons written to", out);
