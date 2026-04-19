import { useEffect, useRef } from 'react';

function getMoonPhase() {
  const KNOWN_NEW_MOON_MS = new Date('2000-01-06T18:14:00Z').getTime();
  const LUNAR_CYCLE_MS = 29.530589 * 24 * 60 * 60 * 1000;
  return ((Date.now() - KNOWN_NEW_MOON_MS) % LUNAR_CYCLE_MS) / LUNAR_CYCLE_MS;
}

function makeFogLayers(w, h) {
  return Array.from({ length: 4 }, () => ({
    x:     Math.random() * w * 1.2 - w * 0.1,
    baseY: h * (0.2 + Math.random() * 0.6),
    r:     Math.max(w, h) * (0.55 + Math.random() * 0.55),
    dx:    (Math.random() < 0.5 ? 1 : -1) * (0.03 + Math.random() * 0.05),
    phase: Math.random() * Math.PI * 2,
    alpha: 0.045 + Math.random() * 0.035,
  }));
}

function makeStars(w, h) {
  return Array.from({ length: 48 }, () => ({
    x:      Math.random() * w,
    y:      Math.random() * h,
    r:      0.4 + Math.random() * 1.0,
    alpha:  0.18 + Math.random() * 0.42,
    phase:  Math.random() * Math.PI * 2,
  }));
}

function drawMoon(ctx, cx, cy, r, phase) {
  const LIT  = 'rgba(238,230,185,0.90)';
  const DARK = 'rgba(22,16,44,0.72)';
  const waxing = phase <= 0.5;
  // ex: negative = crescent, 0 = quarter, positive = gibbous
  const ex = -r * Math.cos(phase * 2 * Math.PI);

  // Soft glow halo
  const glow = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 5.5);
  glow.addColorStop(0,   'rgba(175,155,255,0.18)');
  glow.addColorStop(0.5, 'rgba(130,100,220,0.07)');
  glow.addColorStop(1,   'rgba(100,70,200,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 5.5, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Moon disk — clip so dark/lit fills stay inside
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = DARK;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

  // Lit semicircle (right=waxing, left=waning)
  ctx.fillStyle = LIT;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
  ctx.closePath();
  ctx.fill();

  // Terminator ellipse
  const absEx = Math.abs(ex);
  if (absEx > 0.5) {
    // gibbous: paint lit on dark side; crescent: paint dark on lit side
    ctx.fillStyle = ex > 0 ? LIT : DARK;
    // ellipse goes on the dark side for gibbous, lit side for crescent
    const rightSide = (ex > 0 && !waxing) || (ex < 0 && waxing);
    ctx.beginPath();
    ctx.ellipse(cx, cy, absEx, r, 0, -Math.PI / 2, Math.PI / 2, !rightSide);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export default function TwilightNavCanvas() {
  const canvasRef = useRef(null);
  const phase = getMoonPhase();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animId, t = 0;
    let fogLayers = [], stars = [];

    function resize() {
      const w = canvas.parentElement?.clientWidth  || canvas.offsetWidth  || 300;
      const h = canvas.parentElement?.clientHeight || canvas.offsetHeight || 48;
      canvas.width  = w;
      canvas.height = h;
      fogLayers = makeFogLayers(w, h);
      stars     = makeStars(w, h);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    function draw() {
      const w = canvas.width, h = canvas.height;
      t++;
      ctx.clearRect(0, 0, w, h);

      // Slow violet fog wisps
      for (const f of fogLayers) {
        f.x += f.dx;
        if (f.x > w + f.r) f.x = -f.r;
        if (f.x < -f.r)    f.x =  w + f.r;
        const fy = f.baseY + Math.sin(t * 0.004 + f.phase) * h * 0.18;
        const g = ctx.createRadialGradient(f.x, fy, 0, f.x, fy, f.r);
        g.addColorStop(0, `rgba(110,65,210,${f.alpha})`);
        g.addColorStop(1, 'rgba(80,40,180,0)');
        ctx.beginPath();
        ctx.arc(f.x, fy, f.r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Twinkling stars
      for (const s of stars) {
        const a = s.alpha * (0.65 + 0.35 * Math.sin(t * 0.025 + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        ctx.fill();
      }

      // Moon — right side of bar, vertically centered
      drawMoon(ctx, w * 0.84, h * 0.5, h * 0.28, phase);

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [phase]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
