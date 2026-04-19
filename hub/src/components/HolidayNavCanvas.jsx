import { useEffect, useRef } from 'react';

// ─── date helpers ──────────────────────────────────────────────────────────────

function easterDate(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return new Date(year, month - 1, ((h + l - 7 * m + 114) % 31) + 1);
}

function nthWeekday(year, month0, weekday, n) {
  const d = new Date(year, month0, 1);
  return new Date(year, month0, 1 + ((weekday - d.getDay() + 7) % 7) + (n - 1) * 7);
}

function lastWeekday(year, month0, weekday) {
  const last = new Date(year, month0 + 1, 0);
  return new Date(year, month0, last.getDate() - ((last.getDay() - weekday + 7) % 7));
}

export function getActiveHoliday(testHoliday) {
  if (testHoliday) return testHoliday;
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();

  function inRange(start, end) {
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end);   e.setHours(23, 59, 59, 999);
    return now >= s && now <= e;
  }
  function offset(base, days) { const r = new Date(base); r.setDate(r.getDate() + days); return r; }

  if ((m === 12 && d >= 26) || (m === 1 && d <= 1)) return 'newyears';
  if (m === 2 && d >= 11 && d <= 14)                return 'valentines';

  if (m === 3 && d >= 14 && d <= 17)                 return 'stpatricks';
  const easter = easterDate(y);
  if (inRange(offset(easter, -3), easter))            return 'easter';

  const motherDay    = nthWeekday(y, 4, 0, 2);
  const memorialDay  = lastWeekday(y, 4, 1);
  const fatherDay    = nthWeekday(y, 5, 0, 3);
  const thanksgiving = nthWeekday(y, 10, 4, 4);

  if (inRange(offset(motherDay, -2), motherDay))       return 'mothersday';
  if (inRange(offset(memorialDay, -2), memorialDay))   return 'memorialday';
  if (inRange(offset(fatherDay, -2), fatherDay))       return 'fathersday';
  if (m === 7 && d >= 1 && d <= 4)                    return 'july4';
  if (m === 10 && d >= 25)                             return 'halloween';
  if (inRange(offset(thanksgiving, -3), thanksgiving)) return 'thanksgiving';
  if (m === 12 && d >= 11 && d <= 25)                 return 'christmas';
  return null;
}

export const HOLIDAYS = [
  { key: 'newyears',     label: "🥂 New Year's" },
  { key: 'valentines',   label: "❤️ Valentine's Day" },
  { key: 'stpatricks',   label: "🍀 St. Patrick's Day" },
  { key: 'easter',       label: '🐣 Easter' },
  { key: 'mothersday',   label: "🌸 Mother's Day" },
  { key: 'memorialday',  label: '🇺🇸 Memorial Day' },
  { key: 'fathersday',   label: "🏌️ Father's Day" },
  { key: 'july4',        label: '🎆 Fourth of July' },
  { key: 'halloween',    label: '🎃 Halloween' },
  { key: 'thanksgiving', label: '🦃 Thanksgiving' },
  { key: 'christmas',    label: '🎄 Christmas' },
];

// ─── shared ────────────────────────────────────────────────────────────────────

function rand(min, max) { return min + Math.random() * (max - min); }

function heart(ctx, cx, cy, size) {
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.25);
  ctx.bezierCurveTo(-size * 0.5, -size * 0.1, -size, size * 0.25, 0, size);
  ctx.bezierCurveTo( size, size * 0.25,  size * 0.5, -size * 0.1, 0, size * 0.25);
  ctx.closePath();
  ctx.restore();
}

