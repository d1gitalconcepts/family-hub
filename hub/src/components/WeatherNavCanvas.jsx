import { useEffect, useRef } from 'react';

function weatherKind(code) {
  if (code == null || code <= 1)                                                              return 'clear';
  if (code === 2)                                                                             return 'partly';
  if (code === 3)                                                                             return 'overcast';
  if (code === 45 || code === 48)                                                             return 'fog';
  if (code === 51 || code === 53 || code === 55)                                              return 'drizzle';
  if (code === 65 || code === 67 || code === 82)                                              return 'heavy-rain';
  if (code === 61 || code === 63 || code === 80 || code === 81)                               return 'rain';
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return 'snow';
  if (code === 95 || code === 96 || code === 99)                                              return 'storm';
  return 'clear';
}

// Large slow-drifting translucent blobs — give every condition a living background
function makeFogLayers(w, h) {
  return Array.from({ length: 4 }, () => ({
    x:     Math.random() * w * 1.2 - w * 0.1,
    baseY: h * (0.2 + Math.random() * 0.6),
    r:     Math.max(w, h) * (0.55 + Math.random() * 0.55),
    dx:    (Math.random() < 0.5 ? 1 : -1) * (0.04 + Math.random() * 0.07),
    phase: Math.random() * Math.PI * 2,
    alpha: 0.055 + Math.random() * 0.045,
  }));
}

function drawCloud(ctx, cx, cy, r) {
  const blobs = [
    [0,          r * 0.12,  r * 1.00, r * 0.52],
    [-r * 0.42, -r * 0.05,  r * 0.65, r * 0.56],
    [ r * 0.42, -r * 0.05,  r * 0.65, r * 0.56],
    [-r * 0.20, -r * 0.30,  r * 0.52, r * 0.48],
    [ r * 0.22, -r * 0.28,  r * 0.48, r * 0.44],
  ];
  for (const [dx, dy, rx, ry] of blobs) {
    const x = cx + dx, y = cy + dy;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0,    'rgba(210,220,235,0.38)');
    g.addColorStop(0.50, 'rgba(210,220,235,0.22)');
    g.addColorStop(1,    'rgba(210,220,235,0)');
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
}

// Clouds as drifting clusters — each cluster has a shared position + child offsets
function makeCloudClusters(w, h) {
  return Array.from({ length: 3 }, (_, i) => ({
    x:      (w / 3) * i + (Math.random() - 0.3) * (w / 3),
    y:      h * 0.5 + (Math.random() - 0.5) * h * 0.15,
    speed:  0.06 + Math.random() * 0.10,
    clouds: Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => ({
      dx: (Math.random() - 0.5) * 90,
      dy: (Math.random() - 0.5) * h * 0.35,
      r:  16 + Math.random() * 22,
    })),
  }));
}

function drawSun(ctx, cx, cy, r, t) {
  const pulse = 1 + Math.sin(t * 0.018) * 0.04;

  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 7);
  glow.addColorStop(0,   'rgba(255,220,90,0.20)');
  glow.addColorStop(0.4, 'rgba(255,195,70,0.09)');
  glow.addColorStop(1,   'rgba(255,170,40,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 7, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Rays (slowly rotating)
  const rayAngleOffset = t * 0.004;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rayAngleOffset;
    const inner = r * 1.45 * pulse, outer = r * 2.3 * pulse;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
    ctx.strokeStyle = 'rgba(255,215,80,0.50)';
    ctx.stroke();
  }

  // Core
  const core = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r * pulse);
  core.addColorStop(0,   'rgba(255,245,190,0.92)');
  core.addColorStop(0.6, 'rgba(255,210,80,0.78)');
  core.addColorStop(1,   'rgba(255,175,40,0.50)');
  ctx.beginPath();
  ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
  ctx.fillStyle = core;
  ctx.fill();
}

const SIN_A = Math.sin(Math.PI / 10);
const COS_A = Math.cos(Math.PI / 10);

