const socket = io("https://arena-game-sqxr.onrender.com", {
  transports: ["websocket"],
  upgrade: false,
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 4000,
  timeout: 8000
});

const canvas = document.getElementById('game');
const ctx = canvas?.getContext('2d', { alpha: false, desynchronized: true });

const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const lengthEl = document.getElementById('length');
const joinBox = document.getElementById('joinBox');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('name');
const skinSelect = document.getElementById('skin');
const leaderboardEl = document.getElementById('leaderboard');
const onlineEl = document.getElementById('online');

if (!canvas || !ctx || !statusEl || !scoreEl || !lengthEl || !joinBox || !joinBtn || !nameInput || !skinSelect) {
  throw new Error('Missing required DOM elements');
}

canvas.style.touchAction = 'none';

const DPR = Math.min(window.devicePixelRatio || 1, 2);
const INTERPOLATION = 0.16;
const INPUT_RATE = 1000 / 30;
const MAX_PARTICLES = 70;
const RENDER_DISTANCE = 1100;
const GRID_STEP = 100;
const JOYSTICK_MAX = 48;
const JOYSTICK_DEADZONE = 8;

let W = window.innerWidth;
let H = window.innerHeight;
let playerId = null;
let worldSize = 4000;
let state = { players: [], foods: [], timestamp: 0 };
let camera = { x: worldSize / 2, y: worldSize / 2 };
let targetAngle = 0;
let boost = false;
let joined = false;
let particles = [];
let lastInputSent = 0;
let onlineCount = 0;
let bestScore = Number(localStorage.getItem('arena_bestScore') || 0);
let soundUnlocked = false;
let audioCtx = null;
let lastFrame = 0;

const joystick = {
  active: false,
  id: null,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  vx: 0,
  vy: 0
};

const boostBtn = {
  x: 0,
  y: 0,
  radius: 40,
  active: false
};

const miniMap = {
  x: 0,
  y: 0,
  w: 150,
  h: 150
};

function initCanvas() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  boostBtn.x = W - 82;
  boostBtn.y = H - 82;

  miniMap.x = W - 170;
  miniMap.y = 20;
}

window.addEventListener('resize', initCanvas, { passive: true });
initCanvas();

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function worldToScreen(x, y) {
  return {
    x: x - camera.x + W / 2,
    y: y - camera.y + H / 2
  };
}

function skinColor(skin) {
  if (skin === 'fire') return '#ff5a36';
  if (skin === 'ice') return '#47d7ff';
  if (skin === 'gold') return '#f5c542';
  if (skin === 'shadow') return '#9c5cff';
  return '#b34cff';
}

function skinGlow(skin) {
  if (skin === 'fire') return 'rgba(255,90,54,0.9)';
  if (skin === 'ice') return 'rgba(71,215,255,0.9)';
  if (skin === 'gold') return 'rgba(245,197,66,0.95)';
  if (skin === 'shadow') return 'rgba(156,92,255,0.9)';
  return 'rgba(179,76,255,0.9)';
}

function unlockAudio() {
  if (soundUnlocked) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    soundUnlocked = true;
  } catch {}
}

function beep(type = 'collect') {
  if (!audioCtx || !soundUnlocked) return;

  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g);
  g.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  const cfg = type === 'death'
    ? [140, 60, 0.18]
    : type === 'boost'
    ? [220, 170, 0.08]
    : [520, 760, 0.05];

  o.type = type === 'death' ? 'sawtooth' : 'sine';
  o.frequency.setValueAtTime(cfg[0], now);
  o.frequency.exponentialRampToValueAtTime(cfg[1], now + cfg[2]);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(type === 'death' ? 0.18 : 0.08, now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + cfg[2] + 0.02);
  o.start(now);
  o.stop(now + cfg[2] + 0.04);
}

function createParticles(x, y, color, count, power = 1) {
  const space = MAX_PARTICLES - particles.length;
  if (space <= 0) return;
  const n = Math.min(count, space);

  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (Math.random() * 2.5 + 1) * power;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 1,
      color,
      size: Math.random() * 2.6 + 1.2
    });
  }
}

