// Papéis de parede animados (canvas): ficam atrás do conteúdo, sem capturar cliques.
// Pausam com a aba em segundo plano e viram uma imagem parada quando o movimento está reduzido.
import { useEffect, useRef } from 'react';

export const WALLPAPERS = [
  { key: 'nenhum', label: 'Nenhum', hint: 'Fundo liso' },
  { key: 'aurora', label: 'Aurora', hint: 'Luzes coloridas que se movem devagar' },
  { key: 'constelacao', label: 'Constelação', hint: 'Pontos que se ligam e seguem o mouse' },
  { key: 'bolhas', label: 'Bolhas de luz', hint: 'Círculos que sobem e vão surgindo' },
  { key: 'ondas', label: 'Ondas', hint: 'Camadas de ondas em movimento' },
  { key: 'estrelas', label: 'Céu estrelado', hint: 'Estrelas piscando e estrelas cadentes' },
  { key: 'formas', label: 'Formas flutuantes', hint: 'Figuras geométricas girando' }
] as const;
export type WallpaperKind = (typeof WALLPAPERS)[number]['key'];

type RGB = [number, number, number];
const hexToRgb = (hex: string): RGB => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a})`;
/** Gira o matiz para gerar cores que combinam com a cor principal. */
function shiftHue([r, g, b]: RGB, deg: number): RGB {
  const max = Math.max(r, g, b) / 255,
    min = Math.min(r, g, b) / 255;
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    const R = r / 255,
      G = g / 255,
      B = b / 255;
    h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [a, bb, cc] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((a + m) * 255), Math.round((bb + m) * 255), Math.round((cc + m) * 255)];
}

interface Scene {
  resize(w: number, h: number): void;
  draw(ctx: CanvasRenderingContext2D, t: number, dt: number): void;
}
interface Opts {
  palette: RGB[];
  dark: boolean;
  alpha: number; // intensidade 0..1
  mouse: { x: number; y: number; active: boolean };
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function aurora(o: Opts): Scene {
  let w = 0,
    h = 0;
  const blobs = o.palette.concat(o.palette.slice(0, 2)).map((c, i) => ({ c, phase: i * 1.7, speed: rand(0.04, 0.08), r: rand(0.35, 0.55) }));
  return {
    resize: (W, H) => ((w = W), (h = H)),
    draw(ctx, t) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = o.dark ? 'lighter' : 'source-over';
      for (const b of blobs) {
        const x = w * (0.5 + 0.42 * Math.sin(t * b.speed + b.phase));
        const y = h * (0.5 + 0.38 * Math.cos(t * b.speed * 0.8 + b.phase * 1.3));
        const r = Math.max(w, h) * b.r * (0.9 + 0.1 * Math.sin(t * 0.3 + b.phase));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(b.c, 0.42 * o.alpha));
        g.addColorStop(1, rgba(b.c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  };
}

function constelacao(o: Opts): Scene {
  let w = 0,
    h = 0;
  let pts: { x: number; y: number; vx: number; vy: number; born: number; c: RGB }[] = [];
  return {
    resize(W, H) {
      w = W;
      h = H;
      const n = Math.min(110, Math.round((W * H) / 14000));
      pts = Array.from({ length: n }, (_, i) => ({ x: rand(0, W), y: rand(0, H), vx: rand(-0.25, 0.25), vy: rand(-0.25, 0.25), born: i * 0.04, c: o.palette[i % o.palette.length] }));
    },
    draw(ctx, t, dt) {
      ctx.clearRect(0, 0, w, h);
      const max = 140;
      for (const p of pts) {
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        if (o.mouse.active) {
          const dx = o.mouse.x - p.x,
            dy = o.mouse.y - p.y,
            d = Math.hypot(dx, dy);
          if (d < 180 && d > 1) {
            p.x += (dx / d) * 0.35;
            p.y += (dy / d) * 0.35;
          }
        }
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;
      }
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const fa = Math.min(1, Math.max(0, t - a.born)); // vão aparecendo aos poucos
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < max) {
            ctx.strokeStyle = rgba(a.c, (1 - d / max) * 0.45 * o.alpha * fa);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        ctx.fillStyle = rgba(a.c, 0.85 * o.alpha * fa);
        ctx.beginPath();
        ctx.arc(a.x, a.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
}

function bolhas(o: Opts): Scene {
  let w = 0,
    h = 0;
  type B = { x: number; y: number; r: number; v: number; sway: number; c: RGB; life: number };
  let list: B[] = [];
  const spawn = (fromBottom: boolean): B => ({
    x: rand(0, w),
    y: fromBottom ? h + rand(20, 200) : rand(0, h),
    r: rand(10, 60),
    v: rand(0.15, 0.5),
    sway: rand(0, Math.PI * 2),
    c: o.palette[Math.floor(rand(0, o.palette.length))],
    life: 0
  });
  return {
    resize(W, H) {
      w = W;
      h = H;
      list = Array.from({ length: Math.min(45, Math.round(W / 34)) }, () => spawn(false));
    },
    draw(ctx, t, dt) {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        b.life = Math.min(1, b.life + dt * 0.4); // surge devagar
        b.y -= b.v * dt * 60;
        const x = b.x + Math.sin(t * 0.6 + b.sway) * 18;
        if (b.y < -b.r * 2) list[i] = spawn(true);
        const g = ctx.createRadialGradient(x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.1, x, b.y, b.r);
        g.addColorStop(0, rgba([255, 255, 255], 0.35 * o.alpha * b.life));
        g.addColorStop(0.35, rgba(b.c, 0.28 * o.alpha * b.life));
        g.addColorStop(1, rgba(b.c, 0.04 * o.alpha * b.life));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = rgba(b.c, 0.3 * o.alpha * b.life);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  };
}

function ondas(o: Opts): Scene {
  let w = 0,
    h = 0;
  const layers = [0, 1, 2, 3, 4].map((i) => ({ amp: 18 + i * 9, len: 0.0035 + i * 0.0009, speed: 0.25 + i * 0.12, base: 0.58 + i * 0.085, c: o.palette[i % o.palette.length] }));
  return {
    resize: (W, H) => ((w = W), (h = H)),
    draw(ctx, t) {
      ctx.clearRect(0, 0, w, h);
      for (const [i, L] of layers.entries()) {
        const appear = Math.min(1, Math.max(0, t * 0.8 - i * 0.35));
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w + 10; x += 10) {
          const y = h * L.base + Math.sin(x * L.len + t * L.speed + i) * L.amp + Math.sin(x * L.len * 2.3 - t * L.speed * 0.7) * L.amp * 0.35;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, h * (L.base - 0.1), 0, h);
        g.addColorStop(0, rgba(L.c, 0.22 * o.alpha * appear));
        g.addColorStop(1, rgba(L.c, 0.05 * o.alpha * appear));
        ctx.fillStyle = g;
        ctx.fill();
      }
    }
  };
}

function estrelas(o: Opts): Scene {
  let w = 0,
    h = 0;
  let stars: { x: number; y: number; r: number; tw: number; ph: number; born: number }[] = [];
  let shooting: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
  let next = 3;
  const ink: RGB = o.dark ? [255, 255, 255] : o.palette[0];
  return {
    resize(W, H) {
      w = W;
      h = H;
      stars = Array.from({ length: Math.min(260, Math.round((W * H) / 6000)) }, () => ({ x: rand(0, W), y: rand(0, H), r: rand(0.4, 1.8), tw: rand(0.5, 2), ph: rand(0, 6), born: rand(0, 4) }));
    },
    draw(ctx, t, dt) {
      ctx.clearRect(0, 0, w, h);
      if (o.dark) {
        const g = ctx.createRadialGradient(w * 0.7, h * 0.2, 0, w * 0.7, h * 0.2, Math.max(w, h));
        g.addColorStop(0, rgba(o.palette[1], 0.16 * o.alpha));
        g.addColorStop(1, rgba(o.palette[0], 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      for (const s of stars) {
        const appear = Math.min(1, Math.max(0, (t - s.born) * 0.7));
        const a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph))) * appear;
        ctx.fillStyle = rgba(ink, a * 0.85 * o.alpha);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      next -= dt;
      if (!shooting && next <= 0) {
        shooting = { x: rand(w * 0.2, w), y: rand(0, h * 0.4), vx: -rand(7, 11), vy: rand(2.5, 4.5), life: 1 };
        next = rand(4, 9);
      }
      if (shooting) {
        const s = shooting;
        s.x += s.vx * dt * 60;
        s.y += s.vy * dt * 60;
        s.life -= dt * 0.8;
        const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
        g.addColorStop(0, rgba(ink, 0.9 * o.alpha * s.life));
        g.addColorStop(1, rgba(ink, 0));
        ctx.strokeStyle = g;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14);
        ctx.stroke();
        if (s.life <= 0 || s.x < -100 || s.y > h + 100) shooting = null;
      }
    }
  };
}

function formas(o: Opts): Scene {
  let w = 0,
    h = 0;
  type S = { x: number; y: number; size: number; rot: number; vr: number; vx: number; vy: number; sides: number; c: RGB; life: number; delay: number };
  let list: S[] = [];
  const make = (i: number): S => ({
    x: rand(0, w),
    y: rand(0, h),
    size: rand(18, 70),
    rot: rand(0, 6),
    vr: rand(-0.004, 0.004),
    vx: rand(-0.15, 0.15),
    vy: rand(-0.15, 0.15),
    sides: [0, 3, 4, 6][i % 4],
    c: o.palette[i % o.palette.length],
    life: 0,
    delay: i * 0.25
  });
  return {
    resize(W, H) {
      w = W;
      h = H;
      list = Array.from({ length: Math.min(28, Math.round(W / 55)) }, (_, i) => make(i));
    },
    draw(ctx, t, dt) {
      ctx.clearRect(0, 0, w, h);
      for (const s of list) {
        if (t > s.delay) s.life = Math.min(1, s.life + dt * 0.35);
        s.x += s.vx * dt * 60;
        s.y += s.vy * dt * 60;
        s.rot += s.vr * dt * 60;
        if (s.x < -80) s.x = w + 80;
        if (s.x > w + 80) s.x = -80;
        if (s.y < -80) s.y = h + 80;
        if (s.y > h + 80) s.y = -80;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rot);
        ctx.beginPath();
        if (s.sides === 0) ctx.arc(0, 0, s.size / 2, 0, Math.PI * 2);
        else for (let k = 0; k <= s.sides; k++) ctx[k ? 'lineTo' : 'moveTo']((Math.cos((k / s.sides) * Math.PI * 2) * s.size) / 2, (Math.sin((k / s.sides) * Math.PI * 2) * s.size) / 2);
        ctx.fillStyle = rgba(s.c, 0.09 * o.alpha * s.life);
        ctx.strokeStyle = rgba(s.c, 0.45 * o.alpha * s.life);
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  };
}

const SCENES: Record<Exclude<WallpaperKind, 'nenhum'>, (o: Opts) => Scene> = { aurora, constelacao, bolhas, ondas, estrelas, formas };

export function Wallpaper({ kind, accent, dark, intensity, still }: { kind: WallpaperKind; accent: string; dark: boolean; intensity: number; still: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || kind === 'nenhum') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const base = hexToRgb(accent);
    const opts: Opts = { palette: [base, shiftHue(base, 45), shiftHue(base, -40), shiftHue(base, 160)], dark, alpha: intensity, mouse: { x: 0, y: 0, active: false } };
    const scene = SCENES[kind](opts);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scene.resize(innerWidth, innerHeight);
    };
    resize();
    let raf = 0;
    let last = performance.now();
    const start = last;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      scene.draw(ctx, (now - start) / 1000, dt);
      raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => Object.assign(opts.mouse, { x: e.clientX, y: e.clientY, active: true });
    const onLeave = () => (opts.mouse.active = false);
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    if (still) for (let i = 1; i <= 12; i++) scene.draw(ctx, i * 2.5, 0.5); // imagem parada, já com tudo visível
    else raf = requestAnimationFrame(frame);
    addEventListener('resize', resize);
    addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [kind, accent, dark, intensity, still]);
  if (kind === 'nenhum') return null;
  return <canvas ref={ref} className="wallpaper" aria-hidden />;
}
