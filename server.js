const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]);
  return code;
}

function generateSessionToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Game Config
const ARENA_WIDTH = 40;
const ARENA_DEPTH = 30;
const PLAYER_SPEED = 3.5; // base speed m/s
const TICK_RATE = 20;
const TICK_TIME = 1000 / TICK_RATE; // 50ms
const RECONNECT_TIMEOUT = 30000;

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function resolveBoxCollision(entity, box, radius) {
  const minX = box.x - 0.75 - radius;
  const maxX = box.x + 0.75 + radius;
  const minZ = box.z - 0.3 - radius;
  const maxZ = box.z + 0.3 - radius;
  if (entity.x > minX && entity.x < maxX && entity.z > minZ && entity.z < maxZ) {
    const penLeft = entity.x - minX;
    const penRight = maxX - entity.x;
    const penTop = entity.z - minZ;
    const penBottom = maxZ - entity.z;
    const minPen = Math.min(penLeft, penRight, penTop, penBottom);
    if (minPen === penLeft) entity.x = minX;
    else if (minPen === penRight) entity.x = maxX;
    else if (minPen === penTop) entity.z = minZ;
    else entity.z = maxZ;
    return true;
  }
  return false;
}

function resolveCrateCollision(entity, crate, radius) {
  const minX = crate.x - 0.35 - radius;
  const maxX = crate.x + 0.35 + radius;
  const minZ = crate.z - 0.35 - radius;
  const maxZ = crate.z + 0.35 + radius;
  if (entity.x > minX && entity.x < maxX && entity.z > minZ && entity.z < maxZ) {
    const penLeft = entity.x - minX;
    const penRight = maxX - entity.x;
    const penTop = entity.z - minZ;
    const penBottom = maxZ - entity.z;
    const minPen = Math.min(penLeft, penRight, penTop, penBottom);
    if (minPen === penLeft) entity.x = minX;
    else if (minPen === penRight) entity.x = maxX;
    else if (minPen === penTop) entity.z = minZ;
    else entity.z = maxZ;
    return true;
  }
  return false;
}

function spawnCovers(room) {
  room.covers = {};
  const coverPositions = [
    { x: -10, z: -5 },
    { x: -10, z: 5 },
    { x: 10, z: -5 },
    { x: 10, z: 5 },
    { x: -5, z: -8 },
    { x: 5, z: -8 },
    { x: -5, z: 8 },
    { x: 5, z: 8 }
  ];
  coverPositions.forEach((pos, idx) => {
    const id = 'cover_' + (idx + 1);
    room.covers[id] = {
      id: id,
      x: pos.x,
      z: pos.z,
      hp: 200,
      maxHp: 200
    };
  });
}

function spawnBarrels(room) {
  room.barrels = {};
  const positions = [
    { x: -16, z: -11 },
    { x: 16, z: -11 },
    { x: -16, z: 11 },
    { x: 16, z: 11 }
  ];
  positions.forEach((pos, idx) => {
    const id = 'barrel_' + (idx + 1);
    room.barrels[id] = {
      id: id,
      x: pos.x,
      z: pos.z,
      hp: 10,
      maxHp: 10
    };
  });
}

function spawnPoisonPuddle(room, x, z, ownerId) {
  if (!room.puddles) room.puddles = [];
  const playerPuddles = room.puddles.filter(p => p.ownerId === ownerId);
  if (playerPuddles.length >= 3) {
    const oldest = playerPuddles[0];
    const idx = room.puddles.indexOf(oldest);
    if (idx !== -1) room.puddles.splice(idx, 1);
  }
  const puddleId = 'puddle_' + (++room.scrapIdCounter);
  room.puddles.push({
    id: puddleId,
    x: x,
    z: z,
    radius: 2.0,
    endTime: Date.now() + 5000,
    ownerId: ownerId
  });
  io.to(room.roomCode).emit('puddle-spawn', { id: puddleId, x, z, radius: 2.0 });
}

function handleBarrelExplosion(room, barrelId) {
  const barrel = room.barrels[barrelId];
  if (!barrel) return;
  
  delete room.barrels[barrelId];
  
  const radius = 4.0;
  const maxDmg = 30.0;
  
  // 1. Damage and knockback players
  for (const pId in room.players) {
    const player = room.players[pId];
    if (player.disconnected || player.hp <= 0 || player.isDowned) continue;
    
    const dist = Math.hypot(player.x - barrel.x, player.z - barrel.z);
    if (dist <= radius) {
      const dmg = maxDmg * (1 - dist / radius);
      player.hp = Math.max(0, player.hp - dmg);
      
      const angle = Math.atan2(player.x - barrel.x, player.z - barrel.z);
      player.x += Math.sin(angle) * 2.0;
      player.z += Math.cos(angle) * 2.0;
      
      const margin = 0.5;
      player.x = Math.max(-ARENA_WIDTH / 2 + margin, Math.min(ARENA_WIDTH / 2 - margin, player.x));
      player.z = Math.max(-ARENA_DEPTH / 2 + margin, Math.min(ARENA_DEPTH / 2 - margin, player.z));
      
      if (player.hp <= 0) {
        triggerDowned(room, player.playerId);
      }
      
      io.to(room.roomCode).emit('player-hit', { playerId: player.playerId, hp: player.hp, damage: dmg });
    }
  }
  
  // 2. Damage and knockback mutants
  for (const enemyId in room.enemies) {
    const enemy = room.enemies[enemyId];
    const dist = Math.hypot(enemy.x - barrel.x, enemy.z - barrel.z);
    if (dist <= radius) {
      const dmg = maxDmg * (1 - dist / radius);
      enemy.hp -= dmg;
      
      const angle = Math.atan2(enemy.x - barrel.x, enemy.z - barrel.z);
      enemy.x += Math.sin(angle) * 2.0;
      enemy.z += Math.cos(angle) * 2.0;
      
      const margin = 0.4;
      enemy.x = Math.max(-ARENA_WIDTH / 2 + margin, Math.min(ARENA_WIDTH / 2 - margin, enemy.x));
      enemy.z = Math.max(-ARENA_DEPTH / 2 + margin, Math.min(ARENA_DEPTH / 2 - margin, enemy.z));
      
      io.to(room.roomCode).emit('enemy-hit', { enemyId: enemy.id, damage: dmg, x: enemy.x, z: enemy.z });
      
      if (enemy.hp <= 0) {
        handleEnemyDeath(room, enemyId, null);
      }
    }
  }
  
  io.to(room.roomCode).emit('barrel-detonate', { barrelId, x: barrel.x, z: barrel.z, radius });
}

function handleCrateDeath(activeRoom, crateId) {
  const crate = activeRoom.crates[crateId];
  if (!crate) return;
  delete activeRoom.crates[crateId];
  const isWp = Math.random() < 0.5;
  if (isWp) {
    for (let k = 0; k < 2; k++) {
      const wpId = 'wp_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[wpId] = {
        id: wpId,
        type: 'wp',
        x: crate.x + (Math.random() - 0.5) * 1.0,
        z: crate.z + (Math.random() - 0.5) * 1.0,
        quantity: 1
      };
    }
  } else {
    for (let k = 0; k < 5; k++) {
      const scrapId = 'scrap_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[scrapId] = {
        id: scrapId,
        x: crate.x + (Math.random() - 0.5) * 1.0,
        z: crate.z + (Math.random() - 0.5) * 1.0,
        quantity: 1
      };
    }
  }
  io.to(activeRoom.roomCode).emit('crate-destroyed', { crateId, x: crate.x, z: crate.z });
}

function handleEnemyDeath(activeRoom, enemyId, owner, killerWeapon = null) {
  const enemy = activeRoom.enemies[enemyId];
  if (!enemy) return;
  if (enemy.type !== 'boss_hammer' && enemy.type !== 'boss_swarm' && enemy.type !== 'boss_drone' && enemy.type !== 'boss_razlom' && enemy.type !== 'boss_general' && enemy.type !== 'kamikaze' && enemy.type !== 'spider') {
    if (!activeRoom.corpses) activeRoom.corpses = [];
    activeRoom.corpses.push({
      x: enemy.x,
      z: enemy.z,
      type: enemy.type,
      time: Date.now()
    });
  }
  const deadType = enemy.type;
  delete activeRoom.enemies[enemyId];
  let scoreGain = 10;
  if (deadType === 'boss_hammer') scoreGain = 500;
  else if (deadType === 'boss_swarm') scoreGain = 800;
  else if (deadType === 'boss_drone') scoreGain = 1000;
  else if (deadType === 'boss_razlom') scoreGain = 1500;
  else if (deadType === 'boss_general') scoreGain = 5000;

  // Combo multiplier tracking (decay after 3s, max x10)
  const now = Date.now();
  if (!activeRoom.combo) activeRoom.combo = { count: 0, multiplier: 1, lastKillTime: 0 };
  if (now - activeRoom.combo.lastKillTime < 3000) {
    activeRoom.combo.count = Math.min(10, activeRoom.combo.count + 1);
  } else {
    activeRoom.combo.count = 1;
  }
  activeRoom.combo.lastKillTime = now;
  activeRoom.combo.multiplier = activeRoom.combo.count;
  
  const finalScore = scoreGain * activeRoom.combo.multiplier;
  activeRoom.score += finalScore;
  
  if (activeRoom.combo.multiplier > 1) {
    io.to(activeRoom.roomCode).emit('combo-update', {
      count: activeRoom.combo.count,
      multiplier: activeRoom.combo.multiplier,
      x: enemy.x,
      z: enemy.z
    });
  }

  if (owner) owner.kills += 1;
  if (deadType === 'boss_general') {
    // VICTORY! Final boss defeated
    activeRoom.gameStarted = false;
    io.to(activeRoom.roomCode).emit('game-victory', {
      round: activeRoom.round,
      score: activeRoom.score,
      stats: Object.values(activeRoom.players).map(p => ({
        playerId: p.playerId,
        nickname: p.nickname,
        damage: p.damageDealt,
        kills: p.kills,
        revives: p.revives,
        isHost: p.isHost
      }))
    });
    return;
  } else if (deadType === 'boss_razlom') {
    const bpId = 'bp_' + (++activeRoom.scrapIdCounter);
    activeRoom.scrap[bpId] = { id: bpId, type: 'blueprint', blueprintType: 'bp40', x: enemy.x, z: enemy.z, quantity: 1 };
    for (let k = 0; k < 15; k++) {
      const wpId = 'wp_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[wpId] = {
        id: wpId,
        type: 'wp',
        x: enemy.x + (Math.random() - 0.5) * 2.0,
        z: enemy.z + (Math.random() - 0.5) * 2.0,
        quantity: 1
      };
    }
    io.to(activeRoom.roomCode).emit('boss-razlom-dead', { x: enemy.x, z: enemy.z });
  } else if (deadType === 'boss_hammer') {
    const bpId = 'bp_' + (++activeRoom.scrapIdCounter);
    activeRoom.scrap[bpId] = { id: bpId, type: 'blueprint', blueprintType: 'bp10', x: enemy.x, z: enemy.z, quantity: 1 };
    for (let k = 0; k < 15; k++) {
      const wpId = 'wp_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[wpId] = {
        id: wpId,
        type: 'wp',
        x: enemy.x + (Math.random() - 0.5) * 1.8,
        z: enemy.z + (Math.random() - 0.5) * 1.8,
        quantity: 1
      };
    }
  } else if (deadType === 'boss_swarm') {
    const bpId = 'bp_' + (++activeRoom.scrapIdCounter);
    activeRoom.scrap[bpId] = { id: bpId, type: 'blueprint', blueprintType: 'bp20', x: enemy.x, z: enemy.z, quantity: 1 };
    for (let k = 0; k < 20; k++) {
      const wpId = 'wp_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[wpId] = {
        id: wpId,
        type: 'wp',
        x: enemy.x + (Math.random() - 0.5) * 2.2,
        z: enemy.z + (Math.random() - 0.5) * 2.2,
        quantity: 1
      };
    }
  } else if (deadType === 'boss_drone') {
    const bpId = 'bp_' + (++activeRoom.scrapIdCounter);
    activeRoom.scrap[bpId] = { id: bpId, type: 'blueprint', blueprintType: 'bp30', x: enemy.x, z: enemy.z, quantity: 1 };
    for (let k = 0; k < 16; k++) {
      const wpId = 'wp_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[wpId] = {
        id: wpId,
        type: 'wp',
        x: enemy.x + (Math.random() - 0.5) * 2.5,
        z: enemy.z + (Math.random() - 0.5) * 2.5,
        quantity: 1
      };
    }
  } else if (deadType === 'tank') {
    const count = Math.floor(Math.random() * 2) + 2;
    for (let k = 0; k < count; k++) {
      const wpId = 'wp_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[wpId] = {
        id: wpId,
        type: 'wp',
        x: enemy.x + (Math.random() - 0.5) * 1.0,
        z: enemy.z + (Math.random() - 0.5) * 1.0,
        quantity: 1
      };
    }
  } else if (deadType === 'shooter' || deadType === 'shieldbearer') {
    const count = Math.floor(Math.random() * 2) + 1;
    for (let k = 0; k < count; k++) {
      const wpId = 'wp_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[wpId] = {
        id: wpId,
        type: 'wp',
        x: enemy.x + (Math.random() - 0.5) * 1.0,
        z: enemy.z + (Math.random() - 0.5) * 1.0,
        quantity: 1
      };
    }
  } else if (deadType === 'sprinter' || deadType === 'kamikaze') {
    const count = Math.floor(Math.random() * 2) + 1;
    for (let k = 0; k < count; k++) {
      const scrapId = 'scrap_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[scrapId] = {
        id: scrapId,
        x: enemy.x + (Math.random() - 0.5) * 1.0,
        z: enemy.z + (Math.random() - 0.5) * 1.0,
        quantity: 1
      };
    }
  } else if (deadType === 'necromancer') {
    const count = Math.floor(Math.random() * 3) + 3;
    for (let k = 0; k < count; k++) {
      const scrapId = 'scrap_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[scrapId] = {
        id: scrapId,
        x: enemy.x + (Math.random() - 0.5) * 1.0,
        z: enemy.z + (Math.random() - 0.5) * 1.0,
        quantity: 1
      };
    }
  } else {
    const count = Math.floor(Math.random() * 2) + 2;
    for (let k = 0; k < count; k++) {
      const scrapId = 'scrap_' + (++activeRoom.scrapIdCounter);
      activeRoom.scrap[scrapId] = {
        id: scrapId,
        x: enemy.x + (Math.random() - 0.5) * 1.0,
        z: enemy.z + (Math.random() - 0.5) * 1.0,
        quantity: 1
      };
    }
  }
  io.to(activeRoom.roomCode).emit('enemy-killed', { 
    enemyId: enemyId, 
    x: enemy.x, 
    z: enemy.z,
    weapon: killerWeapon ? killerWeapon : (owner ? owner.currentWeapon : null),
    ownerX: owner ? owner.x : null,
    ownerZ: owner ? owner.z : null
  });
}

