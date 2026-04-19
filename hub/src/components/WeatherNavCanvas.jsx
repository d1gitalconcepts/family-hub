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
        return Array.from({ length: 6 }, () => ({
          x: (Math.random() - 0.1) * cw * 1.3,
          y: 5 + Math.random() * Math.max(1, ch - 10),
          r: 22 + Math.random() * 28,
          speed: 0.10 + Math.random() * 0.18,
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
          if (p.x - p.r > cw) p.x = -p.r;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, 'rgba(205,210,220,0.22)');
          g.addColorStop(1, 'rgba(205,210,220,0)');
          ctx.beginPath();
          ctx.fillStyle = g;
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
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
