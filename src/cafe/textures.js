import * as THREE from 'three';

/** Procedural canvas textures for the café (no image files). Seeded so every load looks the same. */
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function finish(c, { repeat = [1, 1], wrap = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tiny heart path centred on (x, y). */
export function heart(g, x, y, s) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.4, y - s * 0.85, x, y - s * 0.35);
  g.bezierCurveTo(x + s * 0.4, y - s * 0.85, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
  g.fill();
}

/** Paw print: a pad and four toes. */
export function paw(g, x, y, s) {
  g.beginPath(); g.ellipse(x, y + s * 0.15, s * 0.42, s * 0.34, 0, 0, Math.PI * 2); g.fill();
  for (const [dx, dy] of [[-0.48, -0.32], [-0.17, -0.58], [0.17, -0.58], [0.48, -0.32]]) {
    g.beginPath(); g.ellipse(x + dx * s, y + dy * s, s * 0.15, s * 0.19, dx * 0.6, 0, Math.PI * 2); g.fill();
  }
}

/**
 * Wall texture for the whole wall height (UVs in metres; repeat = [1, 1/height]): mint wainscot
 * boards up to 0.9 m, a cream chair rail, then pink wallpaper with cream stripes, hearts and paws.
 */
export function wallTexture(height) {
  const pxPerM = 256, [c, g] = canvas(256, Math.round(height * pxPerM));
  const H = c.height, railY = H - 0.9 * pxPerM;
  // wallpaper
  g.fillStyle = '#f7d6de'; g.fillRect(0, 0, 256, railY);
  g.fillStyle = '#fbe7ec';
  for (let x = 0; x < 256; x += 64) g.fillRect(x + 8, 0, 20, railY);
  for (let y = 30, row = 0; y < railY - 20; y += 58, row++) {
    for (let x = row % 2 ? 46 : 14; x < 256; x += 64) {
      if ((row + x) % 3 === 0) { g.fillStyle = '#ffffff'; heart(g, x, y, 9); }
      else { g.fillStyle = '#eab8c6'; paw(g, x, y, 9); }
    }
  }
  // chair rail
  g.fillStyle = '#fff6e6'; g.fillRect(0, railY - 10, 256, 18);
  g.fillStyle = '#e6d3b8'; g.fillRect(0, railY + 6, 256, 3);
  // wainscot boards
  g.fillStyle = '#bfe6d6'; g.fillRect(0, railY + 9, 256, H - railY - 9);
  g.fillStyle = '#a8d8c4';
  for (let x = 0; x < 256; x += 32) g.fillRect(x, railY + 9, 3, H - railY - 9);
  g.fillStyle = '#d7f1e6';
  for (let x = 4; x < 256; x += 32) g.fillRect(x, railY + 9, 2, H - railY - 9);
  // skirting
  g.fillStyle = '#fff6e6'; g.fillRect(0, H - 26, 256, 26);
  return finish(c, { repeat: [1, 1 / height] });
}

/** Honey-coloured wooden floor planks (one tile = 1.2 m square). */
export function floorTexture(repeatX, repeatY) {
  const [c, g] = canvas(512, 512);
  const rows = 8, h = 512 / rows;
  for (let r = 0; r < rows; r++) {
    let x = -((r * 157) % 300);
    while (x < 512) {
      const len = 180 + rand() * 200, shade = rand() * 22 - 11;
      g.fillStyle = `rgb(${226 + shade},${190 + shade},${146 + shade})`;
      g.fillRect(x, r * h, len, h);
      g.strokeStyle = 'rgba(160,110,70,0.18)'; g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        const y = r * h + 10 + rand() * (h - 20);
        g.beginPath(); g.moveTo(x + 6, y); g.bezierCurveTo(x + len * 0.3, y + 4, x + len * 0.6, y - 4, x + len - 6, y + 1); g.stroke();
      }
      g.fillStyle = 'rgba(120,80,50,0.45)'; g.fillRect(x, r * h, 2, h);
      x += len;
    }
    g.fillStyle = 'rgba(120,80,50,0.4)'; g.fillRect(0, r * h, 512, 2);
  }
  return finish(c, { repeat: [repeatX, repeatY] });
}

/** Cream ceiling with soft plaster speckle. */
export function ceilingTexture(repeatX, repeatY) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#fff8ee'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(220,200,180,${0.08 + rand() * 0.1})`; g.fillRect(rand() * 256, rand() * 256, 2, 2); }
  return finish(c, { repeat: [repeatX, repeatY] });
}

/** The painted view out of the window: a sunny pastel street with a blossom tree. */
export function windowView() {
  const [c, g] = canvas(1024, 768);
  const sky = g.createLinearGradient(0, 0, 0, 768);
  sky.addColorStop(0, '#a9d8f5'); sky.addColorStop(0.6, '#dff1fb'); sky.addColorStop(1, '#fbeff2');
  g.fillStyle = sky; g.fillRect(0, 0, 1024, 768);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [x, y, s] of [[180, 120, 1], [620, 80, 1.3], [880, 190, 0.8]]) {
    for (const [dx, dy, r] of [[0, 0, 40], [45, -15, 50], [95, 0, 38], [50, 15, 40]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, 7); g.fill(); }
  }
  // distant houses
  const houses = ['#f9c6cf', '#fde7b0', '#c9e8d8', '#d9cff2', '#fbd3b5', '#cfe3f7'];
  let x = -20;
  while (x < 1024) {
    const w = 120 + rand() * 90, h = 220 + rand() * 160, col = houses[Math.floor(rand() * houses.length)];
    g.fillStyle = col; g.fillRect(x, 768 - h - 120, w, h + 120);
    g.fillStyle = '#e48f8f';                                                    // roof
    g.beginPath(); g.moveTo(x - 10, 768 - h - 120); g.lineTo(x + w / 2, 768 - h - 190); g.lineTo(x + w + 10, 768 - h - 120); g.fill();
    g.fillStyle = '#ffffff';
    for (let wy = 768 - h - 90; wy < 640; wy += 70) for (let wx = x + 18; wx < x + w - 30; wx += 45) {
      g.fillRect(wx, wy, 26, 36); g.fillStyle = '#9cc7e6'; g.fillRect(wx + 3, wy + 3, 20, 30); g.fillStyle = '#ffffff';
    }
    x += w + 10;
  }
  // pavement and a blossom tree
  g.fillStyle = '#e9ddd2'; g.fillRect(0, 650, 1024, 118);
  g.fillStyle = '#8a6a55'; g.fillRect(300, 380, 26, 290);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = ['#f7b6c8', '#fbcfdc', '#f39bb5', '#fde3ea'][i % 4];
    g.beginPath(); g.arc(313 + (rand() - 0.5) * 260, 360 + (rand() - 0.5) * 160, 18 + rand() * 26, 0, 7); g.fill();
  }
  return finish(c, { wrap: false });
}
