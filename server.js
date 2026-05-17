const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const { randomUUID } = require('crypto');

const app = express();
const httpServer = http.createServer(app);

app.use(express.static('public'));

const io = new Server(httpServer, {
  cors: { origin: '*' },
  pingTimeout: 20000,
  pingInterval: 25000
});

const TICK_RATE = 60;
const WORLD_SIZE = 4000;
const GRID_SIZE = 200;
const VIEW_DISTANCE = 800;
const PLAYER_RADIUS = 12;
const FOOD_RADIUS = 20;
const BODY_SKIP = 4;
const FOOD_TARGET = 500;

const gameState = {
  players: new Map(),
  foods: [],
  powerups: []
};

function getGridKey(x, y) {
  return `${Math.floor(x / GRID_SIZE)}_${Math.floor(y / GRID_SIZE)}`;
}

function getNeighborKeys(x, y) {
  const gx = Math.floor(x / GRID_SIZE);
  const gy = Math.floor(y / GRID_SIZE);
  const keys = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      keys.push(`${gx + dx}_${gy + dy}`);
    }
  }
  return keys;
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function spawnFood() {
  while (gameState.foods.length < FOOD_TARGET) {
    gameState.foods.push({
      id: randomUUID(),
      x: Math.random() * WORLD_SIZE,
      y: Math.random() * WORLD_SIZE,
      type: ['cherry', 'donut', 'candy', 'cake', 'orb'][Math.floor(Math.random() * 5)],
      value: 10 + Math.floor(Math.random() * 20)
    });
  }
}

function pointCollidesWithBody(px, py, body, startIndex = 0) {
  for (let i = startIndex; i < body.length; i++) {
    if (Math.hypot(px - body[i].x, py - body[i].y) < PLAYER_RADIUS) return true;
  }
  return false;
}

function killPlayer(victim, killer = null) {
  if (!victim || !victim.alive) return;

  victim.alive = false;
  victim.speed = 0;

  victim.body.forEach((seg, i) => {
    if (i % 3 === 0) {
      gameState.foods.push({
        id: randomUUID(),
        x: seg.x + (Math.random() - 0.5) * 30,
        y: seg.y + (Math.random() - 0.5) * 30,
        type: 'orb',
        value: 25
      });
    }
  });

  io.to(victim.id).emit('death', {
    killer: killer ? killer.name : null,
    score: victim.score
  });

  io.emit('explosion', {
    x: victim.x,
    y: victim.y,
    color: victim.skin
  });
}

io.on('connection', (socket) => {
  socket.on('join', ({ name, skin }) => {
    if (gameState.players.has(socket.id)) return;

    const safeName = (name || 'Player')
      .substring(0, 16)
      .replace(/[^p{L}p{N}s_]/gu, '');

    const player = {
      id: socket.id,
      name: safeName,
      x: Math.random() * (WORLD_SIZE - 400) + 200,
      y: Math.random() * (WORLD_SIZE - 400) + 200,
      angle: Math.random() * Math.PI * 2,
      targetAngle: Math.random() * Math.PI * 2,
      speed: 2.5,
      baseSpeed: 2.5,
      boostSpeed: 5,
      score: 0,
      length: 10,
      body: [],
      skin: skin || 'neon',
      alive: true,
      boost: false,
      lastInputAt: Date.now()
    };

    for (let i = 0; i < player.length; i++) {
      player.body.push({ x: player.x, y: player.y });
    }

    gameState.players.set(socket.id, player);
    socket.emit('init', { playerId: socket.id, worldSize: WORLD_SIZE });
  });

  socket.on('input', ({ angle, boost }) => {
    const player = gameState.players.get(socket.id);
    if (!player || !player.alive || typeof angle !== 'number') return;

    const now = Date.now();
    const dt = Math.max((now - player.lastInputAt) / 1000, 0.001);
    const maxTurnRate = Math.PI * 2;

    let desired = normalizeAngle(angle);
    let diff = normalizeAngle(desired - player.angle);
    const maxDiff = maxTurnRate * dt;

    if (Math.abs(diff) > maxDiff) {
      desired = normalizeAngle(player.angle + Math.sign(diff) * maxDiff);
    }

    player.targetAngle = desired;
    player.boost = !!boost;
    player.speed = player.boost ? player.boostSpeed : player.baseSpeed;
    player.lastInputAt = now;
  });

  socket.on('disconnect', (reason) => {
    const player = gameState.players.get(socket.id);
    if (player && player.alive) killPlayer(player, null);
    gameState.players.delete(socket.id);
  });
});