function shamrockLeaf(ctx, cx, cy, r, rotation) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotation);
  ctx.beginPath(); ctx.arc(-r*0.38, 0, r*0.62, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( r*0.38, 0, r*0.62, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

function shamrock(ctx, cx, cy, r) {
  for (let i=0; i<3; i++) {
    const a = (i/3)*Math.PI*2 - Math.PI/2;
    shamrockLeaf(ctx, cx+Math.cos(a)*r*0.72, cy+Math.sin(a)*r*0.72, r*0.58, a+Math.PI/2);
  }
  ctx.lineWidth=r*0.14; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(cx, cy+r*0.2);
  ctx.bezierCurveTo(cx+r*0.15,cy+r*0.65,cx-r*0.08,cy+r*1.1,cx,cy+r*1.7); ctx.stroke();
}

function pumpkin(ctx, cx, cy, r) {
  const segs = [[-r * 0.38, r * 0.88, r * 0.62], [0, r, r * 0.78], [r * 0.38, r * 0.88, r * 0.62]];
  ctx.fillStyle = 'rgba(230,100,20,0.88)';
  for (const [dx, rx, ry] of segs) {
    ctx.beginPath(); ctx.ellipse(cx + dx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(60,100,30,0.9)';
  ctx.beginPath(); ctx.roundRect(cx - r * 0.08, cy - r - r * 0.18, r * 0.16, r * 0.22, 2); ctx.fill();
  ctx.fillStyle = 'rgba(30,15,5,0.85)';
  ctx.beginPath(); ctx.moveTo(cx - r*0.32, cy - r*0.18); ctx.lineTo(cx - r*0.16, cy - r*0.38); ctx.lineTo(cx - r*0.06, cy - r*0.18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx + r*0.06, cy - r*0.18); ctx.lineTo(cx + r*0.22, cy - r*0.38); ctx.lineTo(cx + r*0.38, cy - r*0.18); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - r*0.35, cy + r*0.2); ctx.lineTo(cx - r*0.22, cy + r*0.38); ctx.lineTo(cx - r*0.08, cy + r*0.22); ctx.lineTo(cx + r*0.08, cy + r*0.38); ctx.lineTo(cx + r*0.22, cy + r*0.22); ctx.lineTo(cx + r*0.35, cy + r*0.38); ctx.lineTo(cx + r*0.42, cy + r*0.2); ctx.fill();
}

function ghost(ctx, cx, cy, r, alpha) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(240,240,255,0.92)';
  ctx.beginPath(); ctx.arc(cx, cy - r * 0.2, r, Math.PI, 0); ctx.lineTo(cx + r, cy + r * 0.5);
  for (let i = 3; i >= 0; i--) {
    ctx.lineTo(cx + r - (2 * r / 3) * i, cy + r * 0.5 + (i % 2 === 0 ? r * 0.22 : -r * 0.22));
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(30,20,60,0.8)';
  ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.15, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.15, r * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function bat(ctx, cx, cy, r, flapPhase) {
  const flap = Math.sin(flapPhase) * 0.4;
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(25,10,45,0.85)';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo(-r,-r*(0.5+flap),-r*2.2,-r*(0.2+flap),-r*2.5,r*0.2); ctx.bezierCurveTo(-r*1.8,r*0.1,-r*0.8,r*0.3,0,0); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0,0); ctx.bezierCurveTo( r,-r*(0.5+flap), r*2.2,-r*(0.2+flap), r*2.5,r*0.2); ctx.bezierCurveTo( r*1.8,r*0.1, r*0.8,r*0.3,0,0); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0,0,r*0.5,r*0.65,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-r*0.2,-r*0.4); ctx.lineTo(-r*0.35,-r*0.75); ctx.lineTo(-r*0.05,-r*0.45); ctx.fill();
  ctx.beginPath(); ctx.moveTo( r*0.2,-r*0.4); ctx.lineTo( r*0.35,-r*0.75); ctx.lineTo( r*0.05,-r*0.45); ctx.fill();
  ctx.restore();
}

function turkey(ctx, cx, cy, r) {
  const fanColors = ['#c84000','#e06000','#c86000','#a03000','#e08000'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 4) * Math.PI - Math.PI * 0.9;
    ctx.fillStyle = fanColors[i];
    ctx.beginPath(); ctx.ellipse(cx + Math.cos(a)*r*1.1, cy - r*0.4 + Math.sin(a)*r*1.1, r*0.35, r*0.8, a + Math.PI/2, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(80,45,20,0.92)';
  ctx.beginPath(); ctx.ellipse(cx, cy, r*0.8, r*0.65, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r*0.65, cy - r*0.55, r*0.28, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(200,150,20,0.9)';
  ctx.beginPath(); ctx.moveTo(cx+r*0.88,cy-r*0.56); ctx.lineTo(cx+r*1.05,cy-r*0.48); ctx.lineTo(cx+r*0.88,cy-r*0.46); ctx.fill();
  ctx.fillStyle = 'rgba(200,30,30,0.9)';
  ctx.beginPath(); ctx.ellipse(cx+r*0.72, cy-r*0.38, r*0.08, r*0.18, 0.2, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,180,0.95)'; ctx.beginPath(); ctx.arc(cx+r*0.71,cy-r*0.58,r*0.07,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx+r*0.72,cy-r*0.58,r*0.04,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(160,100,20,0.85)'; ctx.lineWidth = r*0.1;
  ctx.beginPath(); ctx.moveTo(cx-r*0.15,cy+r*0.62); ctx.lineTo(cx-r*0.15,cy+r); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+r*0.18,cy+r*0.62); ctx.lineTo(cx+r*0.18,cy+r); ctx.stroke();
}

function drawTree(ctx, cx, cy, h) {
  const w = h * 0.65;
  ctx.fillStyle = 'rgba(25,110,40,0.88)';
  for (const [top, bot, hw] of [[cy-h,cy-h*0.55,w],[cy-h*0.65,cy-h*0.25,w*1.3],[cy-h*0.35,cy+h*0.05,w*1.6]]) {
    ctx.beginPath(); ctx.moveTo(cx,top); ctx.lineTo(cx+hw,bot); ctx.lineTo(cx-hw,bot); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(100,60,20,0.85)'; ctx.fillRect(cx - w*0.12, cy, w*0.24, h*0.22);
  const sr = h * 0.08;
  ctx.fillStyle = 'rgba(255,230,60,0.95)';
  ctx.save(); ctx.translate(cx, cy - h - sr*0.5);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i/10)*Math.PI*2 - Math.PI/2;
    const r2 = i % 2 === 0 ? sr : sr * 0.42;
    i === 0 ? ctx.moveTo(Math.cos(a)*r2, Math.sin(a)*r2) : ctx.lineTo(Math.cos(a)*r2, Math.sin(a)*r2);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function fireworkBurst(ctx, cx, cy, r, progress, hue) {
  const alpha = Math.max(0, 1 - progress * 1.2);
  const sparkLen = r * progress;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.strokeStyle = `hsla(${hue},100%,65%,${alpha.toFixed(2)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*sparkLen, cy+Math.sin(a)*sparkLen); ctx.stroke();
    if (progress > 0.3) {
      ctx.fillStyle = `hsla(${hue+30},100%,80%,${(alpha*0.6).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(cx+Math.cos(a)*sparkLen*0.7, cy+Math.sin(a)*sparkLen*0.7, 2, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.fillStyle = `hsla(${hue},100%,90%,${(alpha*0.8).toFixed(2)})`;
  ctx.beginPath(); ctx.arc(cx, cy, r*0.08*(1-progress), 0, Math.PI*2); ctx.fill();
}

function lawnmower(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(30,30,30,0.88)';
  ctx.beginPath(); ctx.arc(cx-r*0.6, cy+r*0.45, r*0.28, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+r*0.6, cy+r*0.45, r*0.28, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(160,160,160,0.8)';
  ctx.beginPath(); ctx.arc(cx-r*0.6, cy+r*0.45, r*0.14, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+r*0.6, cy+r*0.45, r*0.14, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(180,30,30,0.88)';
  ctx.beginPath(); ctx.roundRect(cx-r*0.85, cy-r*0.1, r*1.7, r*0.6, r*0.12); ctx.fill();
  ctx.fillStyle = 'rgba(130,20,20,0.9)';
  ctx.beginPath(); ctx.roundRect(cx-r*0.5, cy-r*0.42, r, r*0.38, r*0.1); ctx.fill();
  ctx.strokeStyle = 'rgba(60,60,60,0.85)'; ctx.lineWidth = r*0.1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx+r*0.5,cy-r*0.35); ctx.lineTo(cx+r*0.85,cy-r*1.0); ctx.lineTo(cx+r*1.3,cy-r*1.0); ctx.stroke();
  ctx.strokeStyle = 'rgba(80,80,80,0.8)'; ctx.lineWidth = r*0.08;
  ctx.beginPath(); ctx.moveTo(cx-r*0.42,cy-r*0.38); ctx.lineTo(cx-r*0.42,cy-r*0.62); ctx.stroke();
}

function grill(ctx, cx, cy, r) {
  ctx.strokeStyle = 'rgba(60,60,60,0.8)'; ctx.lineWidth = r*0.1;
  ctx.beginPath(); ctx.moveTo(cx-r*0.5,cy+r*0.5); ctx.lineTo(cx-r*0.7,cy+r*1.1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx+r*0.5,cy+r*0.5); ctx.lineTo(cx+r*0.7,cy+r*1.1); ctx.stroke();
  ctx.fillStyle = 'rgba(30,30,30,0.88)';
  ctx.beginPath(); ctx.arc(cx,cy,r*0.7,0,Math.PI); ctx.lineTo(cx-r*0.7,cy); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy,r*0.7,Math.PI,0); ctx.fill();
  ctx.fillStyle = 'rgba(100,100,100,0.8)';
  ctx.beginPath(); ctx.roundRect(cx-r*0.15,cy-r*0.8,r*0.3,r*0.15,4); ctx.fill();
}

function drawFlower(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  for (let i = 0; i < 6; i++) {
    const a = (i/6)*Math.PI*2;
    ctx.beginPath(); ctx.ellipse(cx+Math.cos(a)*r*0.6, cy+Math.sin(a)*r*0.6, r*0.4, r*0.28, a, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,230,60,0.95)'; ctx.beginPath(); ctx.arc(cx,cy,r*0.32,0,Math.PI*2); ctx.fill();
}

function drawButterfly(ctx, cx, cy, r, flapPhase, hue) {
  const wa = Math.abs(Math.sin(flapPhase)*0.65+0.1);
  ctx.save(); ctx.translate(cx, cy);
  // Upper wings
  ctx.fillStyle=`hsla(${hue},82%,58%,0.87)`;
  ctx.beginPath(); ctx.ellipse(-r*wa*0.62,-r*0.1,r*wa*0.68,r*0.46,-0.22,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( r*wa*0.62,-r*0.1,r*wa*0.68,r*0.46, 0.22,0,Math.PI*2); ctx.fill();
  // Lower wings
  ctx.fillStyle=`hsla(${hue+15},76%,54%,0.82)`;
  ctx.beginPath(); ctx.ellipse(-r*wa*0.52,r*0.22,r*wa*0.52,r*0.34, 0.28,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( r*wa*0.52,r*0.22,r*wa*0.52,r*0.34,-0.28,0,Math.PI*2); ctx.fill();
  // Wing spots
  if (wa>0.18) {
    ctx.fillStyle=`hsla(${hue-30},55%,22%,0.55)`;
    for (const [dx,dy] of [[-wa*r*0.58,-r*0.04],[wa*r*0.58,-r*0.04],[-wa*r*0.38,r*0.14],[wa*r*0.38,r*0.14]]) {
      ctx.beginPath(); ctx.arc(dx,dy,r*0.1,0,Math.PI*2); ctx.fill();
    }
  }
  // Body
  ctx.fillStyle=`hsla(${hue+40},60%,18%,0.92)`;
  ctx.beginPath(); ctx.ellipse(0,0,r*0.1,r*0.5,0,0,Math.PI*2); ctx.fill();
  // Antennae
  ctx.strokeStyle=`hsla(${hue+40},50%,18%,0.7)`; ctx.lineWidth=r*0.04;
  ctx.beginPath(); ctx.moveTo(-r*0.06,-r*0.42); ctx.bezierCurveTo(-r*0.18,-r*0.62,-r*0.28,-r*0.76,-r*0.14,-r*0.88); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( r*0.06,-r*0.42); ctx.bezierCurveTo( r*0.18,-r*0.62, r*0.28,-r*0.76, r*0.14,-r*0.88); ctx.stroke();
  ctx.fillStyle=`hsla(${hue},72%,46%,0.82)`;
  ctx.beginPath(); ctx.arc(-r*0.14,-r*0.90,r*0.07,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc( r*0.14,-r*0.90,r*0.07,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawHummingbird(ctx, cx, cy, r, t) {
  ctx.save(); ctx.translate(cx, cy);
  // Blurry wings (3 overlapping semi-transparent ellipses per side)
  for (let j=0; j<3; j++) {
    const wAngle = Math.sin(t*0.45+j*0.4)*0.55;
    ctx.fillStyle='rgba(80,190,100,0.18)';
    ctx.save(); ctx.rotate(-wAngle);
    ctx.beginPath(); ctx.ellipse(-r*0.58,-r*0.08,r*0.72,r*0.22,-0.3,0,Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.rotate(wAngle);
    ctx.beginPath(); ctx.ellipse( r*0.58,-r*0.08,r*0.72,r*0.22, 0.3,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  // Body (iridescent green)
  ctx.fillStyle='rgba(35,175,75,0.92)';
  ctx.beginPath(); ctx.ellipse(0,0,r*0.26,r*0.55,0.12,0,Math.PI*2); ctx.fill();
  // Tail
  ctx.fillStyle='rgba(25,130,55,0.85)';
  ctx.beginPath(); ctx.moveTo(-r*0.14,r*0.5); ctx.lineTo(-r*0.24,r*0.88); ctx.lineTo(r*0.06,r*0.85); ctx.lineTo(r*0.1,r*0.5); ctx.closePath(); ctx.fill();
  // Ruby throat
  ctx.fillStyle='rgba(210,30,30,0.88)';
  ctx.beginPath(); ctx.ellipse(0,r*0.18,r*0.17,r*0.24,0,0,Math.PI*2); ctx.fill();
  // Head
  ctx.fillStyle='rgba(30,140,60,0.94)';
  ctx.beginPath(); ctx.arc(0,-r*0.42,r*0.22,0,Math.PI*2); ctx.fill();
  // Eye
  ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(r*0.1,-r*0.44,r*0.07,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(r*0.13,-r*0.46,r*0.03,0,Math.PI*2); ctx.fill();
  // Bill
  ctx.strokeStyle='rgba(35,45,18,0.88)'; ctx.lineWidth=r*0.07; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(r*0.07,-r*0.5); ctx.lineTo(r*0.38,-r*0.84); ctx.stroke();
  ctx.restore();
}

function drawPoppy(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(210,35,35,0.88)';
  for (let i = 0; i < 4; i++) {
    const a = (i/4)*Math.PI*2;
    ctx.beginPath(); ctx.ellipse(cx+Math.cos(a)*r*0.45, cy+Math.sin(a)*r*0.45, r*0.52, r*0.38, a, 0, Math.PI*2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(20,20,20,0.88)'; ctx.beginPath(); ctx.arc(cx,cy,r*0.25,0,Math.PI*2); ctx.fill();
}

function drawFlag(ctx, cx, cy, fw, fh, wavePhase) {
  ctx.strokeStyle = 'rgba(120,100,60,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy-fh*1.6); ctx.stroke();
  const sh = fh / 13;
  const redRows = new Set([0,2,4,6,8,10,12]);
  for (let i = 0; i < 13; i++) {
    const sy = cy - fh*1.58 + i*sh;
    ctx.fillStyle = redRows.has(i) ? 'rgba(180,25,25,0.88)' : 'rgba(240,240,240,0.88)';
    ctx.beginPath(); ctx.moveTo(cx, sy);
    for (let x = 0; x <= fw; x += 4) { const wy = Math.sin(x/fw*Math.PI*1.5+wavePhase)*sh*0.3; ctx.lineTo(cx+x, sy+wy); }
    for (let x = fw; x >= 0; x -= 4) { const wy = Math.sin(x/fw*Math.PI*1.5+wavePhase)*sh*0.3; ctx.lineTo(cx+x, sy+sh+wy); }
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(25,40,130,0.9)'; ctx.fillRect(cx, cy-fh*1.58, fw*0.4, sh*7);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let row = 0; row < 5; row++) for (let col = 0; col < (row%2===0?3:2); col++) {
    ctx.beginPath(); ctx.arc(cx+fw*0.06+col*fw*0.13+(row%2===0?0:fw*0.065), cy-fh*1.52+row*sh*1.2, 1.5, 0, Math.PI*2); ctx.fill();
  }
}

function drawEgg(ctx, cx, cy, rx, ry, cols) {
  const g = ctx.createLinearGradient(cx-rx,cy-ry,cx+rx,cy+ry);
  g.addColorStop(0,cols[0]); g.addColorStop(1,cols[1]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(cx,cy-ry*0.1,rx,ry,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = `${cols[0]}88`; ctx.lineWidth = ry*0.18;
  ctx.save(); ctx.beginPath(); ctx.ellipse(cx,cy-ry*0.1,rx,ry,0,0,Math.PI*2); ctx.clip();
  for (let i=-2; i<=2; i++) { ctx.beginPath(); ctx.moveTo(cx-rx,cy-ry*0.1+i*ry*0.35); ctx.lineTo(cx+rx,cy-ry*0.1+i*ry*0.35); ctx.stroke(); }
  ctx.restore();
}

function drawBunny(ctx, cx, cy, r) {
  ctx.fillStyle = 'rgba(240,230,240,0.92)';
  ctx.beginPath(); ctx.ellipse(cx-r*0.28,cy-r*1.1,r*0.18,r*0.55,-0.15,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+r*0.28,cy-r*1.1,r*0.18,r*0.55, 0.15,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(240,180,190,0.75)';
  ctx.beginPath(); ctx.ellipse(cx-r*0.28,cy-r*1.1,r*0.09,r*0.38,-0.15,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+r*0.28,cy-r*1.1,r*0.09,r*0.38, 0.15,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(240,230,240,0.92)';
  ctx.beginPath(); ctx.ellipse(cx,cy+r*0.3,r*0.75,r*0.9,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy-r*0.15,r*0.55,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(230,160,170,0.9)'; ctx.beginPath(); ctx.arc(cx,cy-r*0.04,r*0.1,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(80,40,120,0.85)';
  ctx.beginPath(); ctx.arc(cx-r*0.22,cy-r*0.26,r*0.1,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx+r*0.22,cy-r*0.26,r*0.1,0,Math.PI*2); ctx.fill();
}

// ─── Halloween ────────────────────────────────────────────────────────────────

function initHalloween(w, h) {
  return {
    pumpkins: [
      { x: w*0.08, y: h*0.72, r: h*0.34, rock: 0,    rockDir:  1, speed: 0.002 },
      { x: w*0.18, y: h*0.78, r: h*0.26, rock: 0.3,  rockDir: -1, speed: 0.003 },
      { x: w*0.91, y: h*0.74, r: h*0.31, rock: -0.2, rockDir:  1, speed: 0.0025 },
    ],
    ghosts: [
      { x: w*0.42, baseY: h*0.42, r: h*0.28, dx: 0.18, phase: 0,   alpha: 0.88 },
      { x: w*0.72, baseY: h*0.38, r: h*0.22, dx: -0.14, phase: 1.8, alpha: 0.75 },
    ],
    bats: [
      { x: w*0.3,  y: h*0.35, r: h*0.10, dx:  0.9, flapPhase: 0.0 },
      { x: w*0.6,  y: h*0.25, r: h*0.08, dx: -0.7, flapPhase: 1.2 },
      { x: -h*0.3, y: h*0.40, r: h*0.09, dx:  0.6, flapPhase: 0.6 },
    ],
  };
}

function drawHalloween(ctx, w, h, t, s) {
  for (const b of s.bats) {
    b.x += b.dx; b.flapPhase += 0.12;
    if (b.x > w + h*0.3) b.x = -h*0.3;
    if (b.x < -h*0.3)    b.x =  w + h*0.3;
    bat(ctx, b.x, b.y, b.r, b.flapPhase);
  }
  for (const g of s.ghosts) {
    g.x += g.dx;
    if (g.x > w + g.r*2) g.x = -g.r*2;
    if (g.x < -g.r*2)    g.x =  w + g.r*2;
    ghost(ctx, g.x, g.baseY + Math.sin(t*0.022 + g.phase)*h*0.14, g.r, g.alpha);
  }
  for (const p of s.pumpkins) {
    p.rock += p.speed * p.rockDir;
    if (Math.abs(p.rock) > 0.18) p.rockDir *= -1;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rock);
    pumpkin(ctx, 0, 0, p.r);
    ctx.restore();
  }
}

// ─── Christmas ────────────────────────────────────────────────────────────────

function drawPresent(ctx, cx, cy, w2, h2, boxCol, ribbonCol) {
  // Box body
  ctx.fillStyle = boxCol;
  ctx.beginPath(); ctx.roundRect(cx-w2,cy-h2,w2*2,h2*2,w2*0.12); ctx.fill();
  // Ribbon vertical
  ctx.fillStyle = ribbonCol;
  ctx.fillRect(cx-w2*0.1,cy-h2,w2*0.2,h2*2);
  // Ribbon horizontal
  ctx.fillRect(cx-w2,cy-h2*0.14,w2*2,h2*0.28);
  // Bow loops
  ctx.beginPath(); ctx.ellipse(cx-w2*0.3,cy-h2-h2*0.35,w2*0.3,h2*0.35,-0.4,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx+w2*0.3,cy-h2-h2*0.35,w2*0.3,h2*0.35, 0.4,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx,cy-h2,h2*0.2,0,Math.PI*2); ctx.fill();
}

function initChristmas(w, h) {
  return {
    snow: Array.from({ length: 55 }, () => ({
      x: rand(0,w), y: rand(0,h), r: rand(1.2,3.2),
      speed: rand(0.25,0.7), drift: rand(-0.15,0.15), alpha: rand(0.55,0.95), phase: rand(0,Math.PI*2),
    })),
    trees: [{ x: w*0.07, cols: ['#e83030','#f8c030','#30a8e8'] }, { x: w*0.93, cols: ['#e83030','#30e860','#e830a8'] }],
    presents: [
      { x: w*0.07 - h*0.38, cy: h*0.84, w2: h*0.28, h2: h*0.25, boxCol:'rgba(220,30,30,0.92)',   ribbonCol:'rgba(255,220,30,0.97)' },
      { x: w*0.07,           cy: h*0.88, w2: h*0.24, h2: h*0.30, boxCol:'rgba(30,100,200,0.92)',  ribbonCol:'rgba(200,30,30,0.97)' },
      { x: w*0.07 + h*0.38, cy: h*0.84, w2: h*0.26, h2: h*0.27, boxCol:'rgba(30,180,80,0.92)',   ribbonCol:'rgba(255,200,20,0.97)' },
      { x: w*0.93 - h*0.38, cy: h*0.84, w2: h*0.26, h2: h*0.28, boxCol:'rgba(180,30,180,0.92)',  ribbonCol:'rgba(255,255,255,0.97)' },
      { x: w*0.93,           cy: h*0.88, w2: h*0.24, h2: h*0.30, boxCol:'rgba(220,130,20,0.92)',  ribbonCol:'rgba(30,60,200,0.97)'  },
      { x: w*0.93 + h*0.38, cy: h*0.84, w2: h*0.28, h2: h*0.25, boxCol:'rgba(200,30,100,0.92)',  ribbonCol:'rgba(30,200,80,0.97)'  },
    ],
  };
}

function getChristmasProgress(isTest, t) {
  if (isTest) return (t % 900) / 900;
  const now = new Date();
  const m = now.getMonth() + 1, d = now.getDate();
  if (m !== 12 || d < 18) return 0;
  if (d >= 25) return 1;
  return (d - 18) / 7;
}

function drawChristmas(ctx, w, h, t, s, isTest) {
  const th = h * 0.85;
  for (const { x, cols } of s.trees) {
    drawTree(ctx, x, h*0.92, th);
    const pos = [[x-th*0.28,h*0.92-th*0.1],[x+th*0.18,h*0.92-th*0.28],[x-th*0.1,h*0.92-th*0.48]];
    pos.forEach(([ox,oy],i) => { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.arc(ox,oy,th*0.07,0,Math.PI*2); ctx.fill(); });
  }
  const xmasProgress = getChristmasProgress(isTest, t);
  s.presents.forEach((p, i) => {
    const threshold = i / s.presents.length;
    if (xmasProgress <= threshold) return;
    const scale = Math.min(1, (xmasProgress - threshold) / (1 / s.presents.length));
    drawPresent(ctx, p.x, p.cy, p.w2 * scale, p.h2 * scale, p.boxCol, p.ribbonCol);
  });
  for (const f of s.snow) {
    f.y += f.speed; f.x += f.drift + Math.sin(t*0.015 + f.phase)*0.2;
    if (f.y > h + f.r) { f.y = -f.r; f.x = rand(0,w); }
    if (f.x > w + f.r) f.x = -f.r; if (f.x < -f.r) f.x = w + f.r;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${f.alpha.toFixed(2)})`; ctx.fill();
  }
}

// ─── New Year's ───────────────────────────────────────────────────────────────

function getBallProgress() {
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth(), d = now.getDate();
  if (mo === 0 && d === 1) return 1.0;
  // Ball sits at left Dec 26-30, starts moving Dec 31 morning, reaches right at midnight
  const dec31 = new Date(y, 11, 31).getTime();
  const jan1  = new Date(y + 1, 0, 1).getTime();
  return Math.min(1, Math.max(0, (Date.now() - dec31) / (jan1 - dec31)));
}

function initNewYears(w, h) {
  return {
    confetti: Array.from({ length: 60 }, () => ({
      x: rand(0,w), y: rand(-h,h*2), vx: rand(-1,1), vy: rand(0.5,2),
      r: rand(2,5), hue: Math.floor(rand(0,360)), alpha: rand(0.6,1), active: false,
    })),
    bursts: [],
    midnight: false,
  };
}

function drawTimesSquareBall(ctx, cx, cy, r, t) {
  // Outer glow
  const glow = ctx.createRadialGradient(cx, cy, r*0.4, cx, cy, r*2.8);
  glow.addColorStop(0, 'rgba(180,180,255,0.30)');
  glow.addColorStop(1, 'rgba(100,100,255,0)');
  ctx.beginPath(); ctx.arc(cx, cy, r*2.8, 0, Math.PI*2); ctx.fillStyle=glow; ctx.fill();

  // Silver ball base
  const ballGrad = ctx.createRadialGradient(cx-r*0.32, cy-r*0.32, r*0.04, cx, cy, r);
  ballGrad.addColorStop(0, 'rgba(255,255,255,0.98)');
  ballGrad.addColorStop(0.25, 'rgba(215,215,235,0.95)');
  ballGrad.addColorStop(0.65, 'rgba(145,145,175,0.92)');
  ballGrad.addColorStop(1, 'rgba(75,75,115,0.88)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fillStyle=ballGrad; ctx.fill();

  // LED triangle panels
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r*0.97, 0, Math.PI*2); ctx.clip();
  const ledCols = [
    'rgba(255,40,40,0.75)', 'rgba(40,80,255,0.75)', 'rgba(255,210,20,0.75)',
    'rgba(40,220,80,0.75)', 'rgba(255,80,200,0.75)', 'rgba(80,220,255,0.75)',
  ];
  const rows=6, cols=8;
  for (let row=0; row<rows; row++) {
    for (let col=0; col<cols; col++) {
      const tw=r*2/cols, th=r*2/rows;
      const x=cx-r+col*tw, y=cy-r+row*th;
      const cIdx=Math.floor((col+row*2+Math.floor(t/20))%ledCols.length);
      const pulse = 0.35 + 0.65*Math.sin(t*0.07 + col*0.9 + row*1.4);
      ctx.globalAlpha = pulse * 0.72;
      ctx.fillStyle = ledCols[cIdx];
      ctx.beginPath();
      if ((row+col)%2===0) { ctx.moveTo(x,y+th); ctx.lineTo(x+tw/2,y); ctx.lineTo(x+tw,y+th); }
      else                 { ctx.moveTo(x,y); ctx.lineTo(x+tw/2,y+th); ctx.lineTo(x+tw,y); }
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha=1;

  // Metallic grid seams
  ctx.strokeStyle='rgba(160,160,200,0.28)'; ctx.lineWidth=0.5;
  for (let row=0; row<=rows; row++) { const y=cy-r+row*(r*2/rows); ctx.beginPath(); ctx.moveTo(cx-r,y); ctx.lineTo(cx+r,y); ctx.stroke(); }
  for (let col=0; col<=cols; col++) { const x=cx-r+col*(r*2/cols); ctx.beginPath(); ctx.moveTo(x,cy-r); ctx.lineTo(x,cy+r); ctx.stroke(); }
  ctx.restore();

  // Specular highlight
  ctx.fillStyle='rgba(255,255,255,0.40)';
  ctx.beginPath(); ctx.ellipse(cx-r*0.3,cy-r*0.3,r*0.22,r*0.15,-Math.PI/4,0,Math.PI*2); ctx.fill();
}

function drawNewYears(ctx, w, h, t, s, isTest) {
  const prog = isTest ? (t % 1200) / 1200 : getBallProgress();
  const bx = w*(0.05 + prog*0.90), by = h*0.5;
  const now = new Date();
  const isMidnight = !isTest && now.getMonth()===0 && now.getDate()===1 && now.getHours()===0 && now.getMinutes()<10;

  // Cable from start to ball
  ctx.strokeStyle='rgba(140,130,110,0.50)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(w*0.05,h*0.5); ctx.lineTo(bx,by); ctx.stroke();

  // Starting pole
  ctx.strokeStyle='rgba(130,120,100,0.65)'; ctx.lineWidth=3;
  ctx.beginPath(); ctx.moveTo(w*0.05,h*0.15); ctx.lineTo(w*0.05,h*0.85); ctx.stroke();

  const r = Math.min(h*0.32, 20);
  drawTimesSquareBall(ctx, bx, by, r, t);

  if (isMidnight || (isTest && prog > 0.92)) {
    if (!s.midnight) { s.midnight=true; for (const c of s.confetti) { c.active=true; c.y=rand(-h*0.5,0); } }
    if (t%80<2 && s.bursts.length<6) s.bursts.push({x:rand(w*0.2,w*0.8),y:rand(h*0.1,h*0.7),startT:t,hue:Math.floor(rand(0,360))});
  }
  s.bursts = s.bursts.filter(b=>t-b.startT<120);
  for (const b of s.bursts) fireworkBurst(ctx,b.x,b.y,h*0.7,(t-b.startT)/120,b.hue);

  for (const c of s.confetti) {
    if (!c.active) continue;
    c.x+=c.vx; c.y+=c.vy; c.vx+=rand(-0.05,0.05);
    if (c.y>h+5) { c.y=rand(-20,0); c.x=rand(0,w); }
    ctx.fillStyle=`hsla(${c.hue},90%,65%,${c.alpha.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(c.x,c.y,c.r,0,Math.PI*2); ctx.fill();
  }
}

// ─── Valentine's Day ──────────────────────────────────────────────────────────

function initValentines(w, h) {
  return { hearts: Array.from({ length: 18 }, () => ({
    x: rand(0,w), y: rand(0,h), size: rand(5,16), vy: rand(-0.3,-0.7),
    vx: rand(-0.15,0.15), alpha: rand(0.5,0.9), hue: rand(340,380), phase: rand(0,Math.PI*2),
  }))};
}

function drawValentines(ctx, w, h, t, s) {
  for (const hrt of s.hearts) {
    hrt.y += hrt.vy; hrt.x += hrt.vx + Math.sin(t*0.018+hrt.phase)*0.2;
    if (hrt.y + hrt.size*2 < 0) { hrt.y = h+hrt.size; hrt.x = rand(0,w); }
    const sz = hrt.size*(1 + 0.08*Math.sin(t*0.025+hrt.phase));
    ctx.save(); ctx.globalAlpha = hrt.alpha;
    ctx.fillStyle = `hsla(${hrt.hue%360},90%,60%,1)`;
    heart(ctx, hrt.x, hrt.y, sz); ctx.fill();
    ctx.restore();
  }
}

// ─── St. Patrick's Day ────────────────────────────────────────────────────────

function initStPatricks(w, h) {
  return { shamrocks: Array.from({ length: 10 }, () => ({
    x: rand(0,w), y: rand(0,h), r: rand(h*0.07,h*0.18),
    vx: rand(-0.2,0.2), vy: rand(-0.1,0.1), phase: rand(0,Math.PI*2), alpha: rand(0.55,0.85),
  }))};
}

function drawStPatricks(ctx, w, h, t, s) {
  // Pot of gold anchor position
  const px = w*0.88, py = h*0.62, pr = h*0.32;

  // Rainbow — circular arch, center below nav, feet at bottom corners, peak above
  const arcCols=['#e83030','#f07030','#f0e030','#40d040','#3070e8','#8030c0'];
  const arcCx = w * 0.5, arcCy = h + w * 0.45;
  const baseR = Math.hypot(w * 0.5, w * 0.45);
  const startA = Math.atan2(h - arcCy, 0 - arcCx);
  const endA   = Math.atan2(h - arcCy, w - arcCx);
  for (let i=0; i<arcCols.length; i++) {
    const R = baseR - i * h * 0.09;
    ctx.strokeStyle=arcCols[i]; ctx.lineWidth=h*0.11; ctx.globalAlpha=0.52;
    ctx.beginPath(); ctx.arc(arcCx, arcCy, R, startA, endA, false); ctx.stroke();
  }
  ctx.globalAlpha=1;

  // Cauldron/pot shape
  const topW=pr*0.9, botW=pr*0.52, potH=pr*0.92;
  ctx.fillStyle='rgba(22,18,18,0.93)';
  ctx.beginPath();
  ctx.moveTo(px-botW, py+potH);
  ctx.lineTo(px+botW, py+potH);
  ctx.lineTo(px+topW, py);
  ctx.lineTo(px-topW, py);
  ctx.closePath(); ctx.fill();
  // Rim
  ctx.fillStyle='rgba(42,36,36,0.96)';
  ctx.beginPath(); ctx.ellipse(px,py,topW,topW*0.22,0,0,Math.PI*2); ctx.fill();
  // Gold inside
  ctx.fillStyle='rgba(245,196,36,0.94)';
  ctx.beginPath(); ctx.ellipse(px,py,topW*0.84,topW*0.18,0,0,Math.PI*2); ctx.fill();
  // Coin pile spilling up
  const coinCols=['rgba(255,215,40,0.95)','rgba(240,190,30,0.90)','rgba(220,170,20,0.88)'];
  for (let i=-2; i<=2; i++) {
    ctx.fillStyle=coinCols[(i+2)%3];
    ctx.beginPath(); ctx.ellipse(px+i*topW*0.3, py-topW*0.12, topW*0.2, topW*0.11, 0,0,Math.PI*2); ctx.fill();
  }
  // Loose coins on ground
  for (let i=0; i<6; i++) {
    ctx.fillStyle='rgba(255,210,35,0.88)';
    ctx.beginPath(); ctx.ellipse(px-topW*0.6+i*topW*0.24, py+potH+pr*0.12, topW*0.13, topW*0.07, rand(-0.3,0.3),0,Math.PI*2); ctx.fill();
  }
  // Legs
  ctx.fillStyle='rgba(22,18,18,0.9)';
  for (const dx of [-botW*0.6, 0, botW*0.6]) {
    ctx.beginPath(); ctx.ellipse(px+dx,py+potH+pr*0.04,pr*0.1,pr*0.07,0,0,Math.PI*2); ctx.fill();
  }

  // Shamrocks
  for (const sh of s.shamrocks) {
    sh.x+=sh.vx; sh.y+=sh.vy;
    if (sh.x>w+sh.r*2) sh.x=-sh.r*2; if (sh.x<-sh.r*2) sh.x=w+sh.r*2;
    if (sh.y>h+sh.r*2) sh.y=-sh.r*2; if (sh.y<-sh.r*2) sh.y=h+sh.r*2;
    ctx.save(); ctx.globalAlpha=sh.alpha;
    ctx.fillStyle='rgba(30,160,50,0.9)'; ctx.strokeStyle='rgba(20,120,35,0.8)'; ctx.lineWidth=sh.r*0.12;
    ctx.translate(sh.x,sh.y); ctx.rotate(Math.sin(t*0.012+sh.phase)*0.18);
    shamrock(ctx,0,0,sh.r); ctx.restore();
  }
}

// ─── Easter ───────────────────────────────────────────────────────────────────

function initEaster(w, h) {
  const eggCols=[['#e84080','#f8a0c0'],['#40a8e8','#a0d8f8'],['#80d840','#c0f080'],['#f0c030','#f8e090'],['#a040e8','#d090f8']];
  return {
    eggs: Array.from({length:8},(_,i)=>({
      x:rand(w*0.05,w*0.95), baseY:rand(h*0.35,h*0.72),
      rx:rand(h*0.1,h*0.18), ry:rand(h*0.14,h*0.24),
      col:eggCols[i%eggCols.length], phase:rand(0,Math.PI*2), bounce:rand(0.012,0.022),
    })),
    bunny:{x:-h*0.6,dx:0.35},
  };
}

function drawEaster(ctx, w, h, t, s) {
  for (const e of s.eggs) drawEgg(ctx, e.x, e.baseY+Math.sin(t*e.bounce+e.phase)*h*0.06, e.rx, e.ry, e.col);
  s.bunny.x += s.bunny.dx;
  if (s.bunny.x > w+h*0.6) s.bunny.x = -h*0.6;
  drawBunny(ctx, s.bunny.x, h*0.72 - Math.abs(Math.sin(t*0.04))*h*0.08, h*0.3);
}

// ─── Mother's Day ─────────────────────────────────────────────────────────────

function initMothersDay(w, h) {
  const cols=['#f080c8','#e040a0','#c060d8','#f0a0e0','#d870c0'];
  return {
    flowers: Array.from({length:10},(_,i)=>({x:rand(0,w),baseY:rand(h*0.3,h*0.75),r:rand(h*0.12,h*0.22),col:cols[i%cols.length],phase:rand(0,Math.PI*2),sway:rand(0.008,0.018)})),
    butterflies: Array.from({length:4},()=>({x:rand(0,w),y:rand(0,h),dx:rand(-0.35,0.35),dy:rand(-0.2,0.2),r:h*0.14,phase:rand(0,Math.PI*2),hue:rand(260,340)})),
    hummingbirds: Array.from({length:2},()=>({
      x:rand(0,w), baseY:rand(h*0.2,h*0.75), r:h*0.2,
      dx:rand(-0.4,0.4), phase:rand(0,Math.PI*2), hue:rand(120,160),
    })),
  };
}

function drawMothersDay(ctx, w, h, t, s) {
  for (const f of s.flowers) drawFlower(ctx, f.x, f.baseY+Math.sin(t*f.sway+f.phase)*h*0.05, f.r, f.col);
  for (const b of s.butterflies) {
    b.x+=b.dx+Math.sin(t*0.02+b.phase)*0.3; b.y+=b.dy+Math.sin(t*0.028+b.phase+1)*0.2;
    if (b.x>w+b.r) b.x=-b.r; if (b.x<-b.r) b.x=w+b.r;
    if (b.y>h+b.r) b.y=-b.r; if (b.y<-b.r) b.y=h+b.r;
    drawButterfly(ctx,b.x,b.y,b.r,t*0.18+b.phase,b.hue);
  }
  for (const hb of s.hummingbirds) {
    hb.x += hb.dx + Math.sin(t*0.022+hb.phase)*0.4;
    const hy = hb.baseY + Math.sin(t*0.035+hb.phase)*h*0.08;
    if (hb.x>w+hb.r) hb.x=-hb.r; if (hb.x<-hb.r) hb.x=w+hb.r;
    drawHummingbird(ctx, hb.x, hy, hb.r, t);
  }
}

// ─── Memorial Day ─────────────────────────────────────────────────────────────

function initMemorialDay(w, h) {
  return {
    poppies: Array.from({length:12},()=>({x:rand(0,w),baseY:rand(h*0.35,h*0.8),r:rand(h*0.1,h*0.2),phase:rand(0,Math.PI*2)})),
    flags:[{x:w*0.12,phase:0},{x:w*0.88,phase:1.2}],
  };
}

function drawMemorialDay(ctx, w, h, t, s) {
  for (const p of s.poppies) drawPoppy(ctx, p.x, p.baseY+Math.sin(t*0.015+p.phase)*h*0.04, p.r);
  for (const f of s.flags) drawFlag(ctx, f.x, h*0.94, h*0.65, h*0.5, t*0.04+f.phase);
}

// ─── Father's Day ─────────────────────────────────────────────────────────────

function initFathersDay(w, h) {
  return { mower:{x:-h*0.8,dx:0.45}, smokePuffs:[], golfBall:{x:w*0.72} };
}

function drawFathersDay(ctx, w, h, t, s) {
  ctx.fillStyle='rgba(40,140,40,0.55)'; ctx.fillRect(0,h*0.88,w,h*0.12);
  grill(ctx, w*0.9, h*0.65, h*0.28);

  if (t%40===0) s.smokePuffs.push({x:w*0.9,y:h*0.35,r:h*0.06,alpha:0.45,vy:-0.3,vx:rand(-0.1,0.1)});
  s.smokePuffs = s.smokePuffs.filter(p=>p.alpha>0.02);
  for (const p of s.smokePuffs) {
    p.y+=p.vy; p.x+=p.vx; p.r+=0.18; p.alpha*=0.985;
    ctx.fillStyle=`rgba(160,155,150,${p.alpha.toFixed(2)})`; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  }

  s.golfBall.x -= 0.12;
  if (s.golfBall.x < w*0.5) s.golfBall.x = w*0.72;
  ctx.fillStyle='rgba(245,245,245,0.95)'; ctx.beginPath(); ctx.arc(s.golfBall.x,h*0.9,h*0.06,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='rgba(180,180,180,0.4)';
  for (let i=0; i<6; i++) {
    const a=(i/6)*Math.PI*2+t*0.01;
    ctx.beginPath(); ctx.arc(s.golfBall.x+Math.cos(a)*h*0.04,h*0.9+Math.sin(a)*h*0.04,h*0.012,0,Math.PI*2); ctx.fill();
  }

  s.mower.x += s.mower.dx;
  if (s.mower.x > w+h*0.8) s.mower.x = -h*0.8;
  ctx.fillStyle='rgba(55,160,55,0.3)'; ctx.fillRect(0,h*0.88,s.mower.x,h*0.12);
  lawnmower(ctx, s.mower.x, h*0.88 - h*0.38*0.45, h*0.38);
}

// ─── Fourth of July ───────────────────────────────────────────────────────────

function initJuly4(w, h) {
  return {
    bursts: Array.from({length:5},(_,i)=>({
      x:rand(w*0.1,w*0.9), y:rand(h*0.15,h*0.75),
      startT:i*60, period:200+Math.floor(rand(0,80)), hue:[0,45,200,280,30][i],
    })),
    stars: Array.from({length:20},()=>({x:rand(0,w),y:rand(0,h),r:rand(1,2.5),alpha:rand(0.3,0.8),phase:rand(0,Math.PI*2)})),
  };
}

function drawJuly4(ctx, w, h, t, s) {
  for (const st of s.stars) {
    ctx.fillStyle=`rgba(255,255,255,${(st.alpha*(0.6+0.4*Math.sin(t*0.03+st.phase))).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(st.x,st.y,st.r,0,Math.PI*2); ctx.fill();
  }
  for (const b of s.bursts) {
    const phase=(t-b.startT+b.period*10)%b.period;
    if (phase/b.period<0.7) fireworkBurst(ctx,b.x,b.y,h*0.72,(phase/b.period)/0.7,b.hue);
  }
}

// ─── Thanksgiving ─────────────────────────────────────────────────────────────

function drawCornucopia(ctx, cx, cy, r) {
  // Horn body
  ctx.fillStyle='rgba(155,95,28,0.88)';
  ctx.beginPath();
  ctx.moveTo(cx-r,    cy-r*0.38);
  ctx.quadraticCurveTo(cx+r*0.15, cy-r*0.58, cx+r*0.88, cy-r*0.08);
  ctx.quadraticCurveTo(cx+r,      cy+r*0.05,  cx+r*0.88, cy+r*0.18);
  ctx.quadraticCurveTo(cx+r*0.5,  cy+r*0.28,  cx-r,      cy+r*0.22);
  ctx.closePath(); ctx.fill();
  // Horn shading
  ctx.fillStyle='rgba(110,68,18,0.35)';
  ctx.beginPath();
  ctx.moveTo(cx-r*0.5,cy-r*0.18); ctx.quadraticCurveTo(cx+r*0.4,cy-r*0.3,cx+r*0.88,cy-r*0.04);
  ctx.lineTo(cx+r*0.88,cy+r*0.04); ctx.quadraticCurveTo(cx+r*0.4,cy-r*0.1,cx-r*0.5,cy+r*0.04); ctx.closePath(); ctx.fill();
  // Fruits/veggies spilling out
  const items=[
    {dx:-r*0.62,dy:-r*0.28,r:r*0.24,col:'rgba(215,55,30,0.92)'},
    {dx:-r*0.32,dy:-r*0.42,r:r*0.2, col:'rgba(240,185,30,0.92)'},
    {dx:-r*0.85,dy:-r*0.05,r:r*0.22,col:'rgba(220,95,20,0.90)'},
    {dx:-r*0.52,dy: r*0.08,r:r*0.18,col:'rgba(70,155,40,0.88)'},
    {dx:-r*1.05,dy:-r*0.18,r:r*0.16,col:'rgba(195,145,25,0.90)'},
  ];
  for (const it of items) { ctx.fillStyle=it.col; ctx.beginPath(); ctx.arc(cx+it.dx,cy+it.dy,it.r,0,Math.PI*2); ctx.fill(); }
}

function drawPilgrimHat(ctx, cx, cy, r) {
  const brimW=r*1.3, brimH=r*0.22;
  ctx.fillStyle='rgba(14,11,11,0.93)';
  ctx.beginPath(); ctx.ellipse(cx,cy,brimW,brimH,0,0,Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx-r*0.68,cy); ctx.lineTo(cx-r*0.60,cy-r*1.8); ctx.lineTo(cx+r*0.60,cy-r*1.8); ctx.lineTo(cx+r*0.68,cy); ctx.closePath(); ctx.fill();
  // White band
  ctx.fillStyle='rgba(232,225,210,0.92)';
  ctx.fillRect(cx-r*0.66,cy-r*0.36,r*1.32,r*0.27);
  // Buckle
  ctx.fillStyle='rgba(195,165,38,0.90)'; ctx.fillRect(cx-r*0.2,cy-r*0.32,r*0.4,r*0.19);
  ctx.fillStyle='rgba(28,22,22,0.92)';   ctx.fillRect(cx-r*0.11,cy-r*0.28,r*0.22,r*0.11);
}

function initThanksgiving(w, h) {
  const cols=['#c84000','#e06010','#d04000','#c07010','#a03000'];
  return {
    leaves: Array.from({length:20},()=>({
      x:rand(0,w), y:rand(-h,h), vx:rand(-0.5,0.5), vy:rand(0.3,0.8),
      r:rand(h*0.06,h*0.14), col:cols[Math.floor(rand(0,cols.length))],
      rot:rand(0,Math.PI*2), spin:rand(-0.02,0.02), alpha:rand(0.6,0.9),
    })),
    turkeys:[{x:-h*0.8,dx:0.38},{x:w*0.55,dx:0.28}],
    cornucopia: { x: w*0.15, y: h*0.6 },
    pilgrimHat: { x: w*0.88, y: h*0.55 },
  };
}

function drawThanksgiving(ctx, w, h, t, s) {
  drawCornucopia(ctx, s.cornucopia.x, s.cornucopia.y, h*0.38);
  drawPilgrimHat(ctx, s.pilgrimHat.x, s.pilgrimHat.y, h*0.28);
  for (const l of s.leaves) {
    l.x+=l.vx+Math.sin(t*0.015+l.x)*0.25; l.y+=l.vy; l.rot+=l.spin;
    if (l.y>h+l.r) { l.y=-l.r; l.x=rand(0,w); }
    ctx.save(); ctx.translate(l.x,l.y); ctx.rotate(l.rot); ctx.globalAlpha=l.alpha;
    ctx.fillStyle=l.col; ctx.beginPath(); ctx.ellipse(0,0,l.r,l.r*0.6,0,0,Math.PI*2); ctx.fill(); ctx.restore();
  }
  ctx.globalAlpha=1;
  for (const tk of s.turkeys) {
    tk.x+=tk.dx; if (tk.x>w+h*0.8) tk.x=-h*0.8;
    turkey(ctx, tk.x, h*0.72+Math.sin(t*0.06+tk.x*0.01)*h*0.04, h*0.32);
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const DRAW_MAP = {
  halloween:    { init: initHalloween,    draw: drawHalloween },
  christmas:    { init: initChristmas,    draw: drawChristmas },
  newyears:     { init: initNewYears,     draw: drawNewYears },
  valentines:   { init: initValentines,   draw: drawValentines },
  stpatricks:   { init: initStPatricks,   draw: drawStPatricks },
  easter:       { init: initEaster,       draw: drawEaster },
  mothersday:   { init: initMothersDay,   draw: drawMothersDay },
  memorialday:  { init: initMemorialDay,  draw: drawMemorialDay },
  fathersday:   { init: initFathersDay,   draw: drawFathersDay },
  july4:        { init: initJuly4,        draw: drawJuly4 },
  thanksgiving: { init: initThanksgiving, draw: drawThanksgiving },
};

export default function HolidayNavCanvas({ holiday, isTest }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!holiday || !DRAW_MAP[holiday]) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { init, draw } = DRAW_MAP[holiday];

    let animId, t = 0, state = null;

    function resize() {
      const w = canvas.parentElement?.clientWidth  || canvas.offsetWidth  || 300;
      const h = canvas.parentElement?.clientHeight || canvas.offsetHeight || 48;
      canvas.width = w; canvas.height = h;
      state = init(w, h);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || canvas);

    function loop() {
      const w = canvas.width, h = canvas.height;
      t++;
      ctx.clearRect(0, 0, w, h);
      if (state) draw(ctx, w, h, t, state, isTest);
      animId = requestAnimationFrame(loop);
    }

    loop();
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, [holiday]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