function updateParticles() {
  particles = particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= 0.03;
    return p.life > 0;
  });
}
function getTouch(e) {
  if (joystick.id === null) return e.touches[0] || null;
  for (let i = 0; i < e.touches.length; i++) {
    if (e.touches[i].identifier === joystick.id) return e.touches[i];
  }
  return null;
}

function handleTouchStart(e) {
  unlockAudio();
  e.preventDefault();

  const t = e.changedTouches[0];
  if (!t) return;

  const dx = t.clientX - boostBtn.x;
  const dy = t.clientY - boostBtn.y;

  if (Math.hypot(dx, dy) < boostBtn.radius + 10) {
    boost = true;
    boostBtn.active = true;
    beep('boost');
    return;
  }

  if (t.clientX < W / 2 && !joystick.active) {
    joystick.active = true;
    joystick.id = t.identifier;
    joystick.startX = joystick.currentX = t.clientX;
    joystick.startY = joystick.currentY = t.clientY;
    joystick.vx = 0;
    joystick.vy = 0;
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!joystick.active) return;

  const t = getTouch(e);
  if (!t) return;

  joystick.currentX = t.clientX;
  joystick.currentY = t.clientY;

  let dx = joystick.currentX - joystick.startX;
  let dy = joystick.currentY - joystick.startY;
  const dist = Math.hypot(dx, dy);

  if (dist > JOYSTICK_DEADZONE) {
    if (dist > JOYSTICK_MAX) {
      const s = JOYSTICK_MAX / dist;
      dx *= s;
      dy *= s;
    }
    joystick.vx = dx / JOYSTICK_MAX;
    joystick.vy = dy / JOYSTICK_MAX;
    targetAngle = Math.atan2(dy, dx);
  } else {
    joystick.vx = 0;
    joystick.vy = 0;
  }
}

function handleTouchEnd(e) {
  e.preventDefault();

  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joystick.id) {
      joystick.active = false;
      joystick.id = null;
      joystick.vx = 0;
      joystick.vy = 0;
    }
  }

  boost = false;
  boostBtn.active = false;
}

canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

window.addEventListener('mousemove', (e) => {
  if (joystick.active) return;
  targetAngle = Math.atan2(e.clientY - H / 2, e.clientX - W / 2);
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    unlockAudio();
    boost = true;
    beep('boost');
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') boost = false;
});
joinBtn.addEventListener('click', () => {
  if (joined) return;

  const name = nameInput.value.trim().slice(0, 16);
  if (!name) {
    statusEl.textContent = 'Enter a name';
    return;
  }

  unlockAudio();
  joinBtn.disabled = true;
  socket.emit('join', { name, skin: skinSelect.value });

  setTimeout(() => {
    if (!joined) joinBtn.disabled = false;
  }, 1500);
});

socket.on('connect', () => {
  statusEl.textContent = 'Connected';
  joinBtn.disabled = false;
});

socket.on('connect_error', () => {
  statusEl.textContent = 'Connection error';
  joinBtn.disabled = false;
});

socket.on('disconnect', () => {
  statusEl.textContent = 'Disconnected';
  joinBox.style.display = 'grid';
  joined = false;
  playerId = null;
  joinBtn.disabled = false;
});

socket.on('init', (data) => {
  playerId = data.playerId;
  worldSize = data.worldSize || worldSize;
  joined = true;
  joinBox.style.display = 'none';
  statusEl.textContent = 'In game';
  joinBtn.disabled = false;
  camera.x = worldSize / 2;
  camera.y = worldSize / 2;
});

