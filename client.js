<<<<<<< HEAD
const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const lengthEl = document.getElementById('length');
const joinBox = document.getElementById('joinBox');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('name');
const skinSelect = document.getElementById('skin');

let W = window.innerWidth;
let H = window.innerHeight;
canvas.width = W;
canvas.height = H;

let playerId = null;
let worldSize = 4000;
let state = { players: [], foods: [], timestamp: 0 };
let camera = { x: worldSize / 2, y: worldSize / 2 };
let targetAngle = 0;
let boost = false;
let joined = false;

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

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') boost = true;
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') boost = false;
});

joinBtn.addEventListener('click', () => {
  if (joined) return;
  socket.emit('join', {
    name: nameInput.value.trim(),
    skin: skinSelect.value
  });
});

socket.on('connect', () => {
  statusEl.textContent = 'Connected';
});

socket.on('init', (data) => {
  playerId = data.playerId;
  worldSize = data.worldSize;
  joined = true;
  joinBox.style.display = 'none';
  camera.x = worldSize / 2;
  camera.y = worldSize / 2;
});

socket.on('state', (serverState) => {
  state = serverState;
  const me = state.players.find(p => p.id === playerId);
  if (me) {
    scoreEl.textContent = `Score: ${me.score}`;
    lengthEl.textContent = `Length: ${me.length}`;
    camera.x += (me.x - camera.x) * 0.12;
    camera.y += (me.y - camera.y) * 0.12;
  }
});

socket.on('death', (data) => {
  statusEl.textContent = data.killer ? `You were killed by ${data.killer}` : 'Disconnected';
  joinBox.style.display = 'grid';
  joined = false;
  playerId = null;
});

socket.on('eat', () => {});

socket.on('explosion', () => {});

function drawGrid() {
  const step = 100;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;

  const startX = -((camera.x - W / 2) % step);
  const startY = -((camera.y - H / 2) % step);

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
  ctx.fillStyle = food.type === 'orb' ? '#7c3aed' : '#f59e0b';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnake(player) {
  if (!player.body || !player.body.length) return;
  const color = skinColor(player.skin);

  for (let i = player.body.length - 1; i >= 0; i--) {
    const seg = player.body[i];
    const p = worldToScreen(seg.x, seg.y);
    const r = i === 0 ? 10 : 8;

    ctx.fillStyle = i === 0 ? color : 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const head = worldToScreen(player.x, player.y);
  ctx.fillStyle = '#000';
  const eyeAngle = player.angle;
  ctx.beginPath();
  ctx.arc(head.x + Math.cos(eyeAngle + 0.3) * 4, head.y + Math.sin(eyeAngle + 0.3) * 4, 1.8, 0, Math.PI * 2);
  ctx.arc(head.x + Math.cos(eyeAngle - 0.3) * 4, head.y + Math.sin(eyeAngle - 0.3) * 4, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawGrid();

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, W, H);

  for (const food of state.foods) drawFood(food);

  const others = state.players
    .slice()
    .sort((a, b) => (a.id === playerId ? 1 : 0) - (b.id === playerId ? 1 : 0));

  for (const player of others) drawSnake(player);

  if (joined) {
    socket.emit('input', { angle: targetAngle, boost });
  }

  requestAnimationFrame(render);
}

=======
const socket = io();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const statusEl = document.getElementById('status');
const scoreEl = document.getElementById('score');
const lengthEl = document.getElementById('length');
const joinBox = document.getElementById('joinBox');
const joinBtn = document.getElementById('joinBtn');
const nameInput = document.getElementById('name');
const skinSelect = document.getElementById('skin');

let W = window.innerWidth;
let H = window.innerHeight;
canvas.width = W;
canvas.height = H;

let playerId = null;
let worldSize = 4000;
let state = { players: [], foods: [], timestamp: 0 };
let camera = { x: worldSize / 2, y: worldSize / 2 };
let targetAngle = 0;
let boost = false;
let joined = false;

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

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') boost = true;
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') boost = false;
});

joinBtn.addEventListener('click', () => {
  if (joined) return;
  socket.emit('join', {
    name: nameInput.value.trim(),
    skin: skinSelect.value
  });
});

socket.on('connect', () => {
  statusEl.textContent = 'Connected';
});

socket.on('init', (data) => {
  playerId = data.playerId;
  worldSize = data.worldSize;
  joined = true;
  joinBox.style.display = 'none';
  camera.x = worldSize / 2;
  camera.y = worldSize / 2;
});

socket.on('state', (serverState) => {
  state = serverState;
  const me = state.players.find(p => p.id === playerId);
  if (me) {
    scoreEl.textContent = `Score: ${me.score}`;
    lengthEl.textContent = `Length: ${me.length}`;
    camera.x += (me.x - camera.x) * 0.12;
    camera.y += (me.y - camera.y) * 0.12;
  }
});

socket.on('death', (data) => {
  statusEl.textContent = data.killer ? `You were killed by ${data.killer}` : 'Disconnected';
  joinBox.style.display = 'grid';
  joined = false;
  playerId = null;
});

socket.on('eat', () => {});

socket.on('explosion', () => {});

function drawGrid() {
  const step = 100;
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;

  const startX = -((camera.x - W / 2) % step);
  const startY = -((camera.y - H / 2) % step);

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
  ctx.fillStyle = food.type === 'orb' ? '#7c3aed' : '#f59e0b';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnake(player) {
  if (!player.body || !player.body.length) return;
  const color = skinColor(player.skin);

  for (let i = player.body.length - 1; i >= 0; i--) {
    const seg = player.body[i];
    const p = worldToScreen(seg.x, seg.y);
    const r = i === 0 ? 10 : 8;

    ctx.fillStyle = i === 0 ? color : 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const head = worldToScreen(player.x, player.y);
  ctx.fillStyle = '#000';
  const eyeAngle = player.angle;
  ctx.beginPath();
  ctx.arc(head.x + Math.cos(eyeAngle + 0.3) * 4, head.y + Math.sin(eyeAngle + 0.3) * 4, 1.8, 0, Math.PI * 2);
  ctx.arc(head.x + Math.cos(eyeAngle - 0.3) * 4, head.y + Math.sin(eyeAngle - 0.3) * 4, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawGrid();

  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, W, H);

  for (const food of state.foods) drawFood(food);

  const others = state.players
    .slice()
    .sort((a, b) => (a.id === playerId ? 1 : 0) - (b.id === playerId ? 1 : 0));

  for (const player of others) drawSnake(player);

  if (joined) {
    socket.emit('input', { angle: targetAngle, boost });
  }

  requestAnimationFrame(render);
}

>>>>>>> 04574cc9ba400a2271bd4efd6ac4556ae7d38114
render();