setInterval(() => {
  const spatialGrid = new Map();
  const occupiedFoods = new Set();
  const deadPlayers = [];

  gameState.players.forEach((player) => {
    if (!player.alive) return;

    const diff = normalizeAngle(player.targetAngle - player.angle);
    player.angle = normalizeAngle(player.angle + diff * 0.15);

    const newX = player.x + Math.cos(player.angle) * player.speed;
    const newY = player.y + Math.sin(player.angle) * player.speed;

    player.x = Math.max(20, Math.min(WORLD_SIZE - 20, newX));
    player.y = Math.max(20, Math.min(WORLD_SIZE - 20, newY));

    player.body.unshift({ x: player.x, y: player.y });
    while (player.body.length > player.length) player.body.pop();

    const key = getGridKey(player.x, player.y);
    if (!spatialGrid.has(key)) spatialGrid.set(key, []);
    spatialGrid.get(key).push(player);
  });

  gameState.players.forEach((player) => {
    if (!player.alive) return;

    for (const food of gameState.foods) {
      if (occupiedFoods.has(food.id)) continue;

      if (Math.hypot(player.x - food.x, player.y - food.y) < FOOD_RADIUS) {
        occupiedFoods.add(food.id);
        player.length += 2;
        player.score += food.value;

        io.to(player.id).emit('eat', {
          food,
          newScore: player.score,
          newLength: player.length
        });
      }
    }
  });

  if (occupiedFoods.size) {
    gameState.foods = gameState.foods.filter(f => !occupiedFoods.has(f.id));
  }

  gameState.players.forEach((player) => {
    if (!player.alive) return;

    const checkedPlayers = new Set();
    let collided = false;

    for (const key of getNeighborKeys(player.x, player.y)) {
      if (collided) break;

      const neighbors = spatialGrid.get(key) || [];
      for (const other of neighbors) {
        if (other.id === player.id || !other.alive || checkedPlayers.has(other.id)) continue;
        checkedPlayers.add(other.id);

        if (pointCollidesWithBody(player.x, player.y, other.body, BODY_SKIP)) {
          deadPlayers.push({ victim: player, killer: other });
          collided = true;
          break;
        }
      }
    }
  });

  deadPlayers.forEach(({ victim, killer }) => killPlayer(victim, killer));

  spawnFood();

  gameState.players.forEach((player) => {
    const nearbyPlayers = [];
    const nearbyFood = [];
    const seenPlayers = new Set();

    for (const key of getNeighborKeys(player.x, player.y)) {
      const cellPlayers = spatialGrid.get(key) || [];
      for (const p of cellPlayers) {
        if (!p.alive || seenPlayers.has(p.id)) continue;
        if (Math.hypot(p.x - player.x, p.y - player.y) < VIEW_DISTANCE) {
          seenPlayers.add(p.id);
          nearbyPlayers.push({
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            angle: p.angle,
            body: p.body,
            skin: p.skin,
            score: p.score,
            alive: p.alive
          });
        }
      }
    }

    for (const f of gameState.foods) {
      if (Math.hypot(f.x - player.x, f.y - player.y) < VIEW_DISTANCE) {
        nearbyFood.push(f);
      }
    }

    io.to(player.id).emit('state', {
      players: nearbyPlayers,
      foods: nearbyFood,
      timestamp: Date.now()
    });
  });
}, 1000 / TICK_RATE);

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
});

httpServer.listen(3000, () => console.log('Arena Server running on :3000'));