function startGameLoop(roomCode) {
  const room = rooms[roomCode];
  if (!room || room.tickInterval) return;

  room.tickInterval = setInterval(() => {
    const activeRoom = rooms[roomCode];
    if (!activeRoom) {
      clearInterval(room.tickInterval);
      return;
    }

    const playerIds = Object.keys(activeRoom.players);
    const pCount = playerIds.length;

    // Reconnection checks
    const now = Date.now();
    playerIds.forEach(pId => {
      const p = activeRoom.players[pId];
      if (p.disconnected && now - p.disconnectTime > RECONNECT_TIMEOUT) {
        console.log(`Player ${p.nickname} (${pId}) reconnect timeout.`);
        delete activeRoom.players[pId];
        io.to(roomCode).emit('player-left', { playerId: pId });
      }
    });

    if (Object.keys(activeRoom.players).length === 0) {
      clearInterval(activeRoom.tickInterval);
      delete rooms[roomCode];
      return;
    }

    if (activeRoom.gameStarted) {
      const p1Id = playerIds[0];
      const p2Id = playerIds[1];
      const p1 = activeRoom.players[p1Id];
      const p2 = activeRoom.players[p2Id];

      // Game Over check: all players are downed or dead
      const aliveAndUpPlayers = Object.values(activeRoom.players).filter(p => !p.disconnected && p.hp > 0 && !p.isDowned);
      if (aliveAndUpPlayers.length === 0 && Object.keys(activeRoom.players).length > 0) {
        console.log(`All players defeated in room ${roomCode}. Game Over.`);
        activeRoom.gameStarted = false;
        
        io.to(roomCode).emit('game-over', {
          round: activeRoom.round,
          score: activeRoom.score,
          stats: Object.values(activeRoom.players).map(p => ({
            playerId: p.playerId,
            nickname: p.nickname,
            damage: p.damageDealt,
            kills: p.kills,
            revives: p.revives,
            isHost: p.isHost
          }))
        });
        return;
      }

      // --- 1. ROUND PROGRESSION TIMERS ---
      if (activeRoom.roundState === 'intermission') {
        activeRoom.roundTimer -= TICK_TIME / 1000;
        if (activeRoom.roundTimer <= 0) {
          // Start the round
          activeRoom.roundState = 'wave';
          activeRoom.roundTimer = 30.0; // 30 seconds round timer
          activeRoom.bullets = [];
          activeRoom.projectiles = [];
          activeRoom.scrap = {}; // Clear scrap at the START of the new wave, giving players the whole intermission to collect it
          
          playerIds.forEach(pId => {
            const p = activeRoom.players[pId];
            if (p) p.scrapTransferredThisRound = 0;
          });

          // Check if it is a Boss Round
          const isBossRound = (activeRoom.round % 10 === 0);

          if (isBossRound) {
            activeRoom.roundTimer = 9999; // infinite round time until boss dies
            
            const bossId = 'boss_' + (++activeRoom.enemyIdCounter);

            if (activeRoom.round === 40) {
              // Boss Разлом (Teleporter)
              const baseBossHp = 1800;
              const bossHp = activeRoom.soloMode ? baseBossHp * 0.70 : baseBossHp;
              activeRoom.enemies[bossId] = {
                id: bossId,
                type: 'boss_razlom',
                x: 0, z: -10,
                hp: bossHp, maxHp: bossHp,
                speed: 2.5,
                damage: 22,
                slowExpires: 0,
                angle: 0,
                lastAttackTime: 0,
                teleportTimer: 5.0,
                isWarping: false,
                warpWarningTimer: 0,
                warpTargetX: 0,
                warpTargetZ: 0,
                strikeTimer: 0,
                strikeCount: 0,
                riftTimer: 0
              };
              // Also spawn crowd of normal enemies
              const crowdCount = activeRoom.soloMode ? 4 : 8;
              const portals = [[-18,-13],[18,-13],[-18,13],[18,13]];
              const scalingFactorHp = 1 + 0.08 * (activeRoom.round - 1);
              const scalingFactorDmg = 1 + 0.05 * (activeRoom.round - 1);
              for (let i = 0; i < crowdCount; i++) {
                const portal = portals[i % 4];
                const eId2 = 'enemy_' + (++activeRoom.enemyIdCounter);
                activeRoom.enemies[eId2] = {
                  id: eId2, type: 'shooter',
                  x: portal[0] + (Math.random()-0.5)*2, z: portal[1] + (Math.random()-0.5)*2,
                  hp: 25 * scalingFactorHp, maxHp: 25 * scalingFactorHp,
                  speed: 1.5, damage: 8 * scalingFactorDmg,
                  slowExpires: 0, angle: 0, lastAttackTime: 0, lastShotTime: 0
                };
              }
              console.log(`Spawning Boss Разлом in room ${roomCode}. HP: ${bossHp}`);
              io.to(roomCode).emit('round-started', { round: activeRoom.round, isBoss: true, bossType: 'boss_razlom' });

            } else if (activeRoom.round === 50) {
              // Boss Генерал (Final Boss, 3 phases)
              const baseBossHp = 3000;
              const bossHp = activeRoom.soloMode ? baseBossHp * 0.70 : baseBossHp;
              activeRoom.enemies[bossId] = {
                id: bossId,
                type: 'boss_general',
                x: 0, z: -10,
                hp: bossHp, maxHp: bossHp,
                speed: 2.0, damage: 25,
                slowExpires: 0, angle: 0,
                lastAttackTime: 0,
                // Phase system: 1=Hammer, 2=Drone, 3=Teleporter
                phase: 1,
                // Hammer phase
                enrageTimer: 15.0, isEnraged: false,
                // Drone phase
                shootTimer: 3.0, spawnTimer: 8.0,
                // Teleporter phase
                teleportTimer: 4.0, isWarping: false, warpWarningTimer: 0,
                warpTargetX: 0, warpTargetZ: 0
              };
              // Spawn crowd
              const crowdCount2 = activeRoom.soloMode ? 5 : 10;
              const portals2 = [[-18,-13],[18,-13],[-18,13],[18,13]];
              const scalingFactorHp2 = 1 + 0.08 * (activeRoom.round - 1);
              const scalingFactorDmg2 = 1 + 0.05 * (activeRoom.round - 1);
              for (let i = 0; i < crowdCount2; i++) {
                const portal = portals2[i % 4];
                const eId2 = 'enemy_' + (++activeRoom.enemyIdCounter);
                const isShooter = i % 2 === 0;
                activeRoom.enemies[eId2] = {
                  id: eId2, type: isShooter ? 'shooter' : 'tank',
                  x: portal[0] + (Math.random()-0.5)*2, z: portal[1] + (Math.random()-0.5)*2,
                  hp: (isShooter ? 25 : 80) * scalingFactorHp2,
                  maxHp: (isShooter ? 25 : 80) * scalingFactorHp2,
                  speed: isShooter ? 1.5 : 1.2,
                  damage: (isShooter ? 8 : 15) * scalingFactorDmg2,
                  slowExpires: 0, angle: 0, lastAttackTime: 0, lastShotTime: 0
                };
              }
              console.log(`Spawning FINAL BOSS Генерал in room ${roomCode}. HP: ${bossHp}`);
              io.to(roomCode).emit('round-started', { round: activeRoom.round, isBoss: true, bossType: 'boss_general' });

            } else {
              const baseBossHp = activeRoom.round === 10 ? 500 : (activeRoom.round === 20 ? 800 : 1200);
              const bossHp = activeRoom.soloMode ? baseBossHp * 0.70 : baseBossHp;

              let bossType = 'boss_hammer';
              if (activeRoom.round === 20) bossType = 'boss_swarm';
              else if (activeRoom.round === 30) bossType = 'boss_drone';
              else if (activeRoom.round > 30) {
                const types = ['boss_hammer', 'boss_swarm', 'boss_drone'];
                bossType = types[Math.floor(Math.random() * types.length)];
              }

              activeRoom.enemies[bossId] = {
                id: bossId,
                type: bossType,
                x: 0, z: -10,
                hp: bossHp, maxHp: bossHp,
                speed: bossType === 'boss_swarm' ? 1.0 : (bossType === 'boss_drone' ? 2.2 : 2.0),
                damage: bossType === 'boss_swarm' ? 15 : (bossType === 'boss_drone' ? 10 : 20),
                slowExpires: 0, angle: 0, lastAttackTime: 0,
                enrageTimer: 20.0, isEnraged: false,
                spawnTimer: 6.0, bellyOpenTimer: 0, isBellyOpen: false,
                landTimer: 12.0, landDuration: 0, isLanded: false, shootTimer: 4.0
              };
              console.log(`Spawning Boss ${bossType} in room ${roomCode}. HP: ${bossHp}`);
              io.to(roomCode).emit('round-started', { round: activeRoom.round, isBoss: true, bossType });
            }
          } else {
            // Normal Round Spawning
            let enemyCount = 6 + (activeRoom.round * 2);
            if (activeRoom.soloMode) {
              enemyCount = Math.max(1, Math.round(enemyCount * 0.6));
            }

            const portals = [
              [-18, -13],
              [18, -13],
              [-18, 13],
              [18, 13]
            ];

            // Wave Scaling factor
            const scalingFactorHp = 1 + 0.08 * (activeRoom.round - 1);
            const scalingFactorDmg = 1 + 0.05 * (activeRoom.round - 1);

            for (let i = 0; i < enemyCount; i++) {
              const portal = portals[i % 4];
              const enemyId = 'enemy_' + (++activeRoom.enemyIdCounter);
              
              let enemyType = 'meat';
              let hp = 15 * scalingFactorHp;
              let dmg = 5 * scalingFactorDmg;
              let speed = 2.0;
              let shieldHp = 0;

              const rand = Math.random();
              
              if (activeRoom.round >= 15) {
                if (rand < 0.10) {
                  enemyType = 'necromancer';
                  hp = 40 * scalingFactorHp;
                  dmg = 0;
                  speed = 1.5;
                } else if (rand < 0.20) {
                  enemyType = 'shieldbearer';
                  hp = 30 * scalingFactorHp;
                  shieldHp = 60 * scalingFactorHp;
                  dmg = 8 * scalingFactorDmg;
                  speed = 1.4;
                } else if (rand < 0.30) {
                  enemyType = 'kamikaze';
                  hp = 20 * scalingFactorHp;
                  dmg = 0;
                  speed = 4.0;
                } else if (rand < 0.40) {
                  enemyType = 'shooter';
                  hp = 25 * scalingFactorHp;
                  dmg = 8 * scalingFactorDmg;
                  speed = 1.5;
                } else if (rand < 0.55) {
                  enemyType = 'tank';
                  hp = 80 * scalingFactorHp;
                  dmg = 15 * scalingFactorDmg;
                  speed = 1.2;
                } else if (rand < 0.70) {
                  enemyType = 'sprinter';
                  hp = 8 * scalingFactorHp;
                  dmg = 4 * scalingFactorDmg;
                  speed = 4.5;
                }
              } else if (activeRoom.round >= 12) {
                if (rand < 0.10) {
                  enemyType = 'shieldbearer';
                  hp = 30 * scalingFactorHp;
                  shieldHp = 60 * scalingFactorHp;
                  dmg = 8 * scalingFactorDmg;
                  speed = 1.4;
                } else if (rand < 0.20) {
                  enemyType = 'kamikaze';
                  hp = 20 * scalingFactorHp;
                  dmg = 0;
                  speed = 4.0;
                } else if (rand < 0.30) {
                  enemyType = 'shooter';
                  hp = 25 * scalingFactorHp;
                  dmg = 8 * scalingFactorDmg;
                  speed = 1.5;
                } else if (rand < 0.45) {
                  enemyType = 'tank';
                  hp = 80 * scalingFactorHp;
                  dmg = 15 * scalingFactorDmg;
                  speed = 1.2;
                } else if (rand < 0.60) {
                  enemyType = 'sprinter';
                  hp = 8 * scalingFactorHp;
                  dmg = 4 * scalingFactorDmg;
                  speed = 4.5;
                }
              } else if (activeRoom.round >= 7) {
                if (rand < 0.10) {
                  enemyType = 'shooter';
                  hp = 25 * scalingFactorHp;
                  dmg = 8 * scalingFactorDmg;
                  speed = 1.5;
                } else if (rand < 0.30) {
                  enemyType = 'tank';
                  hp = 80 * scalingFactorHp;
                  dmg = 15 * scalingFactorDmg;
                  speed = 1.2;
                } else if (rand < 0.50) {
                  enemyType = 'sprinter';
                  hp = 8 * scalingFactorHp;
                  dmg = 4 * scalingFactorDmg;
                  speed = 4.5;
                }
              } else if (activeRoom.round >= 5) {
                if (rand < 0.20) {
                  enemyType = 'tank';
                  hp = 80 * scalingFactorHp;
                  dmg = 15 * scalingFactorDmg;
                  speed = 1.2;
                } else if (rand < 0.40) {
                  enemyType = 'sprinter';
                  hp = 8 * scalingFactorHp;
                  dmg = 4 * scalingFactorDmg;
                  speed = 4.5;
                }
              } else if (activeRoom.round >= 3) {
                if (rand < 0.20) {
                  enemyType = 'sprinter';
                  hp = 8 * scalingFactorHp;
                  dmg = 4 * scalingFactorDmg;
                  speed = 4.5;
                }
              }

              activeRoom.enemies[enemyId] = {
                id: enemyId,
                type: enemyType,
                x: portal[0] + (Math.random() - 0.5) * 2,
                z: portal[1] + (Math.random() - 0.5) * 2,
                hp: hp,
                maxHp: hp,
                shieldHp: shieldHp,
                maxShieldHp: shieldHp,
                speed: speed,
                damage: dmg,
                slowExpires: 0,
                angle: 0,
                lastAttackTime: 0,
                lastShotTime: 0
              };
            }
            console.log(`Starting Wave ${activeRoom.round} in room ${roomCode}. Spawning ${enemyCount} enemies.`);
            io.to(roomCode).emit('round-started', { round: activeRoom.round, isBoss: false });
          }
        }
      } else if (activeRoom.roundState === 'wave') {
        activeRoom.roundTimer -= TICK_TIME / 1000;

        // Wave completes if all enemies are dead
        if (Object.keys(activeRoom.enemies).length === 0) {
          activeRoom.roundState = 'intermission';
          // Intermission safe period: 20s if after boss (round 10, 20, etc.), 12s otherwise
          const isAfterBoss = ((activeRoom.round) % 10 === 0);
          activeRoom.roundTimer = isAfterBoss ? 20.0 : 12.0;
          activeRoom.round += 1;
          activeRoom.bullets = [];
          activeRoom.projectiles = [];
          activeRoom.puddles = [];
          activeRoom.firePuddles = [];

          // Recover all players to full HP and revive if downed
          playerIds.forEach(pId => {
            const p = activeRoom.players[pId];
            if (p) {
              p.hp = 100;
              p.isDowned = false;
              p.downedTimeLeft = 0;
              p.reviveProgress = 0;
            }
          });

          // Spawn 2 resource crates every 5 rounds
          if (activeRoom.round % 5 === 0) {
            activeRoom.crates = {};
            for (let k = 0; k < 2; k++) {
              const crateId = 'crate_' + (++activeRoom.scrapIdCounter);
              let cx, cz;
              do {
                cx = (Math.random() - 0.5) * (ARENA_WIDTH - 4);
                cz = (Math.random() - 0.5) * (ARENA_DEPTH - 4);
              } while (Math.hypot(cx, cz) < 4.0); // at least 4m from center
              
              activeRoom.crates[crateId] = {
                id: crateId,
                x: cx,
                z: cz,
                hp: 30,
                maxHp: 30
              };
            }
            console.log(`Spawned 2 loot crates in room ${roomCode} for Round ${activeRoom.round}`);
            io.to(roomCode).emit('crates-spawned', { crates: activeRoom.crates });
          }

          // Spawn/respawn explosive barrels every 3 rounds
          if (activeRoom.round % 3 === 0) {
            spawnBarrels(activeRoom);
            console.log(`Respawned explosive barrels for Round ${activeRoom.round} in room ${roomCode}`);
          }

          console.log(`Wave completed in room ${roomCode}. Entering intermission (timer: ${activeRoom.roundTimer}s).`);
          io.to(roomCode).emit('round-completed', { nextRound: activeRoom.round, timer: activeRoom.roundTimer });
        }
      }

      // --- 2. PLAYER PHYSICS, CRAWLING & REVIALS ---
      playerIds.forEach(pId => {
        const p = activeRoom.players[pId];
        if (!p || p.disconnected) return;

        // A. Handle Downed State (Second Wind)
        if (p.isDowned) {
          p.downedTimeLeft -= TICK_TIME / 1000;
          p.shootingIntent = false; // Block shooting

          // If downed timer runs out, player dies completely
          if (p.downedTimeLeft <= 0) {
            p.hp = 0;
            p.isDowned = false;
            console.log(`Player ${p.nickname} bled out.`);
          }

          // Solo Auto-Revive Syringe logic (runs automatically after 4 seconds)
          if (activeRoom.soloMode && p.autoReviveTimer !== undefined) {
            p.autoReviveTimer -= TICK_TIME / 1000;
            if (p.autoReviveTimer <= 0) {
              p.isDowned = false;
              p.hp = 30; // revived with 30 HP
              delete p.autoReviveTimer;
              console.log(`Player ${p.nickname} self-revived via Syringe.`);
              io.to(roomCode).emit('revive-success', { playerId: pId, hp: p.hp });
            }
          }

          // Downed players crawl at 0.8 m/s
          if (p.xInput !== 0 || p.zInput !== 0) {
            const inputLen = Math.hypot(p.xInput, p.zInput);
            const normX = p.xInput / inputLen;
            const normZ = p.zInput / inputLen;
            
            p.x += normX * 0.8 * (TICK_TIME / 1000);
            p.z += normZ * 0.8 * (TICK_TIME / 1000);

            // Resolve covers & crates collision for crawling player
            const tempEntity = { x: p.x, z: p.z };
            if (activeRoom.covers) {
              for (const coverId in activeRoom.covers) {
                resolveBoxCollision(tempEntity, activeRoom.covers[coverId], 0.45);
              }
            }
            if (activeRoom.crates) {
              for (const crateId in activeRoom.crates) {
                resolveCrateCollision(tempEntity, activeRoom.crates[crateId], 0.45);
              }
            }
            p.x = tempEntity.x;
            p.z = tempEntity.z;

            const margin = 0.5;
            p.x = Math.max(-ARENA_WIDTH / 2 + margin, Math.min(ARENA_WIDTH / 2 - margin, p.x));
            p.z = Math.max(-ARENA_DEPTH / 2 + margin, Math.min(ARENA_DEPTH / 2 - margin, p.z));
          }
          return; // Skip normal crafting/firing logic
        }

        // B. Handle Crafting State
        if (p.isCrafting) {
          p.craftTimeLeft -= TICK_TIME / 1000;
          if (p.craftTimeLeft <= 0) {
            p.isCrafting = false;
            if (!p.weapons.includes(p.craftWeapon)) {
              p.weapons.push(p.craftWeapon);
            }
            p.currentWeapon = p.craftWeapon;
            console.log(`Player ${p.nickname} সскрафтил ${p.craftWeapon}`);
            io.to(roomCode).emit('craft-success', {
              playerId: pId,
              weapon: p.craftWeapon,
              weapons: p.weapons
            });
          }
        }

        // C. Teammate Reviving logic (holding interact button near downed teammate)
        const remoteId = playerIds.find(id => id !== pId);
        const teammate = activeRoom.players[remoteId];
        let isActivelyReviving = false;

        if (teammate && teammate.isDowned && !teammate.disconnected) {
          const distToTeammate = Math.hypot(p.x - teammate.x, p.z - teammate.z);
          // Reviver must hold shoot/craft intent while close (within 2m)
          if (distToTeammate <= 2.0 && p.shootingIntent) { // reuse shootingIntent trigger as holding action
            isActivelyReviving = true;
            p.shootingIntent = false; // block bullet spawning while reviving
            
            teammate.reviveProgress += TICK_TIME / 1000;
            io.to(roomCode).emit('revive-progress', { playerId: teammate.playerId, progress: teammate.reviveProgress });

            if (teammate.reviveProgress >= 4.0) { // 4s holds
              teammate.isDowned = false;
              teammate.hp = 30; // revive with 30 HP
              teammate.reviveProgress = 0;
              p.revives += 1;
              io.to(roomCode).emit('revive-success', { playerId: teammate.playerId, hp: teammate.hp });
              console.log(`Player ${p.nickname} revived teammate ${teammate.nickname}`);
            }
          } else {
            teammate.reviveProgress = 0;
          }
        }

        // D. Calculate movement speed dynamically (with slows/penalties)
        let activeSpeed = PLAYER_SPEED;
        
        if (p.currentWeapon === 'shotgun') {
          // no aiming penalty
        } else if (p.currentWeapon === 'ar') {
          // no base aiming penalty
        } else if (p.currentWeapon === 'sniper') {
          // slows player by 30% when holding/aiming
          activeSpeed *= 0.70; // 2.45 m/s
        } else if (p.currentWeapon === 'hmg') {
          // slows player by 40% when firing
          if (p.shootingIntent) {
            activeSpeed *= 0.60; // 2.1 m/s
          }
        }

        // E. Apply normal movement (immobilized if crafting or reviving teammate)
        if (!p.isCrafting && !isActivelyReviving && (p.xInput !== 0 || p.zInput !== 0)) {
          const inputLen = Math.hypot(p.xInput, p.zInput);
          const normX = p.xInput / inputLen;
          const normZ = p.zInput / inputLen;
          const scale = Math.min(inputLen, 1.0);

          p.x += normX * activeSpeed * scale * (TICK_TIME / 1000);
          p.z += normZ * activeSpeed * scale * (TICK_TIME / 1000);

          // Resolve covers & crates collision for player
          const tempEntity = { x: p.x, z: p.z };
          if (activeRoom.covers) {
            for (const coverId in activeRoom.covers) {
              resolveBoxCollision(tempEntity, activeRoom.covers[coverId], 0.45);
            }
          }
          if (activeRoom.crates) {
            for (const crateId in activeRoom.crates) {
              resolveCrateCollision(tempEntity, activeRoom.crates[crateId], 0.45);
            }
          }
          p.x = tempEntity.x;
          p.z = tempEntity.z;

          const margin = 0.5;
          p.x = Math.max(-ARENA_WIDTH / 2 + margin, Math.min(ARENA_WIDTH / 2 - margin, p.x));
          p.z = Math.max(-ARENA_DEPTH / 2 + margin, Math.min(ARENA_DEPTH / 2 - margin, p.z));
        }

        // F. Handle Weapon Heat Decays
        if (p.currentWeapon === 'ar' || p.currentWeapon === 'hmg') {
          const decay = p.currentWeapon === 'ar' ? 40 : 33.3; // HMG cools down in 3s -> 33.3/sec
          if (!p.shootingIntent || p.isOverheated) {
            p.heat = Math.max(0, p.heat - decay * (TICK_TIME / 1000));
            if (p.heat <= 0) p.isOverheated = false;
          }
        } else {
          if (p.heat > 0) {
            p.heat = Math.max(0, p.heat - 40 * (TICK_TIME / 1000));
            if (p.heat <= 0) p.isOverheated = false;
          }
        }

        // Ticks for energy and battery recharges
        const dt = TICK_TIME / 1000;
        if (p.currentWeapon === 'flamethrower') {
          if (p.shootingIntent && !p.isEnergyDepleted) {
            p.energy = Math.max(0, p.energy - 20 * dt);
            if (p.energy <= 0) p.isEnergyDepleted = true;
          } else {
            p.energy = Math.min(100, p.energy + 10 * dt);
            if (p.energy >= 20) p.isEnergyDepleted = false;
          }
        } else {
          p.energy = Math.min(100, p.energy + 10 * dt);
        }

        if (p.currentWeapon === 'tesla') {
          if (!p.shootingIntent) {
            p.battery = Math.min(80, p.battery + 8 * dt);
            if (p.battery >= 25) p.isBatteryDepleted = false;
          }
        } else {
          p.battery = Math.min(80, p.battery + 8 * dt);
        }

        // G. Firing Loops
        if (p.shootingIntent && !p.isCrafting && !isActivelyReviving) {
          if (p.currentWeapon === 'pistol') {
            if (now - p.lastShotTime >= 400) {
              p.lastShotTime = now;
              const vx = Math.sin(p.angle) * 22;
              const vz = Math.cos(p.angle) * 22;
              
              const basePistolDmg = 5;
              const currentPistolDmg = basePistolDmg * (1 + 0.05 * Math.floor((activeRoom.round - 1) / 10));

              const bulletId = 'bullet_' + (++activeRoom.bulletIdCounter);
              activeRoom.bullets.push({
                id: bulletId,
                ownerId: pId,
                x: p.x,
                z: p.z,
                vx: vx,
                vz: vz,
                damage: currentPistolDmg,
                range: 15.0,
                distTraveled: 0,
                type: 'pistol'
              });

              io.to(roomCode).emit('weapon-fired', { playerId: pId, weapon: 'pistol', x: p.x, z: p.z, angle: p.angle });
            }
          } else if (p.currentWeapon === 'shotgun') {
            if (now - p.lastShotTime >= 1480) {
              p.lastShotTime = now;
              
              const pelletCount = 6;
              const spread = 40 * Math.PI / 180;
              const baseAngle = p.angle;

              for (let i = 0; i < pelletCount; i++) {
                const offsetAngle = -spread / 2 + (spread / (pelletCount - 1)) * i;
                const finalAngle = baseAngle + offsetAngle;

                const vx = Math.sin(finalAngle) * 20;
                const vz = Math.cos(finalAngle) * 20;

                const bulletId = 'bullet_' + (++activeRoom.bulletIdCounter);
                activeRoom.bullets.push({
                  id: bulletId,
                  ownerId: pId,
                  x: p.x,
                  z: p.z,
                  vx: vx,
                  vz: vz,
                  damage: 8,
                  range: 7.0,
                  distTraveled: 0,
                  type: 'shotgun',
                  firedX: p.x,
                  firedZ: p.z,
                  pelletAngle: finalAngle
                });
              }

              io.to(roomCode).emit('weapon-fired', { playerId: pId, weapon: 'shotgun', x: p.x, z: p.z, angle: p.angle });
            }
          } else if (p.currentWeapon === 'ar') {
            if (!p.isOverheated) {
              if (now - p.lastShotTime >= 120) {
                p.lastShotTime = now;
                const vx = Math.sin(p.angle) * 25;
                const vz = Math.cos(p.angle) * 25;

                const bulletId = 'bullet_' + (++activeRoom.bulletIdCounter);
                activeRoom.bullets.push({
                  id: bulletId,
                  ownerId: pId,
                  x: p.x,
                  z: p.z,
                  vx: vx,
                  vz: vz,
                  damage: 7,
                  range: 18.0,
                  distTraveled: 0,
                  type: 'ar'
                });

                p.heat = Math.min(100, p.heat + 2.78);
                if (p.heat >= 100) p.isOverheated = true;

                io.to(roomCode).emit('weapon-fired', { playerId: pId, weapon: 'ar', x: p.x, z: p.z, angle: p.angle, heat: p.heat });
              }
            }
          } else if (p.currentWeapon === 'sniper') {
            // Sniper: 2.5s reload cooldown
            if (now - p.lastShotTime >= 2480) {
              p.lastShotTime = now;

              const vx = Math.sin(p.angle) * 32; // speed 32 m/s
              const vz = Math.cos(p.angle) * 32;

              const bulletId = 'bullet_' + (++activeRoom.bulletIdCounter);
              activeRoom.bullets.push({
                id: bulletId,
                ownerId: pId,
                x: p.x,
                z: p.z,
                vx: vx,
                vz: vz,
                damage: 80,
                range: 30.0, // sniper range 30m
                distTraveled: 0,
                type: 'sniper',
                hitEnemies: [] // keep track of pierced enemies
              });

              io.to(roomCode).emit('weapon-fired', { playerId: pId, weapon: 'sniper', x: p.x, z: p.z, angle: p.angle });
            }
          } else if (p.currentWeapon === 'hmg') {
            // HMG: 14 shots/sec (71ms), overheats in 3s (42 shots -> ~2.38 heat per shot)
            if (!p.isOverheated) {
              if (now - p.lastShotTime >= 68) {
                p.lastShotTime = now;

                const vx = Math.sin(p.angle) * 24; // speed 24 m/s
                const vz = Math.cos(p.angle) * 24;

                const bulletId = 'bullet_' + (++activeRoom.bulletIdCounter);
                activeRoom.bullets.push({
                  id: bulletId,
                  ownerId: pId,
                  x: p.x,
                  z: p.z,
                  vx: vx,
                  vz: vz,
                  damage: 6,
                  range: 16.0,
                  distTraveled: 0,
                  type: 'hmg'
                });

                p.heat = Math.min(100, p.heat + 2.38);
                if (p.heat >= 100) p.isOverheated = true;

                io.to(roomCode).emit('weapon-fired', { playerId: pId, weapon: 'hmg', x: p.x, z: p.z, angle: p.angle, heat: p.heat });
              }
            }
          } else if (p.currentWeapon === 'flamethrower') {
            if (!p.isEnergyDepleted) {
              if (now - p.lastShotTime >= 100) {
                p.lastShotTime = now;
                const spread = 30 * Math.PI / 180;
                const playerAngle = p.angle;
                
                for (const enemyId in activeRoom.enemies) {
                  const enemy = activeRoom.enemies[enemyId];
                  const dx = enemy.x - p.x;
                  const dz = enemy.z - p.z;
                  const dist = Math.hypot(dx, dz);
                  if (dist <= 8.0) {
                    const angleToEnemy = Math.atan2(dx, dz);
                    let diff = Math.abs(angleToEnemy - playerAngle);
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    diff = Math.abs(diff);
                    
                    if (diff <= spread / 2) {
                      let dmg = 1.5;
                      if (enemy.type === 'boss_swarm' && enemy.isBellyOpen) dmg *= 2.0;
                      if (enemy.type === 'boss_drone' && enemy.isLanded) dmg *= 2.0;
                      
                      let finalDmg = dmg;
                      if (enemy.type === 'shieldbearer') {
                        const edx = p.x - enemy.x;
                        const edz = p.z - enemy.z;
                        const angleToPlayer = Math.atan2(edx, edz);
                        let angleDiff = Math.abs(angleToPlayer - enemy.angle);
                        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                        angleDiff = Math.abs(angleDiff);
                        if (angleDiff <= (60 * Math.PI / 180)) {
                          if (enemy.shieldHp > 0) {
                            enemy.shieldHp = Math.max(0, enemy.shieldHp - finalDmg);
                            io.to(roomCode).emit('shield-hit', { enemyId: enemy.id, shieldHp: enemy.shieldHp, x: enemy.x, z: enemy.z });
                            finalDmg = 0;
                          }
                        }
                      }
                      
                      if (finalDmg > 0) {
                        enemy.hp -= finalDmg;
                        enemy.burnStacks = Math.min(3, (enemy.burnStacks || 0) + 1);
                        enemy.burnEndTime = now + 3000;
                        enemy.lastBurnTickTime = now;
                        p.damageDealt += finalDmg;
                        
                        io.to(roomCode).emit('enemy-hit', {
                          enemyId: enemy.id,
                          damage: finalDmg,
                          x: enemy.x,
                          z: enemy.z
                        });
                        
                        if (enemy.hp <= 0) {
                          handleEnemyDeath(activeRoom, enemyId, p);
                        }
                      }
                    }
                  }
                }
                
                if (activeRoom.covers) {
                  for (const coverId in activeRoom.covers) {
                    const cover = activeRoom.covers[coverId];
                    const dx = cover.x - p.x;
                    const dz = cover.z - p.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist <= 8.0) {
                      const angleToCover = Math.atan2(dx, dz);
                      let diff = Math.abs(angleToCover - playerAngle);
                      while (diff > Math.PI) diff -= Math.PI * 2;
                      diff = Math.abs(diff);
                      if (diff <= spread / 2) {
                        cover.hp -= 2.0;
                        if (cover.hp <= 0) {
                          delete activeRoom.covers[coverId];
                          io.to(roomCode).emit('cover-destroyed', { coverId });
                        }
                      }
                    }
                  }
                }
                if (activeRoom.crates) {
                  for (const crateId in activeRoom.crates) {
                    const crate = activeRoom.crates[crateId];
                    const dx = crate.x - p.x;
                    const dz = crate.z - p.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist <= 8.0) {
                      const angleToCrate = Math.atan2(dx, dz);
                      let diff = Math.abs(angleToCrate - playerAngle);
                      while (diff > Math.PI) diff -= Math.PI * 2;
                      diff = Math.abs(diff);
                      if (diff <= spread / 2) {
                        crate.hp -= 2.0;
                        if (crate.hp <= 0) {
                          handleCrateDeath(activeRoom, crateId);
                        }
                      }
                    }
                  }
                }

                io.to(roomCode).emit('weapon-fired', { playerId: pId, weapon: 'flamethrower', x: p.x, z: p.z, angle: p.angle, energy: p.energy });
              }
            }
          } else if (p.currentWeapon === 'tesla') {
            if (!p.isBatteryDepleted && p.battery >= 25) {
              if (now - p.lastShotTime >= 600) {
                p.lastShotTime = now;
                p.battery -= 25;
                if (p.battery < 25) p.isBatteryDepleted = true;
                
                const chainTargets = [];
                let currentSource = p;
                const excludedIds = [];
                
                for (let i = 0; i < 3; i++) {
                  let closestEnemy = null;
                  let closestDist = 6.0;
                  
                  for (const enemyId in activeRoom.enemies) {
                    if (excludedIds.includes(enemyId)) continue;
                    const enemy = activeRoom.enemies[enemyId];
                    const dist = Math.hypot(enemy.x - currentSource.x, enemy.z - currentSource.z);
                    if (dist < closestDist) {
                      closestDist = dist;
                      closestEnemy = enemy;
                    }
                  }
                  
                  if (closestEnemy) {
                    chainTargets.push(closestEnemy);
                    excludedIds.push(closestEnemy.id);
                    currentSource = closestEnemy;
                  } else {
                    break;
                  }
                }
                
                const chainPositions = chainTargets.map(enemy => {
                  let dmg = 18;
                  if (enemy.type === 'boss_swarm' && enemy.isBellyOpen) dmg *= 2.0;
                  if (enemy.type === 'boss_drone' && enemy.isLanded) dmg *= 2.0;
                  
                  let finalDmg = dmg;
                  if (enemy.type === 'shieldbearer') {
                    const edx = p.x - enemy.x;
                    const edz = p.z - enemy.z;
                    const angleToPlayer = Math.atan2(edx, edz);
                    let angleDiff = Math.abs(angleToPlayer - enemy.angle);
                    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                    angleDiff = Math.abs(angleDiff);
                    if (angleDiff <= (60 * Math.PI / 180)) {
                      if (enemy.shieldHp > 0) {
                        enemy.shieldHp = Math.max(0, enemy.shieldHp - finalDmg);
                        io.to(roomCode).emit('shield-hit', { enemyId: enemy.id, shieldHp: enemy.shieldHp, x: enemy.x, z: enemy.z });
                        finalDmg = 0;
                      }
                    }
                  }
                  
                  if (finalDmg > 0) {
                    enemy.hp -= finalDmg;
                    enemy.stunExpires = now + 500;
                    p.damageDealt += finalDmg;
                    
                    io.to(roomCode).emit('enemy-hit', {
                      enemyId: enemy.id,
                      damage: finalDmg,
                      x: enemy.x,
                      z: enemy.z
                    });
                    
                    if (enemy.hp <= 0) {
                      handleEnemyDeath(activeRoom, enemy.id, p);
                    }
                  }
                  return { x: enemy.x, z: enemy.z };
                });
                
                io.to(roomCode).emit('tesla-fired', {
                  playerId: pId,
                  x: p.x,
                  z: p.z,
                  battery: p.battery,
                  targets: chainPositions
                });
              }
            }
          } else if (p.currentWeapon === 'crossbow') {
            if (now - p.lastShotTime >= 1200) {
              p.lastShotTime = now;
              const vx = Math.sin(p.angle) * 20;
              const vz = Math.cos(p.angle) * 20;
              
              const bulletId = 'bullet_' + (++activeRoom.bulletIdCounter);
              activeRoom.bullets.push({
                id: bulletId,
                ownerId: pId,
                x: p.x,
                z: p.z,
                vx: vx,
                vz: vz,
                damage: 10,
                range: 15.0,
                distTraveled: 0,
                type: 'crossbow'
              });
              
              io.to(roomCode).emit('weapon-fired', { playerId: pId, weapon: 'crossbow', x: p.x, z: p.z, angle: p.angle });
            }
          }
        }
      });

      // --- 3. BULLET & PROJECTILE SIMULATION ---
      const dt = TICK_TIME / 1000;
      activeRoom.bullets.forEach((b, bIdx) => {
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.distTraveled += Math.hypot(b.vx * dt, b.vz * dt);

        if (b.distTraveled >= b.range && b.type === 'crossbow') {
          spawnPoisonPuddle(activeRoom, b.x, b.z, b.ownerId);
        }
      });

      // Cover & Crate collisions for bullets
      activeRoom.bullets.forEach((bullet, bIdx) => {
        // Check Cover collisions
        if (activeRoom.covers) {
          for (const coverId in activeRoom.covers) {
            const cover = activeRoom.covers[coverId];
            const minX = cover.x - 0.75;
            const maxX = cover.x + 0.75;
            const minZ = cover.z - 0.3;
            const maxZ = cover.z + 0.3;
            if (bullet.x > minX && bullet.x < maxX && bullet.z > minZ && bullet.z < maxZ) {
              cover.hp -= bullet.damage;
              if (cover.hp <= 0) {
                delete activeRoom.covers[coverId];
                io.to(roomCode).emit('cover-destroyed', { coverId });
              }
              if (bullet.type === 'crossbow') {
                spawnPoisonPuddle(activeRoom, bullet.x, bullet.z, bullet.ownerId);
              }
              activeRoom.bullets.splice(bIdx, 1);
              return;
            }
          }
        }
        
        // Check Crate collisions
        if (activeRoom.crates) {
          for (const crateId in activeRoom.crates) {
            const crate = activeRoom.crates[crateId];
            const minX = crate.x - 0.35;
            const maxX = crate.x + 0.35;
            const minZ = crate.z - 0.35;
            const maxZ = crate.z + 0.35;
            if (bullet.x > minX && bullet.x < maxX && bullet.z > minZ && bullet.z < maxZ) {
              crate.hp -= bullet.damage;
              if (crate.hp <= 0) {
                handleCrateDeath(activeRoom, crateId);
              }
              if (bullet.type === 'crossbow') {
                spawnPoisonPuddle(activeRoom, bullet.x, bullet.z, bullet.ownerId);
              }
              activeRoom.bullets.splice(bIdx, 1);
              return;
            }
          }
        }
        // Check Barrel collisions
        if (activeRoom.barrels) {
          for (const barrelId in activeRoom.barrels) {
            const barrel = activeRoom.barrels[barrelId];
            const minX = barrel.x - 0.4;
            const maxX = barrel.x + 0.4;
            const minZ = barrel.z - 0.4;
            const maxZ = barrel.z + 0.4;
            if (bullet.x > minX && bullet.x < maxX && bullet.z > minZ && bullet.z < maxZ) {
              barrel.hp -= bullet.damage;
              if (barrel.hp <= 0) {
                handleBarrelExplosion(activeRoom, barrelId);
              }
              if (bullet.type === 'crossbow') {
                spawnPoisonPuddle(activeRoom, bullet.x, bullet.z, bullet.ownerId);
              }
              activeRoom.bullets.splice(bIdx, 1);
              return;
            }
          }
        }
      });

      activeRoom.bullets = activeRoom.bullets.filter(b => b.distTraveled < b.range);

      // Update poison puddles
      if (activeRoom.puddles) {
        activeRoom.puddles = activeRoom.puddles.filter(p => now < p.endTime);
        activeRoom.puddles.forEach(puddle => {
          for (const enemyId in activeRoom.enemies) {
            const enemy = activeRoom.enemies[enemyId];
            const dist = Math.hypot(enemy.x - puddle.x, enemy.z - puddle.z);
            if (dist <= puddle.radius) {
              const dmg = 6 * dt; // 6 dmg/s
              enemy.hp -= dmg;
              const owner = activeRoom.players[puddle.ownerId];
              if (owner) owner.damageDealt += dmg;
              if (enemy.hp <= 0) {
                handleEnemyDeath(activeRoom, enemyId, owner);
              }
            }
          }
        });
      }
      
      // Update fire puddles (Boss drone laser lines / fires)
      if (activeRoom.firePuddles) {
        activeRoom.firePuddles = activeRoom.firePuddles.filter(p => now < p.endTime);
        activeRoom.firePuddles.forEach(puddle => {
          playerIds.forEach(pId => {
            const player = activeRoom.players[pId];
            if (!player || player.disconnected || player.hp <= 0 || player.isDowned) return;
            const dist = Math.hypot(player.x - puddle.x, player.z - puddle.z);
            if (dist <= puddle.radius) {
              const dmg = 15 * dt; // 15 dmg/s
              player.hp = Math.max(0, player.hp - dmg);
              if (player.hp <= 0) {
                triggerDowned(activeRoom, pId);
              }
              io.to(roomCode).emit('player-hit', { playerId: pId, hp: player.hp, damage: dmg });
            }
          });
        });
      }

      // Enemy Projectiles
      activeRoom.projectiles.forEach(p => {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.distTraveled += Math.hypot(p.vx * dt, p.vz * dt);
      });

      // Projectile hit player checks
      activeRoom.projectiles.forEach((proj, idx) => {
        playerIds.forEach(pId => {
          const player = activeRoom.players[pId];
          if (!player || player.disconnected || player.hp <= 0 || player.isDowned) return;
          
          const dist = Math.hypot(proj.x - player.x, proj.z - player.z);
          if (dist < 0.7) { // overlap
            // Apply damage
            player.hp = Math.max(0, player.hp - proj.damage);
            
            // Trigger downed or interrupt
            if (player.hp <= 0) {
              triggerDowned(activeRoom, pId);
            } else {
              if (player.isCrafting && proj.damage > 30) {
                player.craftTimeLeft = Math.min(player.craftTotalTime, player.craftTimeLeft + 2.0);
                io.to(roomCode).emit('craft-interrupted', { playerId: pId, craftTimeLeft: player.craftTimeLeft });
              }
            }

            io.to(roomCode).emit('player-hit', { playerId: pId, hp: player.hp, damage: proj.damage });
            activeRoom.projectiles.splice(idx, 1);
          }
        });
      });
      activeRoom.projectiles = activeRoom.projectiles.filter(p => p.distTraveled < p.range);

      // --- 4. SCRAP / WP / BP DESPAWN LOGIC ---
      for (const sId in activeRoom.scrap) {
        const item = activeRoom.scrap[sId];
        if (item.despawnTime && now > item.despawnTime) {
          delete activeRoom.scrap[sId];
        }
      }

      // --- 5. SCRAP MAGNET ENGINE & PICKUP (Includes WP & Blueprints) ---
      for (const sId in activeRoom.scrap) {
        const item = activeRoom.scrap[sId];
        
        let closestPlayer = null;
        let closestDist = Infinity;

        playerIds.forEach(pId => {
          const p = activeRoom.players[pId];
          if (!p || p.disconnected || p.hp <= 0 || p.isDowned) return;
          
          let canPickup = false;
          if (item.type === 'wp' && p.wp < 25) canPickup = true;
          else if (item.type === 'blueprint' && (p.bp10 + p.bp20 + p.bp30) < 5) canPickup = true;
          else if ((!item.type || item.type === 'scrap') && p.scrap < 60) canPickup = true;
          
          if (!canPickup) return;

          const dist = Math.hypot(p.x - item.x, p.z - item.z);
          if (dist < closestDist) {
            closestDist = dist;
            closestPlayer = p;
          }
        });

        // Magnet range 6m
        if (closestPlayer && closestDist < 6.0) {
          const dx = closestPlayer.x - item.x;
          const dz = closestPlayer.z - item.z;
          item.x += (dx / closestDist) * 5.0 * dt;
          item.z += (dz / closestDist) * 5.0 * dt;

          // Pickup range 0.8m
          if (closestDist < 0.8) {
            let picked = false;
            
            if (item.type === 'wp') {
              if (closestPlayer.wp < 25) { // Limit 25 Weapon Parts
                closestPlayer.wp = Math.min(25, closestPlayer.wp + item.quantity);
                picked = true;
              }
            } else if (item.type === 'blueprint') {
              if ((closestPlayer.bp10 + closestPlayer.bp20 + closestPlayer.bp30) < 5) {
                if (item.blueprintType === 'bp10') closestPlayer.bp10++;
                else if (item.blueprintType === 'bp20') closestPlayer.bp20++;
                else if (item.blueprintType === 'bp30' || item.blueprintType === 'bp40') closestPlayer.bp30++;
                closestPlayer.blueprints = closestPlayer.bp10 + closestPlayer.bp20 + closestPlayer.bp30;
                picked = true;
              }
            } else { // normal scrap
              if (closestPlayer.scrap < 60) { // Limit 60 Scrap
                closestPlayer.scrap = Math.min(60, closestPlayer.scrap + item.quantity);
                picked = true;
              }
            }

            if (picked) {
              delete activeRoom.scrap[sId];
              io.to(roomCode).emit('scrap-picked', {
                playerId: closestPlayer.playerId,
                scrapId: sId,
                type: item.type || 'scrap',
                totalScrap: closestPlayer.scrap,
                totalWp: closestPlayer.wp,
                totalBp: closestPlayer.blueprints
              });
            }
          }
        }
      }

      // --- 6. MUTANTS AI BEHAVIOR & FIRING LOOP ---
      if (activeRoom.corpses) {
        activeRoom.corpses = activeRoom.corpses.filter(c => Date.now() - c.time < 8000);
      }

      for (const enemyId in activeRoom.enemies) {
        const enemy = activeRoom.enemies[enemyId];
        
        // Handle burning DoT
        if (enemy.burnEndTime && now < enemy.burnEndTime) {
          const stacks = enemy.burnStacks || 1;
          const burnDmg = (3 * stacks) * dt;
          enemy.hp -= burnDmg;
          if (enemy.hp <= 0) {
            handleEnemyDeath(activeRoom, enemyId, null);
            continue;
          }
        }
        
        // Handle stun status
        if (enemy.stunExpires && now < enemy.stunExpires) {
          continue; // stunned: skip AI movement and attacks
        }

        let nearestPlayer = null;
        let nearestDist = Infinity;
        
        playerIds.forEach(pId => {
          const p = activeRoom.players[pId];
          if (!p || p.disconnected || p.hp <= 0 || p.isDowned) return;
          const dist = Math.hypot(p.x - enemy.x, p.z - enemy.z);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestPlayer = p;
          }
        });

        // A. Handle Boss Hammer special rage state
        if (enemy.type === 'boss_hammer') {
          enemy.enrageTimer -= dt;
          if (enemy.enrageTimer <= 0) {
            enemy.isEnraged = !enemy.isEnraged;
            if (enemy.isEnraged) {
              enemy.enrageTimer = 10.0;
              enemy.speed = 4.0;
              enemy.damage = 30;
            } else {
              enemy.enrageTimer = 20.0;
              enemy.speed = 2.0;
              enemy.damage = 20;
            }
            io.to(roomCode).emit('boss-enrage-toggle', { enemyId: enemy.id, isEnraged: enemy.isEnraged });
          }
        }

        // B. Handle Boss Swarm Spawning/Vulnerability
        if (enemy.type === 'boss_swarm') {
          if (!enemy.spawnTimer) enemy.spawnTimer = 6.0;
          enemy.spawnTimer -= dt;
          if (enemy.spawnTimer <= 0) {
            enemy.spawnTimer = 6.0;
            enemy.bellyOpenTimer = 3.0;
            // Spawn 3 mini-spiders
            for (let k = 0; k < 3; k++) {
              const spiderId = 'enemy_' + (++activeRoom.enemyIdCounter);
              const theta = Math.random() * Math.PI * 2;
              const r = 1.5;
              activeRoom.enemies[spiderId] = {
                id: spiderId,
                type: 'spider',
                x: enemy.x + Math.sin(theta) * r,
                z: enemy.z + Math.cos(theta) * r,
                hp: 10,
                maxHp: 10,
                speed: 3.0,
                damage: 4,
                slowExpires: 0,
                angle: 0,
                lastAttackTime: 0,
                lastShotTime: 0
              };
            }
            io.to(roomCode).emit('boss-swarm-spawn', { enemyId: enemy.id });
          }
          if (enemy.bellyOpenTimer > 0) {
            enemy.bellyOpenTimer -= dt;
            enemy.isBellyOpen = true;
          } else {
            enemy.isBellyOpen = false;
          }
        }

        // C. Handle Boss Drone Landing / Laser Target
        if (enemy.type === 'boss_drone') {
          if (!enemy.landTimer) enemy.landTimer = 12.0;
          if (!enemy.shootTimer) enemy.shootTimer = 4.0;
          
          if (enemy.isLanded) {
            enemy.landDuration -= dt;
            if (enemy.landDuration <= 0) {
              enemy.isLanded = false;
              enemy.landTimer = 12.0;
              enemy.shootTimer = 4.0;
            }
          } else {
            enemy.landTimer -= dt;
            if (enemy.landTimer <= 0) {
              enemy.isLanded = true;
              enemy.landDuration = 4.0;
              io.to(roomCode).emit('boss-drone-land', { enemyId: enemy.id });
            } else {
              enemy.shootTimer -= dt;
              if (enemy.shootTimer <= 0) {
                enemy.shootTimer = 4.0;
                if (nearestPlayer) {
                  const tx = nearestPlayer.x;
                  const tz = nearestPlayer.z;
                  io.to(roomCode).emit('boss-drone-lock', { enemyId: enemy.id, tx, tz });
                  setTimeout(() => {
                    const r = rooms[roomCode];
                    if (r && r.enemies[enemy.id]) {
                      const fId = 'fire_' + (++r.scrapIdCounter);
                      if (!r.firePuddles) r.firePuddles = [];
                      r.firePuddles.push({
                        id: fId,
                        x: tx,
                        z: tz,
                        radius: 1.0,
                        endTime: Date.now() + 2000
                      });
                      io.to(roomCode).emit('fire-spawn', { id: fId, x: tx, z: tz, radius: 1.0 });
                    }
                  }, 1500);
                }
              }
            }
          }
        }

        // D2. Boss Разлом (Teleporter) AI
        if (enemy.type === 'boss_razlom') {
          enemy.teleportTimer -= dt;
          
          // If currently showing warp warning (pre-teleport)
          if (enemy.isWarping) {
            enemy.warpWarningTimer -= dt;
            if (enemy.warpWarningTimer <= 0) {
              // Execute teleport
              enemy.x = enemy.warpTargetX;
              enemy.z = enemy.warpTargetZ;
              enemy.isWarping = false;
              
              // Strike sequence (3 hits over 2s)
              enemy.strikeTimer = 2.0;
              enemy.strikeCount = 3;
              
              io.to(roomCode).emit('boss-razlom-teleport', { enemyId: enemy.id, x: enemy.x, z: enemy.z });
            }
          } else if (enemy.teleportTimer <= 0) {
            // Pick a random active player as target
            const targets = playerIds.filter(pId => {
              const p = activeRoom.players[pId];
              return p && !p.disconnected && p.hp > 0 && !p.isDowned;
            });
            if (targets.length > 0) {
              const targetId = targets[Math.floor(Math.random() * targets.length)];
              const tp = activeRoom.players[targetId];
              const offset = (Math.random() - 0.5) * 2.0;
              enemy.warpTargetX = tp.x + Math.sin(Math.random() * Math.PI * 2) * 2.0;
              enemy.warpTargetZ = tp.z + Math.cos(Math.random() * Math.PI * 2) * 2.0;
              // Clamp to arena
              enemy.warpTargetX = Math.max(-ARENA_WIDTH/2 + 2, Math.min(ARENA_WIDTH/2 - 2, enemy.warpTargetX));
              enemy.warpTargetZ = Math.max(-ARENA_DEPTH/2 + 2, Math.min(ARENA_DEPTH/2 - 2, enemy.warpTargetZ));
              
              enemy.isWarping = true;
              enemy.warpWarningTimer = 1.0; // 1s warning
              enemy.teleportTimer = 5.0 + Math.random() * 2.0;
              
              io.to(roomCode).emit('boss-razlom-warp-warning', {
                enemyId: enemy.id,
                targetX: enemy.warpTargetX,
                targetZ: enemy.warpTargetZ
              });
            } else {
              enemy.teleportTimer = 3.0;
            }
          }
          
          // Strike sequence after teleport
          if (enemy.strikeCount > 0 && !enemy.isWarping) {
            enemy.strikeTimer -= dt;
            if (enemy.strikeTimer <= 0 && enemy.strikeCount > 0) {
              enemy.strikeCount--;
              enemy.strikeTimer = 0.6;
              playerIds.forEach(pId => {
                const player = activeRoom.players[pId];
                if (!player || player.disconnected || player.hp <= 0 || player.isDowned) return;
                const dist = Math.hypot(player.x - enemy.x, player.z - enemy.z);
                if (dist < 2.5) {
                  player.hp = Math.max(0, player.hp - 22);
                  if (player.hp <= 0) triggerDowned(activeRoom, pId);
                  io.to(roomCode).emit('player-hit', { playerId: pId, hp: player.hp, damage: 22 });
                }
              });
            }
          }
          
          // Toxic rift every 8s
          if (!enemy.riftTimer) enemy.riftTimer = 8.0;
          enemy.riftTimer -= dt;
          if (enemy.riftTimer <= 0) {
            enemy.riftTimer = 8.0;
            // Spawn toxic rift under a random player
            const targets = playerIds.filter(pId => {
              const p = activeRoom.players[pId];
              return p && !p.disconnected && p.hp > 0;
            });
            if (targets.length > 0) {
              const tp = activeRoom.players[targets[Math.floor(Math.random() * targets.length)]];
              const riftId = 'rift_' + (++activeRoom.scrapIdCounter);
              if (!activeRoom.firePuddles) activeRoom.firePuddles = [];
              activeRoom.firePuddles.push({
                id: riftId,
                x: tp.x,
                z: tp.z,
                radius: 2.0,
                endTime: Date.now() + 6000,
                damage: 8
              });
              io.to(roomCode).emit('boss-razlom-rift', { id: riftId, x: tp.x, z: tp.z, radius: 2.0 });
            }
          }
        }

        // D3. Boss Генерал (Final Boss) 3-Phase AI
        if (enemy.type === 'boss_general') {
          const hpRatio = enemy.hp / enemy.maxHp;
          // Update phase based on HP
          const prevPhase = enemy.phase;
          if (hpRatio > 0.66) enemy.phase = 1;       // Phase 1: Hammer-style rage
          else if (hpRatio > 0.33) enemy.phase = 2;  // Phase 2: Drone laser / mini-spawn
          else enemy.phase = 3;                       // Phase 3: Teleporter + amplified
          
          if (enemy.phase !== prevPhase) {
            io.to(roomCode).emit('boss-general-phase', { enemyId: enemy.id, phase: enemy.phase });
          }

          if (enemy.phase === 1) {
            // Enrage every 15s
            enemy.enrageTimer -= dt;
            if (enemy.enrageTimer <= 0) {
              enemy.isEnraged = !enemy.isEnraged;
              enemy.enrageTimer = enemy.isEnraged ? 8.0 : 15.0;
              enemy.speed = enemy.isEnraged ? 5.0 : 2.0;
              enemy.damage = enemy.isEnraged ? 40 : 25;
              io.to(roomCode).emit('boss-enrage-toggle', { enemyId: enemy.id, isEnraged: enemy.isEnraged });
            }
          } else if (enemy.phase === 2) {
            // Shoot laser at players periodically
            enemy.shootTimer -= dt;
            if (enemy.shootTimer <= 0) {
              enemy.shootTimer = 3.0;
              if (nearestPlayer) {
                const tx = nearestPlayer.x;
                const tz = nearestPlayer.z;
                io.to(roomCode).emit('boss-drone-lock', { enemyId: enemy.id, tx, tz });
                setTimeout(() => {
                  const r = rooms[roomCode];
                  if (r && r.enemies[enemy.id]) {
                    const fId = 'fire_gen_' + (++r.scrapIdCounter);
                    if (!r.firePuddles) r.firePuddles = [];
                    r.firePuddles.push({ id: fId, x: tx, z: tz, radius: 1.5, endTime: Date.now() + 3000 });
                    io.to(roomCode).emit('fire-spawn', { id: fId, x: tx, z: tz, radius: 1.5 });
                  }
                }, 1200);
              }
            }
            // Spawn spiders every 8s
            enemy.spawnTimer -= dt;
            if (enemy.spawnTimer <= 0) {
              enemy.spawnTimer = 8.0;
              for (let k = 0; k < 2; k++) {
                const spiderId = 'enemy_' + (++activeRoom.enemyIdCounter);
                const theta = Math.random() * Math.PI * 2;
                activeRoom.enemies[spiderId] = {
                  id: spiderId, type: 'spider',
                  x: enemy.x + Math.sin(theta) * 2, z: enemy.z + Math.cos(theta) * 2,
                  hp: 15, maxHp: 15, speed: 3.5, damage: 6,
                  slowExpires: 0, angle: 0, lastAttackTime: 0, lastShotTime: 0
                };
              }
            }
          } else if (enemy.phase === 3) {
            // Teleport every 4s
            enemy.teleportTimer -= dt;
            if (!enemy.isWarping && enemy.teleportTimer <= 0) {
              const targets = playerIds.filter(pId => {
                const p = activeRoom.players[pId];
                return p && !p.disconnected && p.hp > 0 && !p.isDowned;
              });
              if (targets.length > 0) {
                const tp = activeRoom.players[targets[Math.floor(Math.random() * targets.length)]];
                enemy.warpTargetX = tp.x + (Math.random() - 0.5) * 2;
                enemy.warpTargetZ = tp.z + (Math.random() - 0.5) * 2;
                enemy.warpTargetX = Math.max(-ARENA_WIDTH/2+2, Math.min(ARENA_WIDTH/2-2, enemy.warpTargetX));
                enemy.warpTargetZ = Math.max(-ARENA_DEPTH/2+2, Math.min(ARENA_DEPTH/2-2, enemy.warpTargetZ));
                enemy.isWarping = true;
                enemy.warpWarningTimer = 0.8;
                enemy.teleportTimer = 4.0;
                io.to(roomCode).emit('boss-razlom-warp-warning', { enemyId: enemy.id, targetX: enemy.warpTargetX, targetZ: enemy.warpTargetZ });
              } else { enemy.teleportTimer = 2.0; }
            } else if (enemy.isWarping) {
              enemy.warpWarningTimer -= dt;
              if (enemy.warpWarningTimer <= 0) {
                enemy.x = enemy.warpTargetX;
                enemy.z = enemy.warpTargetZ;
                enemy.isWarping = false;
                io.to(roomCode).emit('boss-razlom-teleport', { enemyId: enemy.id, x: enemy.x, z: enemy.z });
                // Amplified strike
                playerIds.forEach(pId => {
                  const player = activeRoom.players[pId];
                  if (!player || player.disconnected || player.hp <= 0 || player.isDowned) return;
                  const dist = Math.hypot(player.x - enemy.x, player.z - enemy.z);
                  if (dist < 2.5) {
                    player.hp = Math.max(0, player.hp - 35);
                    if (player.hp <= 0) triggerDowned(activeRoom, pId);
                    io.to(roomCode).emit('player-hit', { playerId: pId, hp: player.hp, damage: 35 });
                  }
                });
              }
            }
            // Amplify damage in phase 3
            enemy.damage = 40;
          }
        }

        // D. Necromancer Revival Logic
        if (enemy.type === 'necromancer') {
          if (!enemy.lastReviveTime) enemy.lastReviveTime = 0;
          if (now - enemy.lastReviveTime >= 8000 && activeRoom.corpses) {
            const nearbyCorpses = activeRoom.corpses.filter(c => Math.hypot(c.x - enemy.x, c.z - enemy.z) <= 10.0);
            if (nearbyCorpses.length > 0) {
              enemy.lastReviveTime = now;
              const toRevive = nearbyCorpses.slice(0, 3);
              toRevive.forEach(c => {
                const cIdx = activeRoom.corpses.indexOf(c);
                if (cIdx !== -1) activeRoom.corpses.splice(cIdx, 1);
                
                const newId = 'enemy_' + (++activeRoom.enemyIdCounter);
                const baseHp = c.type === 'meat' ? 15 : (c.type === 'sprinter' ? 8 : (c.type === 'tank' ? 80 : 25));
                const scalingFactorHp = 1 + 0.08 * (activeRoom.round - 1);
                const hp = (baseHp * scalingFactorHp) * 0.5;
                
                activeRoom.enemies[newId] = {
                  id: newId,
                  type: c.type,
                  x: c.x,
                  z: c.z,
                  hp: hp,
                  maxHp: baseHp * scalingFactorHp,
                  speed: c.type === 'sprinter' ? 4.5 : (c.type === 'tank' ? 1.2 : (c.type === 'shooter' ? 1.5 : 2.0)),
                  damage: (c.type === 'meat' ? 5 : (c.type === 'sprinter' ? 4 : (c.type === 'tank' ? 15 : 8))) * (1 + 0.05 * (activeRoom.round - 1)),
                  slowExpires: 0,
                  angle: 0,
                  lastAttackTime: 0,
                  lastShotTime: 0
                };
              });
              io.to(roomCode).emit('necromancer-revive', { necromancerId: enemy.id, positions: toRevive.map(c => ({x: c.x, z: c.z})) });
            }
          }
        }

        // E. Kamikaze Fuse Detonation
        if (enemy.type === 'kamikaze') {
          if (enemy.fuseActive) {
            enemy.fuseTimer -= dt;
            if (enemy.fuseTimer <= 0) {
              delete activeRoom.enemies[enemyId];
              io.to(roomCode).emit('kamikaze-detonate', { x: enemy.x, z: enemy.z, radius: 3.5 });
              
              playerIds.forEach(pId => {
                const player = activeRoom.players[pId];
                if (!player || player.disconnected || player.hp <= 0 || player.isDowned) return;
                const dist = Math.hypot(player.x - enemy.x, player.z - enemy.z);
                if (dist <= 3.5) {
                  const dmg = 30 * (1 - dist / 3.5);
                  player.hp = Math.max(0, player.hp - dmg);
                  
                  const angle = Math.atan2(player.x - enemy.x, player.z - enemy.z);
                  player.x += Math.sin(angle) * 2.0;
                  player.z += Math.cos(angle) * 2.0;
                  
                  if (player.hp <= 0) {
                    triggerDowned(activeRoom, player.playerId);
                  }
                  io.to(roomCode).emit('player-hit', { playerId: player.playerId, hp: player.hp, damage: dmg });
                }
              });
              continue;
            }
          } else if (nearestDist < 2.0) {
            enemy.fuseActive = true;
            enemy.fuseTimer = 1.0;
            io.to(roomCode).emit('kamikaze-fuse-start', { enemyId: enemy.id });
          }
        }

        // F. Pathfinding steer vector
        if (nearestPlayer) {
          let dx = nearestPlayer.x - enemy.x;
          let dz = nearestPlayer.z - enemy.z;
          
          if (enemy.type === 'necromancer') {
            dx = -dx;
            dz = -dz;
          }

          enemy.angle = Math.atan2(dx, dz);

          let activeSpeed = enemy.speed;
          if (now < enemy.slowExpires) {
            activeSpeed *= 0.90;
          }
          if (enemy.type === 'kamikaze' && enemy.fuseActive) {
            activeSpeed *= 0.3;
          }

          if (enemy.type === 'boss_drone') {
            if (enemy.isLanded) {
              activeSpeed = 0;
            } else {
              if (nearestDist <= 5.0 && nearestDist >= 4.0) {
                activeSpeed = 0;
              } else if (nearestDist < 4.0) {
                enemy.angle = Math.atan2(-dx, -dz);
              }
            }
          }

          if (activeSpeed > 0) {
            enemy.x += Math.sin(enemy.angle) * activeSpeed * dt;
            enemy.z += Math.cos(enemy.angle) * activeSpeed * dt;
          }

          const tempEntity = { x: enemy.x, z: enemy.z };
          if (activeRoom.covers) {
            for (const coverId in activeRoom.covers) {
              if (resolveBoxCollision(tempEntity, activeRoom.covers[coverId], 0.4)) {
                const cover = activeRoom.covers[coverId];
                if (!enemy.lastCoverAttackTime) enemy.lastCoverAttackTime = 0;
                if (now - enemy.lastCoverAttackTime >= 1000) {
                  enemy.lastCoverAttackTime = now;
                  cover.hp -= enemy.damage || 5;
                  if (cover.hp <= 0) {
                    delete activeRoom.covers[coverId];
                    io.to(roomCode).emit('cover-destroyed', { coverId });
                  }
                }
              }
            }
          }
          if (activeRoom.crates) {
            for (const crateId in activeRoom.crates) {
              if (resolveCrateCollision(tempEntity, activeRoom.crates[crateId], 0.4)) {
                const crate = activeRoom.crates[crateId];
                if (!enemy.lastCrateAttackTime) enemy.lastCrateAttackTime = 0;
                if (now - enemy.lastCrateAttackTime >= 1000) {
                  enemy.lastCrateAttackTime = now;
                  crate.hp -= enemy.damage || 5;
                  if (crate.hp <= 0) {
                    handleCrateDeath(activeRoom, crateId);
                  }
                }
              }
            }
          }
          enemy.x = tempEntity.x;
          enemy.z = tempEntity.z;

          const margin = 0.4;
          enemy.x = Math.max(-ARENA_WIDTH / 2 + margin, Math.min(ARENA_WIDTH / 2 - margin, enemy.x));
          enemy.z = Math.max(-ARENA_DEPTH / 2 + margin, Math.min(ARENA_DEPTH / 2 - margin, enemy.z));

          // Contact attacks
          if (nearestDist < 0.9 && enemy.type !== 'necromancer' && enemy.type !== 'boss_drone' && enemy.type !== 'kamikaze') {
            if (now - enemy.lastAttackTime >= 1000) {
              enemy.lastAttackTime = now;
              nearestPlayer.hp = Math.max(0, nearestPlayer.hp - enemy.damage);
              console.log(`Enemy ${enemy.id} bit player ${nearestPlayer.nickname} for ${enemy.damage} dmg.`);
              
              if (nearestPlayer.hp <= 0) {
                triggerDowned(activeRoom, nearestPlayer.playerId);
              } else {
                if (nearestPlayer.isCrafting && enemy.damage > 30) {
                  nearestPlayer.craftTimeLeft = Math.min(nearestPlayer.craftTotalTime, nearestPlayer.craftTimeLeft + 2.0);
                  io.to(roomCode).emit('craft-interrupted', { playerId: nearestPlayer.playerId, craftTimeLeft: nearestPlayer.craftTimeLeft });
                }
              }

              io.to(roomCode).emit('player-hit', { playerId: nearestPlayer.playerId, hp: nearestPlayer.hp, damage: enemy.damage });
            }
          }

          // C. Shooter-specific range firing (every 2s, 14m range, 8 dmg)
          if (enemy.type === 'shooter' && nearestDist <= 14.0) {
            if (now - enemy.lastShotTime >= 2000) {
              enemy.lastShotTime = now;
              
              const vx = Math.sin(enemy.angle) * 12; // projectile speed 12m/s
              const vz = Math.cos(enemy.angle) * 12;
              const projId = 'proj_' + (++activeRoom.enemyIdCounter);

              activeRoom.projectiles.push({
                id: projId,
                x: enemy.x,
                z: enemy.z,
                vx,
                vz,
                damage: 8,
                range: 14.0,
                distTraveled: 0
              });
            }
          }
        }
      }

      // --- 7. COLLISION CHECKS: BULLETS vs MUTANTS (With piercing) ---
      activeRoom.bullets.forEach((bullet, bIdx) => {
        for (const enemyId in activeRoom.enemies) {
          const enemy = activeRoom.enemies[enemyId];
          
          // Sniper bullet piercing: skip if already struck by this bullet
          if (bullet.type === 'sniper' && bullet.hitEnemies.includes(enemyId)) {
            continue;
          }

          // Use segment-based collision checking to prevent tunneling at high speeds / close range
          const prevX = bullet.x - bullet.vx * (TICK_TIME / 1000);
          const prevZ = bullet.z - bullet.vz * (TICK_TIME / 1000);
          const dist = distToSegment(enemy.x, enemy.z, prevX, prevZ, bullet.x, bullet.z);
          
          if (dist < 0.6) {
            let finalDmg = bullet.damage;
            
            // Shotgun distance falloff logic
            if (bullet.type === 'shotgun') {
              const distFired = Math.hypot(bullet.x - bullet.firedX, bullet.z - bullet.firedZ);
              if (distFired <= 3.0) finalDmg = bullet.damage; // 8
              else if (distFired <= 5.0) finalDmg = bullet.damage * 0.5; // 4
              else finalDmg = bullet.damage * 0.25; // 2

              // Knockback: push back by 0.5m
              enemy.x += Math.sin(bullet.pelletAngle) * 0.5;
              enemy.z += Math.cos(bullet.pelletAngle) * 0.5;

              const margin = 0.4;
              enemy.x = Math.max(-ARENA_WIDTH / 2 + margin, Math.min(ARENA_WIDTH / 2 - margin, enemy.x));
              enemy.z = Math.max(-ARENA_DEPTH / 2 + margin, Math.min(ARENA_DEPTH / 2 - margin, enemy.z));
            }

            // Boss swarm vulnerability
            if (enemy.type === 'boss_swarm' && enemy.isBellyOpen) {
              finalDmg *= 2.0;
            }
            // Boss drone landed vulnerability
            if (enemy.type === 'boss_drone' && enemy.isLanded) {
              finalDmg *= 2.0;
            }

            // Shieldbearer front shield check
            if (enemy.type === 'shieldbearer') {
              const player = activeRoom.players[bullet.ownerId];
              if (player) {
                const dx = player.x - enemy.x;
                const dz = player.z - enemy.z;
                const angleToPlayer = Math.atan2(dx, dz);
                let angleDiff = Math.abs(angleToPlayer - enemy.angle);
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                angleDiff = Math.abs(angleDiff);
                
                if (angleDiff <= (60 * Math.PI / 180)) {
                  if (enemy.shieldHp > 0) {
                    enemy.shieldHp = Math.max(0, enemy.shieldHp - finalDmg);
                    io.to(roomCode).emit('shield-hit', { enemyId: enemy.id, shieldHp: enemy.shieldHp, x: enemy.x, z: enemy.z });
                    finalDmg = 0;
                  }
                }
              }
            }

            if (finalDmg > 0) {
              enemy.hp -= finalDmg;
              enemy.slowExpires = now + 1000;

              const owner = activeRoom.players[bullet.ownerId];
              if (owner) {
                owner.damageDealt += finalDmg;
              }

              io.to(roomCode).emit('enemy-hit', {
                enemyId: enemy.id,
                damage: finalDmg,
                x: enemy.x,
                z: enemy.z
              });

              // Check if dead
              if (enemy.hp <= 0) {
                const owner = activeRoom.players[bullet.ownerId];
                handleEnemyDeath(activeRoom, enemyId, owner, bullet.type);
              }
            }

            // Piercing handling
            if (bullet.type === 'sniper') {
              bullet.hitEnemies.push(enemyId);
              if (bullet.hitEnemies.length >= 3) { // Pierce caps at 3 targets
                activeRoom.bullets.splice(bIdx, 1);
              }
            } else {
              activeRoom.bullets.splice(bIdx, 1);
            }
            break;
          }
        }
      });
    }

    // Broadcast sync payload
    const playersState = {};
    for (const pId in activeRoom.players) {
      const p = activeRoom.players[pId];
      playersState[pId] = {
        playerId: p.playerId,
        nickname: p.nickname,
        x: p.x,
        z: p.z,
        angle: p.angle,
        hp: p.hp,
        maxHp: p.maxHp,
        scrap: p.scrap,
        wp: p.wp,
        bp10: p.bp10,
        bp20: p.bp20,
        bp30: p.bp30,
        blueprints: p.bp10 + p.bp20 + p.bp30,
        energy: p.energy,
        battery: p.battery,
        isEnergyDepleted: p.isEnergyDepleted,
        isBatteryDepleted: p.isBatteryDepleted,
        weapons: p.weapons,
        currentWeapon: p.currentWeapon,
        isCrafting: p.isCrafting,
        craftWeapon: p.craftWeapon,
        craftTimeLeft: p.craftTimeLeft,
        craftTotalTime: p.craftTotalTime,
        heat: p.heat,
        isOverheated: p.isOverheated,
        isDowned: p.isDowned,
        downedTimeLeft: p.downedTimeLeft,
        reviveProgress: p.reviveProgress,
        syringes: p.syringes,
        disconnected: p.disconnected,
        lastInputSeq: p.lastInputSeq,
      };
    }

    const enemiesState = {};
    for (const eId in activeRoom.enemies) {
      const e = activeRoom.enemies[eId];
      enemiesState[eId] = {
        id: e.id,
        type: e.type,
        x: e.x,
        z: e.z,
        angle: e.angle,
        hp: e.hp,
        maxHp: e.maxHp,
        isSlowed: now < e.slowExpires,
        isEnraged: e.isEnraged || false,
        shieldHp: e.shieldHp,
        maxShieldHp: e.maxShieldHp,
        isBellyOpen: e.isBellyOpen || false,
        isLanded: e.isLanded || false,
        phase: e.phase || 1,
        isWarping: e.isWarping || false
      };
    }

    const scrapState = {};
    for (const sId in activeRoom.scrap) {
      const s = activeRoom.scrap[sId];
      scrapState[sId] = {
        id: s.id,
        x: s.x,
        z: s.z,
        type: s.type || 'scrap',
        blueprintType: s.blueprintType
      };
    }

    const projectilesState = activeRoom.projectiles.map(p => ({
      id: p.id,
      x: p.x,
      z: p.z
    }));

    const coversState = {};
    if (activeRoom.covers) {
      for (const cId in activeRoom.covers) {
        const c = activeRoom.covers[cId];
        coversState[cId] = {
          id: c.id,
          x: c.x,
          z: c.z,
          hp: c.hp,
          maxHp: c.maxHp
        };
      }
    }

    const cratesState = {};
    if (activeRoom.crates) {
      for (const cId in activeRoom.crates) {
        const c = activeRoom.crates[cId];
        cratesState[cId] = {
          id: c.id,
          x: c.x,
          z: c.z,
          hp: c.hp,
          maxHp: c.maxHp
        };
      }
    }

    const puddlesState = (activeRoom.puddles || []).map(p => ({
      id: p.id,
      x: p.x,
      z: p.z,
      radius: p.radius
    }));

    const firePuddlesState = (activeRoom.firePuddles || []).map(p => ({
      id: p.id,
      x: p.x,
      z: p.z,
      radius: p.radius
    }));

    const barrelsState = {};
    if (activeRoom.barrels) {
      for (const bId in activeRoom.barrels) {
        const b = activeRoom.barrels[bId];
        barrelsState[bId] = { id: b.id, x: b.x, z: b.z, hp: b.hp, maxHp: b.maxHp };
      }
    }

    const comboState = activeRoom.combo ? {
      count: activeRoom.combo.count,
      multiplier: activeRoom.combo.multiplier,
      active: activeRoom.combo.lastKillTime > 0 && (Date.now() - activeRoom.combo.lastKillTime) < 3000
    } : { count: 0, multiplier: 1, active: false };

    io.to(roomCode).emit('state-update', {
      players: playersState,
      gameStarted: activeRoom.gameStarted,
      round: activeRoom.round,
      roundState: activeRoom.roundState,
      roundTimer: activeRoom.roundTimer,
      score: activeRoom.score,
      enemies: enemiesState,
      scrap: scrapState,
      projectiles: projectilesState,
      bullets: activeRoom.bullets.map(b => ({ x: b.x, z: b.z, vx: b.vx, vz: b.vz, type: b.type })),
      covers: coversState,
      crates: cratesState,
      puddles: puddlesState,
      firePuddles: firePuddlesState,
      barrels: barrelsState,
      combo: comboState
    });
  }, TICK_TIME);
}

