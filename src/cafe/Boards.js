import * as THREE from 'three';
import { Entity } from '../core/Entity.js';
import { Registry } from '../core/Registry.js';
import { CanvasPanel } from '../ui/CanvasPanel.js';
import { heart, paw } from './textures.js';

let seed = 3;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const FONT = '"Comic Sans MS", "Chalkboard SE", "Segoe Print", "Bradley Hand", cursive, sans-serif';

/** A wobbly, hand-drawn rounded frame. */
function sketchFrame(g, x, y, w, h, r, color, width) {
  g.strokeStyle = color; g.lineWidth = width; g.lineCap = g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const j = () => (rand() - 0.5) * width * 0.8;
    g.beginPath();
    g.moveTo(x + r + j(), y + j());
    g.lineTo(x + w - r + j(), y + j()); g.quadraticCurveTo(x + w, y, x + w + j(), y + r + j());
    g.lineTo(x + w + j(), y + h - r + j()); g.quadraticCurveTo(x + w, y + h, x + w - r + j(), y + h + j());
    g.lineTo(x + r + j(), y + h + j()); g.quadraticCurveTo(x, y + h, x + j(), y + h - r + j());
    g.lineTo(x + j(), y + r + j()); g.quadraticCurveTo(x, y, x + r + j(), y + j());
    g.stroke();
  }
}

/** Text with a slight hand-lettered tilt. */
function hand(g, text, x, y, size, color, { align = 'left', bold = false, tilt = 0.015 } = {}) {
  g.save();
  g.translate(x, y); g.rotate((rand() - 0.5) * tilt * 2);
  g.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  g.restore();
}

/** A round little cat face doodle. */
function catFace(g, x, y, s, fur, { stripe = null, patch = null, eye = '#3b2b2b' } = {}) {
  g.fillStyle = fur;
  g.beginPath(); g.moveTo(x - s * 0.8, y - s * 0.3); g.lineTo(x - s * 0.62, y - s * 1.05); g.lineTo(x - s * 0.2, y - s * 0.72); g.fill();
  g.beginPath(); g.moveTo(x + s * 0.8, y - s * 0.3); g.lineTo(x + s * 0.62, y - s * 1.05); g.lineTo(x + s * 0.2, y - s * 0.72); g.fill();
  g.beginPath(); g.ellipse(x, y, s * 0.9, s * 0.78, 0, 0, Math.PI * 2); g.fill();
  if (patch) { g.fillStyle = patch; g.beginPath(); g.ellipse(x - s * 0.35, y - s * 0.3, s * 0.38, s * 0.32, 0.4, 0, Math.PI * 2); g.fill(); }
  if (stripe) { g.strokeStyle = stripe; g.lineWidth = s * 0.1; for (const dx of [-0.22, 0, 0.22]) { g.beginPath(); g.moveTo(x + dx * s, y - s * 0.75); g.lineTo(x + dx * s, y - s * 0.45); g.stroke(); } }
  g.strokeStyle = '#4a3a3a'; g.lineWidth = Math.max(1, s * 0.05); g.stroke();
  g.fillStyle = eye;
  for (const sx of [-1, 1]) {
    g.beginPath(); g.ellipse(x + sx * s * 0.34, y, s * 0.16, s * 0.21, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + sx * s * 0.34 + s * 0.05, y - s * 0.07, s * 0.06, 0, 7); g.fill(); g.fillStyle = eye;
  }
  g.fillStyle = 'rgba(246,140,170,0.6)';
  for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(x + sx * s * 0.58, y + s * 0.25, s * 0.14, s * 0.08, 0, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = '#4a3a3a'; g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath(); g.arc(x - s * 0.08, y + s * 0.25, s * 0.08, 0, Math.PI); g.arc(x + s * 0.08, y + s * 0.25, s * 0.08, 0, Math.PI); g.stroke();
}

class MenuPanel extends CanvasPanel {
  constructor(w, h) { super(w, h, 700); this.redraw(); }
  draw(g, w, h) {
    g.fillStyle = '#4f6b63'; g.fillRect(0, 0, w, h);                                     // soft green chalkboard
    g.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 300; i++) g.fillRect(rand() * w, rand() * h, 3, 1);
    sketchFrame(g, 18, 18, w - 36, h - 36, 30, '#f7d6de', 6);
    hand(g, 'MENU', w / 2, h * 0.12, h * 0.1, '#fff6e6', { align: 'center', bold: true });
    g.fillStyle = '#f6a9bb'; heart(g, w / 2 - h * 0.2, h * 0.12, h * 0.04); heart(g, w / 2 + h * 0.2, h * 0.12, h * 0.04);
    const items = [
      ['Kawa z kocią pianką', '9 zł'], ['Matcha latte', '12 zł'], ['Kakao z piankami', '10 zł'], ['Herbatka malinowa', '8 zł'],
      ['Sernik truskawkowy', '14 zł'], ['Babeczka „Łapka”', '7 zł'], ['Rogalik z masłem', '6 zł'],
    ];
    const cols = ['#fde7b0', '#bfe6d6', '#f7d6de', '#d9cff2'];
    items.forEach(([name, price], i) => {
      const y = h * (0.26 + i * 0.088);
      hand(g, name, w * 0.08, y, h * 0.055, cols[i % cols.length]);
      g.strokeStyle = 'rgba(255,246,230,0.35)'; g.setLineDash?.([4, 8]); g.lineWidth = 2;
      g.beginPath(); g.moveTo(w * 0.08 + g.measureText(name).width * 1.05 + 10, y + 6); g.lineTo(w * 0.78, y + 6); g.stroke(); g.setLineDash?.([]);
      hand(g, price, w * 0.92, y, h * 0.055, '#fff6e6', { align: 'right', bold: true });
    });
    hand(g, 'Koty nie są na sprzedaż — tylko do głaskania :)', w / 2, h * 0.9, h * 0.042, '#f7d6de', { align: 'center' });
    g.fillStyle = 'rgba(255,246,230,0.8)'; paw(g, w * 0.08, h * 0.12, h * 0.035); paw(g, w * 0.92, h * 0.12, h * 0.035);
    catFace(g, w * 0.88, h * 0.82, h * 0.05, '#fbd3b5', { stripe: '#e3a177' });
  }
}

