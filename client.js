const socket = io("https://arena-game-sqxr.onrender.com", {
  transports: ["websocket", "polling"]
});

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const lengthEl = document.getElementById('length');
const joinBox = document.getElementById('joinBox');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('name');
const skinSelect = document.getElementById('skin');

if (
  !canvas ||
  !ctx ||
  !statusEl ||
  !scoreEl ||
  !lengthEl ||
  !joinBox ||
  !joinBtn ||
  !nameInput ||
  !skinSelect
) {
  throw new Error('Missing required DOM elements');
}

let W = window.innerWidth;
let H = window.innerHeight;

canvas.width = W;
canvas.height = H;

let playerId = null;
let worldSize = 4000;

let state = {
  players: [],
  foods: [],
  timestamp: 0
};

let camera = {
  x: worldSize / 2,
  y: worldSize / 2
};

let targetAngle = 0;
let boost = false;
let joined = false;

let particles = [];

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;

  canvas.width = W;
  canvas.height = H;
}

window.addEventListener('resize', resize);

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

  return '#b34cff';
}

window.addEventListener('mousemove', (e) => {
  const dx = e.clientX - W / 2;
  const dy = e.clientY - H / 2;

  targetAngle = Math.atan2(dy, dx);
});

window.addEventListener('touchmove', (e) => {
  e.preventDefault();

  const touch = e.touches[0];

  if (!touch) return;

  const dx = touch.clientX - W / 2;
  const dy = touch.clientY - H / 2;

  targetAngle = Math.atan2(dy, dx);

}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    boost = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    boost = false;
  }
});

window.addEventListener('touchstart', () => {
  boost = true;
}, { passive: true });

window.addEventListener('touchend', () => {
  boost = false;
}, { passive: true });

joinBtn.addEventListener('click', () => {

  if (joined) return;

  const name = nameInput.value.trim();

  if (!name) {
    statusEl.textContent = 'Please enter a name';
    return;
  }

  socket.emit('join', {
    name,
    skin: skinSelect.value
  });
});

socket.on('connect', () => {
  statusEl.textContent = 'Connected';
});

socket.on('connect_error', () => {
  statusEl.textContent = 'Connection error';
});

socket.on('disconnect', () => {

  statusEl.textContent = 'Disconnected';

  joinBox.style.display = 'grid';

  joined = false;
  playerId = null;
});

socket.on('init', (data) => {

  playerId = data.playerId;

  worldSize = data.worldSize || worldSize;

  joined = true;

  joinBox.style.display = 'none';

  camera.x = worldSize / 2;
  camera.y = worldSize / 2;
});

socket.on('state', (serverState) => {

  state = serverState || state;

  const me = state.players?.find(
    p => p.id === playerId
  );

  if (me) {

    scoreEl.textContent =
      `Score: ${me.score ?? 0}`;

    lengthEl.textContent =
      `Length: ${me.length ?? 0}`;

    camera.x +=
      (me.x - camera.x) * 0.12;

    camera.y +=
      (me.y - camera.y) * 0.12;
  }
});

socket.on('eat', ({ food }) => {

  if (food) {
    createParticles(
      food.x,
      food.y,
      '#f59e0b',
      8
    );
  }
});

socket.on('explosion', ({ x, y, color }) => {

  createParticles(
    x,
    y,
    skinColor(color),
    30
  );
});

socket.on('death', (data = {}) => {

  statusEl.textContent =
    data.killer
      ? `Killed by ${data.killer}`
      : 'You died';

  joinBox.style.display = 'grid';

  joined = false;
  playerId = null;

  scoreEl.textContent = 'Score: 0';
  lengthEl.textContent = 'Length: 10';
});

function createParticles(x, y, color, count) {

  for (let i = 0; i < count; i++) {

    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      life: 1,
      color,
      size: Math.random() * 4 + 2
    });
  }
}

function updateParticles() {

  particles = particles.filter(p => {

    p.x += p.vx;
    p.y += p.vy;

    p.vx *= 0.96;
    p.vy *= 0.96;

    p.life -= 0.02;

    return p.life > 0;
  });
}

function drawParticles() {

  particles.forEach(p => {

    const pos = worldToScreen(p.x, p.y);

    ctx.globalAlpha = p.life;

    ctx.fillStyle = p.color;

    ctx.shadowBlur = 15;
    ctx.shadowColor = p.color;

    ctx.beginPath();

    ctx.arc(
      pos.x,
      pos.y,
      p.size,
      0,
      Math.PI * 2
    );

    ctx.fill();
  });

  ctx.globalAlpha = 1;

  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

function drawGrid() {

  const step = 100;

  ctx.strokeStyle =
    'rgba(255,255,255,0.05)';

  ctx.lineWidth = 1;

  const startX =
    -((camera.x - W / 2) % step);

  const startY =
    -((camera.y - H / 2) % step);

  for (let x = startX; x < W; x += step) {

    ctx.beginPath();

    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);

    ctx.stroke();
  }

  for (let y = startY; y < H; y += step) {

    ctx.beginPath();

    ctx.moveTo(0, y);
    ctx.lineTo(W, y);

    ctx.stroke();
  }
}

function drawFood(food) {

  const p = worldToScreen(food.x, food.y);

  const emoji = {
    cherry: '🍒',
    donut: '🍩',
    candy: '🍭',
    cake: '🍰',
    orb: '🔮'
  }[food.type] || '🍒';

  ctx.font = '20px Arial';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillText(
    emoji,
    p.x,
    p.y
  );
}

function drawSnake(player) {

  if (!player?.body?.length) return;

  const color = skinColor(player.skin);
  
  // body array-র order ঠিক করা: যদি server থেকে tail প্রথমে আসে, reverse করুন
  // বর্তমান: ধরে নেওয়া body[0] = HEAD, body[length-1] = TAIL
  // যদি ভুল দেখায়, তবে নিচের লাইনটি uncomment করুন:
  // const body = [...player.body].reverse();
  const body = player.body;

  // Head থেকে Tail পর্যন্ত আঁকুন (sঠিক order)
  for (let i = 0; i < body.length; i++) {
    const seg = body[i];
    const p = worldToScreen(seg.x, seg.y);
    
    // i === 0 মানে HEAD (বড় circle)
    const r = i === 0 ? 10 : 8;
    
    ctx.fillStyle = i === 0 ? color : 'rgba(255,255,255,0.9)';
    
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head-এর উপর নাম লিখুন (body[0] = HEAD)
  if (player.id !== playerId) {
    const head = worldToScreen(body[0].x, body[0].y);
    
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    ctx.fillText(player.name || 'Player', head.x, head.y - 20);
  }
}

function render() {

  ctx.clearRect(0, 0, W, H);

  drawGrid();

  for (const food of state.foods || []) {
    drawFood(food);
  }

  for (const player of state.players || []) {
    drawSnake(player);
  }

  updateParticles();
  drawParticles();

  if (joined) {

    socket.emit('input', {
      angle: targetAngle,
      boost
    });
  }

  requestAnimationFrame(render);
}

render();