function makeParticles(kind, w, h) {
  if (kind === 'drizzle') {
    return Array.from({ length: 22 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      len: 6 + Math.random() * 6, speed: 3 + Math.random() * 2,
      alpha: 0.30 + Math.random() * 0.30,
    }));
  }
  if (kind === 'rain') {
    return Array.from({ length: 38 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      len: 10 + Math.random() * 10, speed: 6 + Math.random() * 4,
      alpha: 0.35 + Math.random() * 0.35,
    }));
  }
  if (kind === 'heavy-rain' || kind === 'storm') {
    return Array.from({ length: 58 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      len: 14 + Math.random() * 14, speed: 9 + Math.random() * 5,
      alpha: 0.40 + Math.random() * 0.40,
    }));
  }
  if (kind === 'snow') {
    return Array.from({ length: 28 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: 1.5 + Math.random() * 2.5, speed: 0.6 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2, alpha: 0.50 + Math.random() * 0.40,
    }));
  }
  return [];
}

export default function WeatherNavCanvas({ code }) {
  const canvasRef = useRef(null);
  const kind = weatherKind(code);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animId;
    let flashAlpha = 0;
    let t = 0;
    let particles = [];
    let fogLayers = [];
    let cloudClusters = [];

    function resize() {
      const w = canvas.parentElement?.clientWidth  || canvas.offsetWidth  || 300;
      const h = canvas.parentElement?.clientHeight || canvas.offsetHeight || 48;
      canvas.width  = w;
      canvas.height = h;
      particles      = makeParticles(kind, w, h);
      fogLayers      = makeFogLayers(w, h);
      cloudClusters  = kind === 'partly' ? makeCloudClusters(w, h) : [];
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    function draw() {
      const w = canvas.width, h = canvas.height;
      t++;
      ctx.clearRect(0, 0, w, h);

      // Fog background — slow drifting blobs, all conditions
      for (const f of fogLayers) {
        f.x += f.dx;
        if (f.x > w + f.r) f.x = -f.r;
        if (f.x < -f.r)    f.x =  w + f.r;
        const fy = f.baseY + Math.sin(t * 0.004 + f.phase) * h * 0.18;
        const g = ctx.createRadialGradient(f.x, fy, 0, f.x, fy, f.r);
        g.addColorStop(0, `rgba(255,255,255,${f.alpha})`);
        g.addColorStop(1,  'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(f.x, fy, f.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      if (kind === 'clear') {
        drawSun(ctx, w * 0.84, h * 0.5, h * 0.28, t);

      } else if (kind === 'partly') {
        for (const cluster of cloudClusters) {
          cluster.x += cluster.speed;
          if (cluster.x - 120 > w) cluster.x = -120;
          for (const c of cluster.clouds) {
            drawCloud(ctx, cluster.x + c.dx, cluster.y + c.dy, c.r);
          }
        }

      } else if (kind === 'snow') {
        for (const p of particles) {
          p.y += p.speed;
          p.x += Math.sin(p.y / 35 + p.phase) * 0.55;
          if (p.y > h + p.r) { p.y = -p.r; p.x = Math.random() * w; }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
          ctx.fill();
        }

      } else if (kind === 'drizzle' || kind === 'rain' || kind === 'heavy-rain' || kind === 'storm') {
        if (kind === 'storm') {
          if (Math.random() < 0.003) flashAlpha = 0.32;
          if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(248,248,195,${flashAlpha.toFixed(2)})`;
            ctx.fillRect(0, 0, w, h);
            flashAlpha = Math.max(0, flashAlpha - 0.04);
          }
        }
        for (const p of particles) {
          p.y += p.speed * COS_A;
          p.x += p.speed * SIN_A;
          if (p.y > h + p.len) { p.y = -p.len; p.x = Math.random() * w; }
          if (p.x > w) p.x = 0;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.len * SIN_A, p.y - p.len * COS_A);
          ctx.strokeStyle = `rgba(180,210,255,${p.alpha})`;
          ctx.lineWidth = kind === 'heavy-rain' || kind === 'storm' ? 1.5 : 1;
          ctx.stroke();
        }
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [kind]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
