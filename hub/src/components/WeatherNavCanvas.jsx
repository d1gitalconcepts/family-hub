import { useRef, useEffect } from 'react';

function weatherKind(code) {
  if (code == null || code <= 1)                                                              return 'clear';
  if (code === 2)                                                                             return 'partly';
  if (code === 3)                                                                             return 'overcast';
  if (code === 45 || code === 48)                                                             return 'fog';
  if (code === 51 || code === 53 || code === 55)                                              return 'drizzle';
  if (code === 65 || code === 82)                                                             return 'heavy-rain';
  if (code === 61 || code === 63 || code === 80 || code === 81)                               return 'rain';
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return 'snow';
  if (code === 95 || code === 96 || code === 99)                                              return 'storm';
  return 'clear';
}

function drawCloud(ctx, cx, cy, r) {
  // Wide flat base + 3 bumps on top — gives a cumulus silhouette
  const blobs = [
    [0,          r * 0.14,  r * 1.0,  r * 0.50],  // base body
    [-r * 0.40, -r * 0.06,  r * 0.60, r * 0.52],  // left bump
    [ r * 0.40, -r * 0.06,  r * 0.60, r * 0.52],  // right bump
    [-r * 0.16, -r * 0.28,  r * 0.48, r * 0.44],  // top-left
    [ r * 0.20, -r * 0.26,  r * 0.44, r * 0.40],  // top-right
  ];
  for (const [dx, dy, rx, ry] of blobs) {
    const x = cx + dx, y = cy + dy;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0,   'rgba(215,222,235,0.24)');
    g.addColorStop(0.55,'rgba(215,222,235,0.14)');
    g.addColorStop(1,   'rgba(215,222,235,0)');
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }
}

const RAIN_ANGLE = Math.PI / 10; // 18° lean
const SIN_A = Math.sin(RAIN_ANGLE);
const COS_A = Math.cos(RAIN_ANGLE);

export default function WeatherNavCanvas({ code }) {
  const canvasRef = useRef(null);
  const kind = weatherKind(code);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Only particle-animate these kinds; others are gradient-only
    const ANIMATED = new Set(['partly', 'drizzle', 'rain', 'heavy-rain', 'snow', 'storm']);
    if (!ANIMATED.has(kind)) return;

    const ctx = canvas.getContext('2d');
    let rafId;
    let flashAlpha = 0;

    function resize() {
      const p = canvas.parentElement;
      canvas.width  = (p ? p.clientWidth  : canvas.offsetWidth)  || 400;
      canvas.height = (p ? p.clientHeight : canvas.offsetHeight) || 45;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    const w = () => canvas.width;
    const h = () => canvas.height;

    function makeParticles() {
      const cw = w(), ch = h();
      if (kind === 'drizzle') {
        return Array.from({ length: 22 }, () => ({
          x: Math.random() * cw, y: Math.random() * ch,
          speed: 2 + Math.random() * 2, len: 5 + Math.random() * 5,
        }));
      }
      if (kind === 'rain') {
        return Array.from({ length: 38 }, () => ({
          x: Math.random() * cw, y: Math.random() * ch,
          speed: 5 + Math.random() * 4, len: 9 + Math.random() * 7,
        }));
      }
      if (kind === 'heavy-rain' || kind === 'storm') {
        return Array.from({ length: 58 }, () => ({
          x: Math.random() * cw, y: Math.random() * ch,
          speed: 7 + Math.random() * 5, len: 11 + Math.random() * 8,
        }));
      }
      if (kind === 'snow') {
        return Array.from({ length: 28 }, () => ({
          x: Math.random() * cw, y: Math.random() * ch,
          speed: 0.45 + Math.random() * 1.1,
          size:  1 + Math.random() * 2,
          phase: Math.random() * Math.PI * 2,
        }));
      }
      if (kind === 'partly') {
        return Array.from({ length: 5 }, (_, i) => ({
          x: (cw / 5) * i + (Math.random() - 0.5) * (cw / 5),
          y: ch * 0.5 + (Math.random() - 0.5) * ch * 0.3,
          r: 18 + Math.random() * 20,
          speed: 0.08 + Math.random() * 0.14,
        }));
      }
      return [];
    }

    const particles = makeParticles();

    function draw() {
      const cw = w(), ch = h();
      ctx.clearRect(0, 0, cw, ch);

      if (kind === 'partly') {
        for (const p of particles) {
          p.x += p.speed;
          if (p.x - p.r * 2 > cw) p.x = -p.r * 2;
          drawCloud(ctx, p.x, p.y, p.r);
        }

      } else if (kind === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (const p of particles) {
          p.y += p.speed;
          p.x += Math.sin(p.y / 35 + p.phase) * 0.55;
          if (p.y > ch + p.size) { p.y = -p.size; p.x = Math.random() * cw; }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }

      } else {
        // drizzle / rain / heavy-rain / storm
        const alpha = kind === 'drizzle' ? 0.28 : 0.44;
        ctx.strokeStyle = `rgba(180,215,255,${alpha})`;
        ctx.lineWidth   = kind === 'drizzle' ? 0.8 : 1;
        ctx.beginPath();
        for (const p of particles) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - SIN_A * p.len, p.y + COS_A * p.len);
          p.y += p.speed * COS_A;
          p.x -= p.speed * SIN_A;
          if (p.y > ch + p.len) { p.y = -p.len; p.x = Math.random() * cw; }
        }
        ctx.stroke();

        if (kind === 'storm') {
          if (Math.random() < 0.003) flashAlpha = 0.32;
          if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(248,248,195,${flashAlpha.toFixed(2)})`;
            ctx.fillRect(0, 0, cw, ch);
            flashAlpha = Math.max(0, flashAlpha - 0.04);
          }
        }
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [kind]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