socket.on('state', (serverState) => {
  state = {
    players: Array.isArray(serverState?.players) ? serverState.players : [],
    foods: Array.isArray(serverState?.foods) ? serverState.foods : [],
    timestamp: serverState?.timestamp || 0
  };

  onlineCount = state.players.length;
  if (onlineEl) onlineEl.textContent = `Online: ${onlineCount}`;

  const me = state.players.find(p => p.id === playerId);
  if (me) {
    const score = me.score ?? 0;
    const length = me.length ?? me.body?.length ?? 0;
    scoreEl.textContent = `Score: ${score}`;
    lengthEl.textContent = `Length: ${length}`;

    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('arena_bestScore', String(bestScore));
    }
  }

  updateLeaderboard();
});

socket.on('eat', ({ food }) => {
  if (food) {
    createParticles(food.x, food.y, '#f59e0b', 6);
    beep('collect');
  }
});

socket.on('explosion', ({ x, y, color }) => {
  createParticles(x, y, skinGlow(color), 20, 1.5);
});

socket.on('death', (data = {}) => {
  statusEl.textContent = data.killer ? `Killed by ${data.killer}` : 'You died';
  joinBox.style.display = 'grid';
  joined = false;
  playerId = null;
  beep('death');
  scoreEl.textContent = 'Score: 0';
  lengthEl.textContent = 'Length: 10';
});
function drawGrid() {
  ctx.save();
  const step = GRID_STEP;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.beginPath();

  const startX = -((((camera.x - W / 2) % step) + step) % step);
  const startY = -((((camera.y - H / 2) % step) + step) % step);

  for (let x = startX; x < W; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = startY; y < H; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawFood(food) {
  const p = worldToScreen(food.x, food.y);
  if (p.x < -50 || p.x > W + 50 || p.y < -50 || p.y > H + 50) return;

  const emoji = { cherry: '🍒', donut: '🍩', candy: '🍭', cake: '🍰', orb: '🔮' }[food.type] || '🍒';
  ctx.font = '18px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, p.x, p.y);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function bodyPointOffset(prev, cur, next, t) {
  const x1 = prev ? prev.x : cur.x;
  const y1 = prev ? prev.y : cur.y;
  const x2 = next ? next.x : cur.x;
  const y2 = next ? next.y : cur.y;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  const sway = Math.sin(t) * 0.9;
  return { ox: nx * sway, oy: ny * sway };
}

function drawHeadEyes(x, y, angle, glowColor) {
  const eyeDist = 4.6;
  const eyeForward = 5.5;

  const ex = Math.cos(angle);
  const ey = Math.sin(angle);
  const px = -ey;
  const py = ex;

  const leftX = x + ex * eyeForward + px * eyeDist;
  const leftY = y + ey * eyeForward + py * eyeDist;
  const rightX = x + ex * eyeForward - px * eyeDist;
  const rightY = y + ey * eyeForward - py * eyeDist;

  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(leftX, leftY, 1.7, 0, Math.PI * 2);
  ctx.arc(rightX, rightY, 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.arc(leftX + 0.35, leftY + 0.15, 0.7, 0, Math.PI * 2);
  ctx.arc(rightX + 0.35, rightY + 0.15, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function drawSnake(player) {
  if (!player?.body?.length) return;

  const body = player.body;
  const headWorld = body[0];
  const headScreen = worldToScreen(headWorld.x, headWorld.y);

  if (
    headScreen.x < -RENDER_DISTANCE ||
    headScreen.x > W + RENDER_DISTANCE ||
    headScreen.y < -RENDER_DISTANCE ||
    headScreen.y > H + RENDER_DISTANCE
  ) return;

  const isMe = player.id === playerId;
  const boosting = !!player.boost || (isMe && boost);
  const base = skinColor(player.skin);
  const glow = skinGlow(player.skin);

  const n = body.length;
  const maxVisible = Math.min(n, 120);

  let dirX = 1;
  let dirY = 0;
  if (n > 1) {
    dirX = body[0].x - body[1].x;
    dirY = body[0].y - body[1].y;
    const dl = Math.hypot(dirX, dirY) || 1;
    dirX /= dl;
    dirY /= dl;
  }
  const headAngle = Math.atan2(dirY, dirX);

  ctx.save();

  if (isMe || boosting) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = boosting ? 22 : 14;
  }

  const grad = ctx.createLinearGradient(
    headScreen.x - 10,
    headScreen.y - 10,
    headScreen.x + 10,
    headScreen.y + 10
  );
  grad.addColorStop(0, boosting ? '#ffffff' : base);
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, 'rgba(255,255,255,0.92)');

  let prevP = null;

  for (let i = maxVisible - 1; i >= 0; i--) {
    const seg = body[i];
    const p = worldToScreen(seg.x, seg.y);

    if (p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H + 80) {
      continue;
    }

    const t = i / Math.max(1, maxVisible - 1);
    const thickness = lerp(16, 6.5, t);
    const alpha = 1 - t * 0.32;
    const wobble = i === 0 ? Math.sin(performance.now() * 0.015) * 0.6 : 0;

    ctx.globalAlpha = alpha;

    if (i === 0) {
      const pulse = boosting ? 1.35 : 1;
      const headR = 11.5 * pulse;

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, headR, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = boosting ? 0.55 : 0.38;
      ctx.strokeStyle = glow;
      ctx.lineWidth = boosting ? 7 : 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, headR + 2.5, 0, Math.PI * 2);
      ctx.stroke();

      drawHeadEyes(p.x, p.y, headAngle, glow);

      if (boosting) {
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = glow;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p.x - dirX * 4, p.y - dirY * 4);
        ctx.lineTo(p.x - dirX * 16, p.y - dirY * 16);
        ctx.stroke();
      }
    } else {
      const prev = body[i - 1];
      const next = body[i + 1];
      const off = bodyPointOffset(prev, seg, next, performance.now() * 0.004 + i * 0.12);

      const sx = p.x + off.ox;
      const sy = p.y + off.oy;

      const prevScreen = prevP || worldToScreen(prev.x, prev.y);
      const dx = sx - prevScreen.x;
      const dy = sy - prevScreen.y;
      const segLen = Math.hypot(dx, dy) || 1;
      const nx = -dy / segLen;
      const ny = dx / segLen;

      const bodyColor = i % 2 === 0 ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.80)';
      const rimAlpha = clamp01(0.24 - t * 0.12);

      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.arc(sx, sy, thickness * 0.5 + wobble, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = rimAlpha;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx + nx * 1.2, sy + ny * 1.2, thickness * 0.28, 0, Math.PI * 2);
      ctx.fill();

      prevP = { x: sx, y: sy };
    }
  }

  if (maxVisible > 1) {
    ctx.globalAlpha = boosting ? 0.18 : 0.11;
    ctx.strokeStyle = glow;
    ctx.lineWidth = boosting ? 8 : 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (let i = 0; i < Math.min(maxVisible, 18); i++) {
      const seg = body[i];
      const p = worldToScreen(seg.x, seg.y);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  if (!isMe) {
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(player.name || 'Player', headScreen.x, headScreen.y - 24);
  }

  ctx.restore();
}
function drawParticles() {
  ctx.save();
  for (const p of particles) {
    const pos = worldToScreen(p.x, p.y);
    ctx.globalAlpha = p.life * 0.8;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawJoystick() {
  if (!joystick.active) return;
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(joystick.startX, joystick.startY, JOYSTICK_MAX, 0, Math.PI * 2);
  ctx.fill();

  const knobX = joystick.startX + joystick.vx * JOYSTICK_MAX;
  const knobY = joystick.startY + joystick.vy * JOYSTICK_MAX;

  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(knobX, knobY, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBoostButton() {
  ctx.save();
  ctx.globalAlpha = boostBtn.active ? 0.9 : 0.4;
  ctx.fillStyle = boostBtn.active ? '#ff5a36' : '#fff';
  ctx.shadowBlur = boostBtn.active ? 20 : 0;
  ctx.shadowColor = '#ff5a36';
  ctx.beginPath();
  ctx.arc(boostBtn.x, boostBtn.y, boostBtn.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = boostBtn.active ? '#fff' : '#000';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BOOST', boostBtn.x, boostBtn.y);
  ctx.restore();
}
function drawMiniMap() {
  const players = Array.isArray(state.players) ? state.players : [];
  const foods = Array.isArray(state.foods) ? state.foods : [];
  if (!worldSize) return;

  const scaleX = miniMap.w / worldSize;
  const scaleY = miniMap.h / worldSize;

  ctx.save();

  ctx.fillStyle = 'rgba(8,10,18,0.78)';
  ctx.strokeStyle = 'rgba(156,92,255,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(miniMap.x, miniMap.y, miniMap.w, miniMap.h, 16);
  } else {
    ctx.rect(miniMap.x, miniMap.y, miniMap.w, miniMap.h);
  }
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    const gx = miniMap.x + (miniMap.w / 3) * i;
    const gy = miniMap.y + (miniMap.h / 3) * i;
    ctx.moveTo(gx, miniMap.y + 8);
    ctx.lineTo(gx, miniMap.y + miniMap.h - 8);
    ctx.moveTo(miniMap.x + 8, gy);
    ctx.lineTo(miniMap.x + miniMap.w - 8, gy);
  }
  ctx.stroke();

  for (const food of foods) {
    const fx = miniMap.x + clamp(food.x * scaleX, 0, miniMap.w);
    const fy = miniMap.y + clamp(food.y * scaleY, 0, miniMap.h);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(fx, fy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of players) {
    const px = miniMap.x + clamp((p.x || 0) * scaleX, 0, miniMap.w);
    const py = miniMap.y + clamp((p.y || 0) * scaleY, 0, miniMap.h);
    ctx.fillStyle = p.id === playerId ? '#ffffff' : skinGlow(p.skin);
    ctx.beginPath();
    ctx.arc(px, py, p.id === playerId ? 3.5 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const me = players.find(p => p.id === playerId);
  if (me) {
    const cx = miniMap.x + clamp(me.x * scaleX, 0, miniMap.w);
    const cy = miniMap.y + clamp(me.y * scaleY, 0, miniMap.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('MAP', miniMap.x + 10, miniMap.y + 10);

  ctx.restore();
}
function updateLeaderboard() {
  if (!leaderboardEl) return;

  const players = Array.isArray(state.players) ? state.players : [];
  const sorted = [...players]
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5);

  leaderboardEl.innerHTML = `
    <div style="font-weight:bold;margin-bottom:6px;">Leaderboard</div>
    ${sorted.map((p, i) => {
      const name = String(p.name || 'Player').slice(0, 12);
      return `<div class="${p.id === playerId ? 'me' : ''}" style="margin:3px 0;font-size:12px;color:${p.id === playerId ? '#f5c542' : '#fff'}">${i + 1}. ${name}: ${p.score || 0}</div>`;
    }).join('')}
    <div style="margin-top:8px;font-size:11px;opacity:0.7;">Best: ${bestScore}</div>
  `;
}

function render(now = performance.now()) {
  const players = Array.isArray(state.players) ? state.players : [];
  const foods = Array.isArray(state.foods) ? state.foods : [];
  const me = players.find(p => p.id === playerId);

  if (me) {
    camera.x = lerp(camera.x, me.x, INTERPOLATION);
    camera.y = lerp(camera.y, me.y, INTERPOLATION);
  }

  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);

  drawGrid();
  for (const food of foods) drawFood(food);
  for (const player of players) drawSnake(player);
  updateParticles();
  drawParticles();
  drawMiniMap();
  drawJoystick();
  drawBoostButton();

  const current = performance.now();
  if (joined && current - lastInputSent > INPUT_RATE) {
    socket.emit('input', { angle: targetAngle, boost });
    lastInputSent = current;
  }

  if (onlineEl) onlineEl.textContent = `Online: ${onlineCount} | Best: ${bestScore}`;
  requestAnimationFrame(render);
}

requestAnimationFrame(render);