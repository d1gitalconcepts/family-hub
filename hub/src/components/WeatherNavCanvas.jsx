import { useEffect, useRef } from 'react';

function weatherKind(code) {
  if (code == null) return 'clear';
  if (code === 0 || code === 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 65 || code === 67 || code === 82) return 'heavy-rain';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
  if (code >= 95) return 'storm';
  return 'clear';
}

const SIN_A = Math.sin(Math.PI / 10);
const COS_A = Math.cos(Math.PI / 10);

function makeParticles(kind, w, h) {
  if (kind === 'drizzle') {
    return Array.from({ length: 22 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 6 + Math.random() * 6,
      speed: 3 + Math.random() * 2,
      alpha: 0.3 + Math.random() * 0.3,
    }));
  }
  if (kind === 'rain') {
    return Array.from({ length: 38 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 10 + Math.random() * 10,
      speed: 6 + Math.random() * 4,
      alpha: 0.35 + Math.random() * 0.35,
    }));
  }
  if (kind === 'heavy-rain' || kind === 'storm') {
    return Array.from({ length: 58 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 14 + Math.random() * 14,
      speed: 9 + Math.random() * 5,
      alpha: 0.4 + Math.random() * 0.4,
    }));
  }
  if (kind === 'snow') {
    return Array.from({ length: 28 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 1.5 + Math.random() * 2.5,
      speed: 0.6 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.5 + Math.random() * 0.4,
    }));
  }
  if (kind === 'partly') {
    return Array.from({ length: 6 }, (_, i) => ({
      x: (w / 7) * (i + 1) + (Math.random() - 0.5) * 20,
      y: 4 + Math.random() * (h * 0.4),
      r: 8 + Math.random() * 10,
      speed: 0.12 + Math.random() * 0.1,
      alpha: 0.12 + Math.random() * 0.1,
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
    let particles = [];

    function resize() {
      const w = canvas.parentElement?.clientWidth || canvas.offsetWidth || 300;
      const h = canvas.parentElement?.clientHeight || canvas.offsetHeight || 48;
      canvas.width = w;
      canvas.height = h;
      particles = makeParticles(kind, w, h);
    }

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    const ANIMATED = ['partly', 'drizzle', 'rain', 'heavy-rain', 'snow', 'storm'];
    if (!ANIMATED.includes(kind)) return () => ro.disconnect();

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (kind === 'snow') {
        for (const p of particles) {
          p.y += p.speed;
          p.x += Math.sin(p.y / 35 + p.phase) * 0.55;
          if (p.y > h) { p.y = -p.r; p.x = Math.random() * w; }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
          ctx.fill();
        }
      } else if (kind === 'partly') {
        for (const p of particles) {
          p.x += p.speed;
          if (p.x - p.r > w) p.x = -p.r;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
          ctx.fill();
        }
      } else {
        // rain / drizzle / heavy-rain / storm
        if (kind === 'storm') {
          if (Math.random() < 0.003) flashAlpha = 0.32;
          if (flashAlpha > 0) {
            ctx.fillStyle = `rgba(255,255,200,${flashAlpha})`;
            ctx.fillRect(0, 0, w, h);
            flashAlpha = Math.max(0, flashAlpha - 0.04);
          }
        }
        for (const p of particles) {
          p.y += p.speed * COS_A;
          p.x += p.speed * SIN_A;
          if (p.y > h) { p.y = -p.len; p.x = Math.random() * w; }
          if (p.x > w) { p.x = 0; }
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
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [kind]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