class SignPanel extends CanvasPanel {
  constructor(w, h, text, sub) { super(w, h, 600, { transparent: true }); this.text = text; this.sub = sub; this.redraw(); }
  draw(g, w, h) {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff6e6';
    g.beginPath(); if (g.roundRect) g.roundRect(6, 6, w - 12, h - 12, h * 0.4); else g.rect(6, 6, w - 12, h - 12); g.fill();
    sketchFrame(g, 14, 14, w - 28, h - 28, h * 0.35, '#f6a9bb', 7);
    hand(g, this.text, w / 2, h * (this.sub ? 0.42 : 0.52), h * 0.36, '#c4637f', { align: 'center', bold: true });
    if (this.sub) hand(g, this.sub, w / 2, h * 0.78, h * 0.16, '#7a9c8f', { align: 'center' });
    catFace(g, h * 0.45, h * 0.52, h * 0.24, '#fde7b0', { stripe: '#e8b866' });
    catFace(g, w - h * 0.45, h * 0.52, h * 0.24, '#d9d6dc', { patch: '#8f8a92' });
  }
}

class CatsPanel extends CanvasPanel {
  constructor(w, h, cats) { super(w, h, 600); this.cats = cats; this.redraw(); }
  draw(g, w, h) {
    g.fillStyle = '#fff6e6'; g.fillRect(0, 0, w, h);
    sketchFrame(g, 14, 14, w - 28, h - 28, 26, '#bfaee8', 6);
    hand(g, 'Poznaj nasze koty', w / 2, h * 0.09, h * 0.065, '#8a6fc7', { align: 'center', bold: true });
    const n = this.cats.length, rows = Math.ceil(n / 2);
    this.cats.forEach((c, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const x = w * (0.08 + col * 0.48), y = h * (0.22 + row * (0.72 / rows));
      catFace(g, x + h * 0.04, y + h * 0.02, h * 0.045, c.coat.fur, { stripe: c.coat.pattern === 'tabby' ? c.coat.stripe : null, patch: c.coat.patch ?? (c.coat.pattern === 'tuxedo' ? null : null), eye: '#3b2b2b' });
      hand(g, c.name, x + h * 0.11, y - h * 0.005, h * 0.045, '#c4637f', { bold: true });
      hand(g, c.trait, x + h * 0.11, y + h * 0.045, h * 0.03, '#6b5a55');
      if (c.note) hand(g, c.note, x + h * 0.11, y + h * 0.085, h * 0.026, '#7a9c8f');
    });
  }
}

class HowToPanel extends CanvasPanel {
  constructor(w, h) { super(w, h, 600); this.redraw(); }
  draw(g, w, h) {
    g.fillStyle = '#fdeef2'; g.fillRect(0, 0, w, h);
    sketchFrame(g, 14, 14, w - 28, h - 28, 26, '#97d1bb', 6);
    hand(g, 'Jak się bawić?', w / 2, h * 0.1, h * 0.075, '#4f8a74', { align: 'center', bold: true });
    const lines = [
      '♥ Głaskanie: otwarta dłoń, bez chwytania –',
      '   przesuwaj ją po grzbiecie lub główce kota.',
      '♥ Wędka z piórkiem: chwyć i machaj nisko.',
      '♥ Laser: chwyć, spust włącza kropkę.',
      '♥ Włóczka i szeleścik: rzuć po podłodze.',
      '♥ Karma: przechyl worek nad miską.',
      '♥ Smakołyk: sięgnij do słoika, wyciągnij',
      '   rękę do kota i poczekaj chwilkę.',
      '♥ Śpiących kotów nie budzimy :)',
    ];
    lines.forEach((t, i) => hand(g, t, w * 0.07, h * (0.23 + i * 0.083), h * 0.045, '#6b5a55', { tilt: 0.006 }));
  }
}

/** A wall board: a canvas panel mounted on a soft wooden backing. def: { type, position, rotationY, size } */
class Board extends Entity {
  constructor(world, def, panel) {
    super(world);
    const [w, h] = def.size;
    if (def.frame !== 'none') {
      const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.03), new THREE.MeshLambertMaterial({ color: def.frame ?? '#e3b98a' }));
      back.position.z = -0.016;
      this.object3D.add(back);
    }
    panel.mesh.position.z = 0.001;
    this.object3D.add(panel.mesh);
    this.object3D.position.set(...def.position);
    this.object3D.rotation.y = THREE.MathUtils.degToRad(def.rotationY ?? 0);
  }
}

export const boardRegistry = new Registry('board type')
  .register('MenuBoard', (w, d) => new Board(w, d, new MenuPanel(...d.size)))
  .register('CafeSign', (w, d) => new Board(w, d, new SignPanel(...d.size, d.text ?? 'Kocia Kawiarnia', d.sub ?? '')))
  .register('CatsBoard', (w, d) => new Board(w, d, new CatsPanel(...d.size, w.config.cats.cats)))
  .register('HowToBoard', (w, d) => new Board(w, d, new HowToPanel(...d.size)));