// Trigger player downed state machine
function triggerDowned(room, playerId) {
  const p = room.players[playerId];
  if (!p || p.isDowned) return;

  p.isDowned = true;
  p.downedTimeLeft = 20.0; // 20 seconds to crawl / bleed out
  p.reviveProgress = 0;
  p.shootingIntent = false;

  // Scatter 50% of backpack Scrap around player coordinate
  const scatterCount = Math.floor(p.scrap * 0.5);
  p.scrap -= scatterCount;

  for (let k = 0; k < scatterCount; k++) {
    const scrapId = 'scrap_' + (++room.scrapIdCounter);
    const theta = Math.random() * Math.PI * 2;
    const r = 1.0 + Math.random() * 2.0; // radius 1m to 3m

    room.scrap[scrapId] = {
      id: scrapId,
      x: p.x + Math.sin(theta) * r,
      z: p.z + Math.cos(theta) * r,
      quantity: 1,
      // Despawns after 30 seconds
      despawnTime: Date.now() + 30000
    };
  }

  // Set auto-revive timer if playing in Solo Mode
  if (room.soloMode) {
    if (p.syringes > 0) {
      p.syringes -= 1;
      p.autoReviveTimer = 4.0; // auto-revive starts automatically in 4s
      console.log(`Solo syringe auto-revive initiated for ${p.nickname}`);
    } else {
      // Dead immediately
      p.hp = 0;
      p.isDowned = false;
      console.log(`Player ${p.nickname} has no syringes left. Dead.`);
    }
  }

  io.to(room.roomCode).emit('player-downed', {
    playerId,
    nickname: p.nickname,
    scrapDropped: scatterCount
  });
  console.log(`Player ${p.nickname} entered Downed state.`);
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Create Room
  socket.on('create-room', ({ nickname }) => {
    const roomCode = generateRoomCode();
    const sessionToken = generateSessionToken();
    const playerId = 'player_' + crypto.randomBytes(4).toString('hex');

    rooms[roomCode] = {
      roomCode: roomCode,
      hostToken: sessionToken,
      players: {
        [playerId]: {
          socketId: socket.id,
          playerId: playerId,
          sessionToken: sessionToken,
          nickname: nickname || 'Host',
          x: -5,
          z: 0,
          angle: 0,
          hp: 100,
          maxHp: 100,
          scrap: 0,
          wp: 0,           // Weapon Parts
          bp10: 0,
          bp20: 0,
          bp30: 0,
          blueprints: 0,   // Blueprints
          energy: 100,
          battery: 80,
          isEnergyDepleted: false,
          isBatteryDepleted: false,
          weapons: ['pistol'],
          currentWeapon: 'pistol',
          isCrafting: false,
          craftWeapon: '',
          craftTimeLeft: 0,
          craftTotalTime: 0,
          heat: 0,
          isOverheated: false,
          scrapTransferredThisRound: 0,
          // Downed / Revive status
          isDowned: false,
          downedTimeLeft: 0,
          reviveProgress: 0,
          syringes: 1, // 1 auto-revive syringe per match (used in solo mode)
          disconnected: false,
          disconnectTime: null,
          lastInputSeq: 0,
          xInput: 0,
          zInput: 0,
          isHost: true,
          shootingIntent: false,
          lastShotTime: 0,
          damageDealt: 0,
          kills: 0,
          revives: 0
        }
      },
      gameStarted: false,
      tickInterval: null,
      score: 0,
      round: 1,
      roundState: 'intermission',
      roundTimer: 5,
      enemies: {},
      scrap: {},
      bullets: [],
      projectiles: [], // shooter projectile nodes
      covers: {},
      crates: {},
      puddles: [],
      firePuddles: [],
      corpses: [],
      enemyIdCounter: 0,
      bulletIdCounter: 0,
      scrapIdCounter: 0
    };

    spawnCovers(rooms[roomCode]);
    spawnBarrels(rooms[roomCode]);

    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerId = playerId;
    socket.sessionToken = sessionToken;

    socket.emit('room-created', {
      roomCode,
      sessionToken,
      playerId,
      players: {
        [playerId]: { nickname: nickname || 'Host', isHost: true }
      }
    });

    console.log(`Room created: ${roomCode} by ${nickname}`);
    startGameLoop(roomCode);
  });

  // 2. Join Room
  socket.on('join-room', ({ roomCode, nickname }) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms[code];

    if (!room) {
      return socket.emit('join-error', { message: 'Room not found.' });
    }

    if (room.gameStarted) {
      return socket.emit('join-error', { message: 'Game has already started.' });
    }

    const currentPlayers = Object.keys(room.players);
    if (currentPlayers.length >= 2) {
      return socket.emit('join-error', { message: 'Room is full (max 2 players).' });
    }

    const sessionToken = generateSessionToken();
    const playerId = 'player_' + crypto.randomBytes(4).toString('hex');

    room.players[playerId] = {
      socketId: socket.id,
      playerId: playerId,
      sessionToken: sessionToken,
      nickname: nickname || 'Guest',
      x: 5,
      z: 0,
      angle: 0,
      hp: 100,
      maxHp: 100,
      scrap: 0,
      wp: 0,
      bp10: 0,
      bp20: 0,
      bp30: 0,
      blueprints: 0,
      energy: 100,
      battery: 80,
      isEnergyDepleted: false,
      isBatteryDepleted: false,
      weapons: ['pistol'],
      currentWeapon: 'pistol',
      isCrafting: false,
      craftWeapon: '',
      craftTimeLeft: 0,
      craftTotalTime: 0,
      heat: 0,
      isOverheated: false,
      scrapTransferredThisRound: 0,
      isDowned: false,
      downedTimeLeft: 0,
      reviveProgress: 0,
      syringes: 1,
      disconnected: false,
      disconnectTime: null,
      lastInputSeq: 0,
      xInput: 0,
      zInput: 0,
      isHost: false,
      shootingIntent: false,
      lastShotTime: 0,
      damageDealt: 0,
      kills: 0,
      revives: 0
    };

    socket.join(code);
    socket.roomCode = code;
    socket.playerId = playerId;
    socket.sessionToken = sessionToken;

    const playersInfo = {};
    for (const pId in room.players) {
      playersInfo[pId] = {
        nickname: room.players[pId].nickname,
        isHost: room.players[pId].isHost,
      };
    }

    socket.emit('room-joined', {
      roomCode: code,
      sessionToken,
      playerId,
      players: playersInfo
    });

    socket.to(code).emit('player-joined', {
      playerId,
      nickname: nickname || 'Guest',
      players: playersInfo
    });

    console.log(`Player ${nickname} joined room ${code}`);
  });

  // 3. Reconnect Player
  socket.on('reconnect-player', ({ roomCode, sessionToken }) => {
    const code = roomCode ? roomCode.toUpperCase().trim() : null;
    const room = rooms[code];

    if (!room) {
      return socket.emit('reconnect-failure', { message: 'Room not found.' });
    }

    let foundPlayerId = null;
    for (const pId in room.players) {
      if (room.players[pId].sessionToken === sessionToken) {
        foundPlayerId = pId;
        break;
      }
    }

    if (!foundPlayerId) {
      return socket.emit('reconnect-failure', { message: 'Session expired or invalid.' });
    }

    const player = room.players[foundPlayerId];
    player.disconnected = false;
    player.disconnectTime = null;
    player.socketId = socket.id;

    socket.join(code);
    socket.roomCode = code;
    socket.playerId = foundPlayerId;
    socket.sessionToken = sessionToken;

    console.log(`Player ${player.nickname} reconnected to room ${code}`);

    const playersInfo = {};
    for (const pId in room.players) {
      playersInfo[pId] = {
        nickname: room.players[pId].nickname,
        isHost: room.players[pId].isHost,
        disconnected: room.players[pId].disconnected,
      };
    }

    socket.emit('reconnect-success', {
      roomCode: code,
      playerId: foundPlayerId,
      players: playersInfo,
      gameStarted: room.gameStarted,
      x: player.x,
      z: player.z,
    });

    socket.to(code).emit('player-reconnected', {
      playerId: foundPlayerId,
      nickname: player.nickname,
      players: playersInfo
    });
  });

  // 4. Start Game
  socket.on('start-game', () => {
    const code = socket.roomCode;
    const room = rooms[code];

    if (!room) return;
    const player = room.players[socket.playerId];
    if (!player || !player.isHost) return;

    room.soloMode = (Object.keys(room.players).length === 1);
    room.round = 1;
    room.score = 0;
    room.roundState = 'intermission';
    room.roundTimer = 5;
    room.enemies = {};
    room.scrap = {};
    room.bullets = [];
    room.projectiles = [];
    room.puddles = [];
    room.firePuddles = [];
    room.corpses = [];
    room.crates = {};
    spawnCovers(room);
    spawnBarrels(room);
    room.enemyIdCounter = 0;
    room.bulletIdCounter = 0;
    room.scrapIdCounter = 0;

    for (const pId in room.players) {
      const p = room.players[pId];
      p.x = p.isHost ? -5 : 5;
      p.z = 0;
      p.hp = 100;
      p.scrap = 0;
      p.wp = 0;
      p.bp10 = 0;
      p.bp20 = 0;
      p.bp30 = 0;
      p.blueprints = 0;
      p.energy = 100;
      p.battery = 80;
      p.isEnergyDepleted = false;
      p.isBatteryDepleted = false;
      p.weapons = ['pistol'];
      p.currentWeapon = 'pistol';
      p.isCrafting = false;
      p.craftWeapon = '';
      p.craftTimeLeft = 0;
      p.craftTotalTime = 0;
      p.heat = 0;
      p.isOverheated = false;
      p.scrapTransferredThisRound = 0;
      
      p.isDowned = false;
      p.downedTimeLeft = 0;
      p.reviveProgress = 0;
      p.syringes = 1;

      p.damageDealt = 0;
      p.kills = 0;
      p.revives = 0;
      p.lastShotTime = 0;
      p.shootingIntent = false;
    }

    room.gameStarted = true;
    io.to(code).emit('game-started');
    console.log(`Game started in room ${code}. Solo: ${room.soloMode}`);
  });

  // 5. Input updates
  socket.on('player-input', (data) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.gameStarted) return;

    const player = room.players[socket.playerId];
    if (!player || player.disconnected) return;

    player.xInput = data.xInput;
    player.zInput = data.zInput;
    player.angle = data.angle;
    player.lastInputSeq = data.seq;
    
    // Block shooting intent if downed
    if (player.isDowned) {
      player.shootingIntent = false;
    } else {
      player.shootingIntent = data.shooting || false;
    }
  });

  // 6. Active Weapon Switch
  socket.on('switch-weapon', ({ weaponName }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room) return;

    const player = room.players[socket.playerId];
    if (!player || player.disconnected || player.hp <= 0 || player.isDowned) return;

    if (player.weapons.includes(weaponName) && !player.isCrafting) {
      player.currentWeapon = weaponName;
      socket.emit('weapon-switched', { weaponName });
      console.log(`Player ${player.nickname} switched to ${weaponName}`);
    }
  });

  // 7. Crafting Trigger (Level 1 and Level 2)
  socket.on('start-craft', ({ weaponName }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.gameStarted) return;

    const player = room.players[socket.playerId];
    if (!player || player.disconnected || player.hp <= 0 || player.isDowned || player.isCrafting) return;

    const distToCenter = Math.hypot(player.x, player.z);
    if (distToCenter > 2.0) {
      return socket.emit('craft-error', { message: 'Вы слишком далеко от верстака.' });
    }

    let scrapCost = 0;
    let wpCost = 0;
    let bp10Cost = 0;
    let bp20Cost = 0;

    if (weaponName === 'shotgun') scrapCost = 15;
    else if (weaponName === 'ar') scrapCost = 20;
    else if (weaponName === 'sniper') { wpCost = 10; bp10Cost = 1; }
    else if (weaponName === 'hmg') { wpCost = 15; bp10Cost = 1; }
    else if (weaponName === 'flamethrower') { wpCost = 12; bp10Cost = 1; bp20Cost = 1; }
    else if (weaponName === 'tesla') { wpCost = 15; bp10Cost = 1; bp20Cost = 1; }
    else if (weaponName === 'crossbow') { wpCost = 10; bp10Cost = 1; bp20Cost = 1; }
    else return socket.emit('craft-error', { message: 'Неизвестный рецепт.' });

    if (player.scrap < scrapCost || player.wp < wpCost || player.bp10 < bp10Cost || player.bp20 < bp20Cost) {
      return socket.emit('craft-error', { message: 'Недостаточно материалов для сборки.' });
    }

    player.scrap -= scrapCost;
    player.wp -= wpCost;
    player.bp10 -= bp10Cost;
    player.bp20 -= bp20Cost;

    player.isCrafting = true;
    player.craftWeapon = weaponName;
    player.craftTimeLeft = (room.roundState === 'intermission') ? 4.0 : 7.0;
    player.craftTotalTime = player.craftTimeLeft;

    io.to(code).emit('craft-started', {
      playerId: player.playerId,
      weapon: weaponName,
      craftTimeLeft: player.craftTimeLeft,
      scrap: player.scrap,
      wp: player.wp,
      bp10: player.bp10,
      bp20: player.bp20,
      bp30: player.bp30,
      blueprints: player.bp10 + player.bp20 + player.bp30
    });
    console.log(`Player ${player.nickname} started crafting ${weaponName}`);
  });

  // 8. Resource Sharing
  socket.on('transfer-scrap', ({ amount }) => {
    const code = socket.roomCode;
    const room = rooms[code];
    if (!room || !room.gameStarted) return;

    const player = room.players[socket.playerId];
    if (!player || player.disconnected || player.hp <= 0 || player.isDowned) return;

    const remoteId = Object.keys(room.players).find(id => id !== socket.playerId);
    const receiver = room.players[remoteId];

    if (!receiver || receiver.disconnected || receiver.hp <= 0 || receiver.isDowned) {
      return socket.emit('transfer-error', { message: 'Напарник недоступен.' });
    }

    const senderDist = Math.hypot(player.x, player.z);
    const receiverDist = Math.hypot(receiver.x, receiver.z);

    if (senderDist > 2.0 || receiverDist > 2.0) {
      return socket.emit('transfer-error', { message: 'Оба игрока должны находиться у верстака.' });
    }

    if (amount <= 0 || player.scrap < amount) {
      return socket.emit('transfer-error', { message: 'Недостаточно хлама.' });
    }

    const maxTransfer = Math.floor((player.scrap + player.scrapTransferredThisRound) * 0.5);
    if (player.scrapTransferredThisRound + amount > maxTransfer) {
      return socket.emit('transfer-error', { message: `Превышен лимит передачи за раунд (Макс: ${maxTransfer - player.scrapTransferredThisRound} шт.)` });
    }

    player.scrap -= amount;
    player.scrapTransferredThisRound += amount;
    receiver.scrap = Math.min(60, receiver.scrap + amount);

    io.to(code).emit('scrap-transferred', {
      senderId: player.playerId,
      receiverId: receiver.playerId,
      senderScrap: player.scrap,
      receiverScrap: receiver.scrap,
      amount
    });
  });

  // 9. Disconnect
  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
    const code = socket.roomCode;
    const pId = socket.playerId;

    const room = rooms[code];
    if (room && room.players[pId]) {
      const player = room.players[pId];
      player.disconnected = true;
      player.disconnectTime = Date.now();

      io.to(code).emit('player-disconnected', {
        playerId: pId,
        nickname: player.nickname,
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`ALTIMA server listening on port ${PORT}`);
});
