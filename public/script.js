// ALTIMA: Survival - Client Script
// Stage 3: Workbench & Crafting (Level 1)

// Game Configuration
const PLAYER_SPEED = 3.5; // m/s
const ARENA_WIDTH = 40;   // -20 to 20
const ARENA_DEPTH = 30;   // -15 to 15

// Networking State
let socket;
let myPlayerId = null;
let myRoomCode = null;
let sessionToken = null;
let isGameActive = false;
let isHost = false;
let playerList = {};

// Client-Side Prediction State
let localPlayerState = { x: -5, z: 0, angle: 0, hp: 100, maxHp: 100, scrap: 0, weapons: ['pistol'], currentWeapon: 'pistol' };
let inputSeq = 0;
let pendingInputs = [];
let targetAngle = 0;
let isShooting = false;

// Entities collections
let enemiesList = {}; // server state copy
let scrapList = {};   // server scrap copy
let remotePlayerState = null;

// Three.js Render Variables
let scene, camera, renderer, clock;
let playersMeshes = {}; // playerId -> Group
let enemiesMeshes = {}; // enemyId -> Mesh
let scrapMeshes = {};   // scrapId -> Mesh
let bulletMeshes = [];
let projectileMeshes = [];
let sniperLaserLine = null;
let latestPlayersState = {};
let wasDowned = false;
let localAutoReviveTimer = 0;
let environmentMeshes = [];
let cameraLookAt = new THREE.Vector3(0, 0, 0);
let cameraShakeAmount = 0;

// Stage 5 Environmental objects and VFX tracking
let coversList = {};
let coversMeshes = {};
let cratesList = {};
let cratesMeshes = {};
let puddleMeshes = {};
let firePuddleMeshes = {};
let flameParticles = [];
let bloodParticles = [];
let gibParticles = [];
let activeVFX = [];

// Stage 6 Barrels and combo
let barrelsList = {};
let barrelsMeshes = {};
let warpWarningMeshes = {};

const sharedBloodGeo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
const sharedBloodMat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });
const sharedGibGeo = new THREE.DodecahedronGeometry(0.15);
const sharedGibMat = new THREE.MeshBasicMaterial({ color: 0x880000 });
let lastFloatingTextTime = 0;
let comboDecayTimer = 0;

// PC Weapon Reload track
let localLastShotTime = 0;
let remoteLastShotTime = 0;

// Mouse tracking
let mouseX = 0;
let mouseY = 0;

// Joysticks State (Mobile)
let isTouchDevice = false;
let activeTouches = {};
const joystickLeft = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, xInput: 0, zInput: 0 };
const joystickRight = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, angle: 0 };

// DOM Elements
const lobbyContainer = document.getElementById('lobby-container');
const nicknameStep = document.getElementById('nickname-step');
const actionStep = document.getElementById('action-step');
const waitingStep = document.getElementById('waiting-step');
const nicknameInput = document.getElementById('nickname-input');
const currentNickname = document.getElementById('current-nickname');
const nextToLobbyBtn = document.getElementById('next-to-lobby-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const displayRoomCode = document.getElementById('display-room-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const playersList = document.getElementById('players-list');
const startGameBtn = document.getElementById('start-game-btn');
const guestWaitingMsg = document.getElementById('guest-waiting-msg');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const reconnectBanner = document.getElementById('reconnect-banner');
const reconnectTimer = document.getElementById('reconnect-timer');
const gameContainer = document.getElementById('game-container');
const gameCanvas = document.getElementById('game-canvas');

const howToPlayBtn = document.getElementById('how-to-play-btn');
const howToPlayModal = document.getElementById('how-to-play-modal');
const closeTutorialBtn = document.getElementById('close-tutorial-btn');

// HUD DOM Elements
const hudLocalName = document.getElementById('hud-local-name');
const hudLocalHpFill = document.getElementById('hud-local-hp-fill');
const hudLocalHpText = document.getElementById('hud-local-hp-text');
const hudLocalWeapon = document.getElementById('hud-local-weapon');
const hudLocalScrapHud = document.getElementById('hud-local-scrap-hud');
const hudLocalWeaponGauge = document.getElementById('hud-local-weapon-gauge');

const selectPistolBtn = document.getElementById('select-pistol');
const selectShotgunBtn = document.getElementById('select-shotgun');
const selectArBtn = document.getElementById('select-ar');
const selectSniperBtn = document.getElementById('select-sniper');
const selectHmgBtn = document.getElementById('select-hmg');
const selectFlamethrowerBtn = document.getElementById('select-flamethrower');
const selectTeslaBtn = document.getElementById('select-tesla');
const selectCrossbowBtn = document.getElementById('select-crossbow');

const workbenchHudHint = document.getElementById('workbench-hud-hint');
const workbenchModal = document.getElementById('workbench-modal');
const closeWorkbenchBtn = document.getElementById('close-workbench-btn');
const wbLocalScrap = document.getElementById('wb-local-scrap');
const wbRemoteScrap = document.getElementById('wb-remote-scrap');
const craftShotgunBtn = document.getElementById('craft-shotgun-btn');
const craftArBtn = document.getElementById('craft-ar-btn');
const craftSniperBtn = document.getElementById('craft-sniper-btn');
const craftHmgBtn = document.getElementById('craft-hmg-btn');
const craftFlamethrowerBtn = document.getElementById('craft-flamethrower-btn');
const craftTeslaBtn = document.getElementById('craft-tesla-btn');
const craftCrossbowBtn = document.getElementById('craft-crossbow-btn');
const transfer5Btn = document.getElementById('transfer-5-btn');
const transfer15Btn = document.getElementById('transfer-15-btn');

// Stage 4 Downed HUD elements
const downedOverlay = document.getElementById('downed-overlay');
const downedBleedTimer = document.getElementById('downed-bleed-timer');
const downedReviveProgressContainer = document.getElementById('downed-revive-progress-container');
const downedReviveActionText = document.getElementById('downed-revive-action-text');
const downedReviveBarFill = document.getElementById('downed-revive-bar-fill');
const revivingTeammateOverlay = document.getElementById('reviving-teammate-overlay');
const revivingTeammateBarFill = document.getElementById('reviving-teammate-bar-fill');

const hudRemoteCard = document.getElementById('hud-remote-card');
const hudRemoteName = document.getElementById('hud-remote-name');
const hudRemoteHpFill = document.getElementById('hud-remote-hp-fill');
const hudRemoteHpText = document.getElementById('hud-remote-hp-text');
const hudRemoteWeapon = document.getElementById('hud-remote-weapon');
const hudRemoteScrapHud = document.getElementById('hud-remote-scrap-hud');
const hudRemoteWeaponGauge = document.getElementById('hud-remote-weapon-gauge');
const hudRemoteDisconnectTag = document.getElementById('hud-remote-disconnect-tag');

const hudScore = document.getElementById('hud-score');
const hudRound = document.getElementById('hud-round');
const hudRoundLabel = document.getElementById('hud-round-label');
const hudTimer = document.getElementById('hud-timer');
const announcementOverlay = document.getElementById('announcement-overlay');
const announcementTitle = document.getElementById('announcement-title');
const announcementSubtitle = document.getElementById('announcement-subtitle');

// Results elements
const gameOverContainer = document.getElementById('game-over-container');
const resultsTitle = document.getElementById('results-title');
const resultsSubtitle = document.getElementById('results-subtitle');
const statRound = document.getElementById('stat-round');
const statScore = document.getElementById('stat-score');
const statP1Col = document.getElementById('stat-p1-col');
const statP2Col = document.getElementById('stat-p2-col');
const statP1Name = document.getElementById('stat-p1-name');
const statP1Damage = document.getElementById('stat-p1-damage');
const statP1Kills = document.getElementById('stat-p1-kills');
const statP1Revives = document.getElementById('stat-p1-revives');
const statP2Name = document.getElementById('stat-p2-name');
const statP2Damage = document.getElementById('stat-p2-damage');
const statP2Kills = document.getElementById('stat-p2-kills');
const statP2Revives = document.getElementById('stat-p2-revives');
const restartGameBtn = document.getElementById('restart-game-btn');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');

// --- Audio Manager ---
const GameAudio = {
  bgm: new Audio('audio/main_menu_1.mp3'),
  menuClick: new Audio('audio/menu_click.mp3'),
  ctx: null,
  buffers: {},
  sounds: {
    pistol: 'audio/pistol_shot.mp3',
    shotgun: 'audio/shotgun.mp3',
    hit: 'audio/shot_on_mob.mp3',
    scrapNormal: 'audio/zapchast_1.mp3',
    scrapGood: 'audio/zapchast_xoroshaya.mp3'
  },
  lastPlayed: {},

  init() {
    this.bgm.loop = true;
    this.bgm.volume = 0.5;
    
    // Initialize Web Audio API for zero-latency mobile performance
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      this.ctx = new AudioContext();
      for (let key in this.sounds) {
        this.lastPlayed[key] = 0;
        fetch(this.sounds[key])
          .then(res => res.arrayBuffer())
          .then(data => this.ctx.decodeAudioData(data))
          .then(buffer => { this.buffers[key] = buffer; })
          .catch(e => console.error("Audio decode error for", key));
      }
    }
    
    document.addEventListener('click', (e) => {
      // Unlock AudioContext on iOS/Android
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      if (e.target.closest('button') || e.target.closest('.btn') || e.target.closest('.weapon-btn')) {
        this.playClick();
      }
      if (!isGameActive && this.bgm.paused) {
        this.bgm.play().catch(() => {});
      }
    });
  },
  playClick() {
    const s = this.menuClick.cloneNode();
    s.volume = 0.8;
    s.play().catch(() => {});
  },
  playSound(name, vol = 0.8) {
    if (!this.ctx || !this.buffers[name]) return;
    
    const now = Date.now();
    // Throttle overlapping sounds
    if (now - this.lastPlayed[name] < 50) return;
    this.lastPlayed[name] = now;

    const source = this.ctx.createBufferSource();
    source.buffer = this.buffers[name];
    
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = vol;
    
    source.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    source.start(0);
  },
  stopBgm() {
    this.bgm.pause();
    this.bgm.currentTime = 0;
  }
};

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  GameAudio.init();
  const savedNick = localStorage.getItem('altima_nickname');
  if (savedNick) {
    nicknameInput.value = savedNick;
  }

  setupSocket();

  // Button Listeners
  
  function goFullscreen() {
    if (isTouchDevice) {
      const docElm = document.documentElement;
      if (docElm.requestFullscreen) {
        docElm.requestFullscreen().then(() => {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        }).catch(() => {});
      } else if (docElm.webkitRequestFullScreen) {
        docElm.webkitRequestFullScreen();
      }
    }
  }

  nextToLobbyBtn.addEventListener('click', enterLobby);
  createRoomBtn.addEventListener('click', () => { goFullscreen(); createRoom(); });
  joinRoomBtn.addEventListener('click', () => { goFullscreen(); joinRoom(); });
  copyCodeBtn.addEventListener('click', copyRoomCode);
  startGameBtn.addEventListener('click', () => { goFullscreen(); startGame(); });
  leaveRoomBtn.addEventListener('click', leaveRoom);
  restartGameBtn.addEventListener('click', () => {
    gameOverContainer.classList.add('hidden');
    socket.emit('start-game');
  });

  backToLobbyBtn.addEventListener('click', () => {
    gameOverContainer.classList.add('hidden');
    leaveRoom();
  });

  howToPlayBtn.addEventListener('click', () => {
    howToPlayModal.classList.remove('hidden');
  });
  closeTutorialBtn.addEventListener('click', () => {
    howToPlayModal.classList.add('hidden');
  });

  // Workbench listeners
  workbenchHudHint.addEventListener('click', () => {
    workbenchModal.classList.toggle('hidden');
  });
  closeWorkbenchBtn.addEventListener('click', () => {
    workbenchModal.classList.add('hidden');
  });

  craftShotgunBtn.addEventListener('click', () => {
    socket.emit('start-craft', { weaponName: 'shotgun' });
    workbenchModal.classList.add('hidden');
  });

  craftArBtn.addEventListener('click', () => {
    socket.emit('start-craft', { weaponName: 'ar' });
    workbenchModal.classList.add('hidden');
  });

  craftSniperBtn.addEventListener('click', () => {
    socket.emit('start-craft', { weaponName: 'sniper' });
    workbenchModal.classList.add('hidden');
  });

  craftHmgBtn.addEventListener('click', () => {
    socket.emit('start-craft', { weaponName: 'hmg' });
    workbenchModal.classList.add('hidden');
  });

  craftFlamethrowerBtn.addEventListener('click', () => {
    socket.emit('start-craft', { weaponName: 'flamethrower' });
    workbenchModal.classList.add('hidden');
  });

  craftTeslaBtn.addEventListener('click', () => {
    socket.emit('start-craft', { weaponName: 'tesla' });
    workbenchModal.classList.add('hidden');
  });

  craftCrossbowBtn.addEventListener('click', () => {
    socket.emit('start-craft', { weaponName: 'crossbow' });
    workbenchModal.classList.add('hidden');
  });

  transfer5Btn.addEventListener('click', () => {
    socket.emit('transfer-scrap', { amount: 5 });
  });

  transfer15Btn.addEventListener('click', () => {
    socket.emit('transfer-scrap', { amount: 15 });
  });

  // HUD Quick weapon selections
  selectPistolBtn.addEventListener('click', () => {
    socket.emit('switch-weapon', { weaponName: 'pistol' });
  });

  selectShotgunBtn.addEventListener('click', () => {
    socket.emit('switch-weapon', { weaponName: 'shotgun' });
  });

  selectArBtn.addEventListener('click', () => {
    socket.emit('switch-weapon', { weaponName: 'ar' });
  });

  selectSniperBtn.addEventListener('click', () => {
    socket.emit('switch-weapon', { weaponName: 'sniper' });
  });

  selectHmgBtn.addEventListener('click', () => {
    socket.emit('switch-weapon', { weaponName: 'hmg' });
  });

  selectFlamethrowerBtn.addEventListener('click', () => {
    socket.emit('switch-weapon', { weaponName: 'flamethrower' });
  });

  selectTeslaBtn.addEventListener('click', () => {
    socket.emit('switch-weapon', { weaponName: 'tesla' });
  });

  selectCrossbowBtn.addEventListener('click', () => {
    socket.emit('switch-weapon', { weaponName: 'crossbow' });
  });

  // Keyboard Event Listeners for PC
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('mousemove', handleMouseMove);
  
  window.addEventListener('mousedown', (e) => {
    if (isGameActive && !isTouchDevice && e.button === 0) {
      // Don't shoot if clicking inside the open workbench modal
      if (!workbenchModal.classList.contains('hidden')) return;
      isShooting = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      isShooting = false;
    }
  });

  detectTouch();
});

// Detect Touch Support & Setup Joysticks
function detectTouch() {
  const detect = () => {
    isTouchDevice = true;
    document.getElementById('mobile-controls').classList.remove('hidden');
    setupMobileJoysticks();
    
    // In mobile mode, make HUD quick switch buttons larger and touch-enabled
    const selector = document.querySelector('.weapon-selector-row');
    if (selector) selector.style.gap = '15px';
    
    window.removeEventListener('touchstart', detect);
  };
  window.addEventListener('touchstart', detect);
}

// ----------------------------------------------------
// NETWORKING LOGIC (Socket.io)
// ----------------------------------------------------
function setupSocket() {
  socket = io({
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('Connected to server.');
    reconnectBanner.classList.add('hidden');
  });

  socket.on('disconnect', (reason) => {
    console.warn('Disconnected:', reason);
    if (isGameActive) {
      reconnectBanner.classList.remove('hidden');
      startReconnectTimer();
    }
  });

  // Host created room
  socket.on('room-created', (data) => {
    myRoomCode = data.roomCode;
    sessionToken = data.sessionToken;
    myPlayerId = data.playerId;
    isHost = true;

    sessionStorage.setItem('altima_room_code', myRoomCode);
    sessionStorage.setItem('altima_session_token', sessionToken);

    updateWaitingRoomUI(data.players);
    showStep(waitingStep);
  });

  // Client joined room
  socket.on('room-joined', (data) => {
    myRoomCode = data.roomCode;
    sessionToken = data.sessionToken;
    myPlayerId = data.playerId;
    isHost = false;

    sessionStorage.setItem('altima_room_code', myRoomCode);
    sessionStorage.setItem('altima_session_token', sessionToken);

    updateWaitingRoomUI(data.players);
    showStep(waitingStep);
  });

  socket.on('join-error', (data) => {
    alert(data.message);
  });

  socket.on('player-joined', (data) => {
    updateWaitingRoomUI(data.players);
  });

  socket.on('player-left', (data) => {
    if (data.playerId === myPlayerId) {
      leaveRoom();
    } else {
      if (playersMeshes[data.playerId]) {
        scene.remove(playersMeshes[data.playerId]);
        delete playersMeshes[data.playerId];
      }
      remotePlayerState = null;
      hudRemoteCard.classList.add('hidden');
      document.getElementById('remote-weapon-info-row').classList.add('hidden');
      document.getElementById('remote-inventory-row').classList.add('hidden');
      alert('Напарник покинул сектор.');
    }
  });

  socket.on('player-disconnected', (data) => {
    if (data.playerId !== myPlayerId) {
      hudRemoteDisconnectTag.classList.remove('hidden');
    }
  });

  socket.on('player-reconnected', (data) => {
    if (data.playerId !== myPlayerId) {
      hudRemoteDisconnectTag.classList.add('hidden');
    }
    updateWaitingRoomUI(data.players);
  });

  socket.on('reconnect-success', (data) => {
    console.log('Reconnection successful!');
    reconnectBanner.classList.add('hidden');
    clearInterval(reconnectInterval);
    
    myRoomCode = data.roomCode;
    myPlayerId = data.playerId;
    updateWaitingRoomUI(data.players);

    if (data.gameStarted) {
      isGameActive = true;
      lobbyContainer.classList.add('hidden');
      gameContainer.classList.remove('hidden');
      
      if (!scene) {
        init3D();
      }

      localPlayerState.x = data.x;
      localPlayerState.z = data.z;
      if (playersMeshes[myPlayerId]) {
        playersMeshes[myPlayerId].position.set(data.x, 0, data.z);
      }
    } else {
      showStep(waitingStep);
    }
  });

  socket.on('reconnect-failure', (data) => {
    sessionStorage.clear();
    location.reload();
  });

  socket.on('game-started', () => {
    isGameActive = true;
    GameAudio.stopBgm();
    lobbyContainer.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    
    // Set names in HUD
    hudLocalName.textContent = nicknameInput.value.toUpperCase();
    for (const id in playerList) {
      if (id !== myPlayerId) {
        hudRemoteCard.classList.remove('hidden');
        document.getElementById('remote-weapon-info-row').classList.remove('hidden');
        document.getElementById('remote-inventory-row').classList.remove('hidden');
        hudRemoteName.textContent = playerList[id].nickname.toUpperCase();
      }
    }

    init3D();
  });

  // Combat / Crafting events
  socket.on('weapon-fired', (data) => {
    if (data.playerId === myPlayerId) {
      localLastShotTime = Date.now();
    } else {
      remoteLastShotTime = Date.now();
    }
    
    if (data.weapon === 'pistol') GameAudio.playSound('pistol', 0.4);
    else if (data.weapon === 'shotgun') GameAudio.playSound('shotgun', 0.5);
    
    if (scene && data.weapon !== 'flamethrower' && data.weapon !== 'tesla' && data.weapon !== 'crossbow') {
       // Calculate exact barrel position
       // Player local X axis (right side is -X)
       const localX_dx = Math.sin(data.angle + Math.PI / 2);
       const localX_dz = Math.cos(data.angle + Math.PI / 2);
       const forwardDx = Math.sin(data.angle);
       const forwardDz = Math.cos(data.angle);
       
       // Right arm is at -0.4 local X. Weapon sticks out ~0.85 local Z.
       const flashX = data.x + localX_dx * (-0.4) + forwardDx * 0.85;
       const flashZ = data.z + localX_dz * (-0.4) + forwardDz * 0.85;
       const flashPos = new THREE.Vector3(flashX, 0.85, flashZ);
       
       const flashLight = new THREE.PointLight(0xffaa00, 2, 6);
       flashLight.position.copy(flashPos);
       scene.add(flashLight);
       
       const flashGeo = new THREE.SphereGeometry(0.12, 8, 8);
       const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
       const flashMesh = new THREE.Mesh(flashGeo, flashMat);
       flashMesh.position.copy(flashPos);
       scene.add(flashMesh);
       
       setTimeout(() => {
         if(scene) {
           scene.remove(flashLight);
           scene.remove(flashMesh);
         }
       }, 50);
    }

    if (data.weapon === 'flamethrower' && scene) {
      const baseAngle = data.angle;
      const startX = data.x;
      const startZ = data.z;
      
      // Spawn flame particles in a cone
      for (let i = 0; i < 6; i++) {
        const angle = baseAngle + (Math.random() - 0.5) * (30 * Math.PI / 180);
        const speed = 6.0 + Math.random() * 6.0;
        
        const pGeo = new THREE.SphereGeometry(0.12 + Math.random() * 0.12, 4, 4);
        const pMat = new THREE.MeshBasicMaterial({
          color: Math.random() < 0.3 ? 0xffcc00 : 0xff4500, // yellow-orange mix
          transparent: true,
          opacity: 0.8
        });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.set(startX + Math.sin(baseAngle) * 0.6, 0.5, startZ + Math.cos(baseAngle) * 0.6);
        scene.add(pMesh);
        
        flameParticles.push({
          mesh: pMesh,
          vx: Math.sin(angle) * speed,
          vz: Math.cos(angle) * speed,
          vy: (Math.random() - 0.2) * 0.5,
          endTime: Date.now() + 400,
          duration: 400
        });
      }
    }
  });

  socket.on('player-hit', (data) => {
    if (data.playerId === myPlayerId) {
      cameraShakeAmount = 0.4;
    }
  });

  socket.on('enemy-hit', (data) => {
    GameAudio.playSound('hit', 0.3);
    const mesh = enemiesMeshes[data.enemyId];
    if (mesh) {
      mesh.userData.flashEndTime = Date.now() + 100;
      
      // Spawn Blood Particles
      if (scene) {
        let pMesh = playersMeshes[myPlayerId];
        let angleX = (Math.random() - 0.5) * 2;
        let angleZ = (Math.random() - 0.5) * 2;
        if (pMesh) {
          const dx = data.x - pMesh.position.x;
          const dz = data.z - pMesh.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 0.1) {
            angleX = dx / dist + (Math.random() - 0.5) * 0.5;
            angleZ = dz / dist + (Math.random() - 0.5) * 0.5;
          }
        }
        
        // Limit blood particles on mobile
        const maxParticles = isTouchDevice ? 2 : 6;
        for(let i=0; i<maxParticles; i++) {
          const bMesh = new THREE.Mesh(sharedBloodGeo, sharedBloodMat);
          
          bMesh.position.set(
            data.x + (Math.random()-0.5)*0.3, 
            0.5 + Math.random()*0.3, 
            data.z + (Math.random()-0.5)*0.3
          );
          scene.add(bMesh);
          
          bloodParticles.push({
            mesh: bMesh,
            vx: angleX * (0.5 + Math.random() * 1.5),
            vz: angleZ * (0.5 + Math.random() * 1.5),
            vy: 1.0 + Math.random() * 1.5,
            endTime: Date.now() + 1500,
            duration: 1500
          });
        }
      }
    }
    
    // Throttle floating text on hit to prevent canvas generation lag (especially on mobile)
    const now = Date.now();
    if (!isTouchDevice || now - lastFloatingTextTime > 40) {
      spawnFloatingText(Math.round(data.damage).toString(), data.x, 1.2, data.z, '#ff0055');
      lastFloatingTextTime = now;
    }
  });

  socket.on('enemy-killed', (data) => {
    const mesh = enemiesMeshes[data.enemyId];
    if (mesh) {
      if (data.weapon === 'shotgun') {
        mesh.visible = false;
        mesh.userData.isDying = true;
        
        // Spawn Gibs
        if (scene) {
          let angleX = 0;
          let angleZ = 0;
          if (data.ownerX !== null && data.ownerZ !== null) {
            const dx = data.x - data.ownerX;
            const dz = data.z - data.ownerZ;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.1) {
              angleX = dx / dist;
              angleZ = dz / dist;
            }
          }
          
          // Limit gibs on mobile
          const maxGibs = isTouchDevice ? 2 : 6;
          for(let i=0; i<maxGibs; i++) {
            const gMesh = new THREE.Mesh(sharedGibGeo, sharedGibMat);
            gMesh.scale.setScalar(0.7 + Math.random() * 0.6);
            gMesh.position.set(
              data.x + (Math.random()-0.5)*0.5, 
              0.5 + Math.random()*0.5, 
              data.z + (Math.random()-0.5)*0.5
            );
            scene.add(gMesh);
            gibParticles.push({
              mesh: gMesh,
              vx: angleX * (3 + Math.random() * 5) + (Math.random() - 0.5) * 2,
              vz: angleZ * (3 + Math.random() * 5) + (Math.random() - 0.5) * 2,
              vy: 2 + Math.random() * 4,
              endTime: Date.now() + 5000,
              duration: 5000
            });
          }
          
          // Extra blood for shotgun
          for(let i=0; i<15; i++) {
             const bGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
             const bMat = new THREE.MeshBasicMaterial({ color: 0x770000 });
             const bMesh = new THREE.Mesh(bGeo, bMat);
             bMesh.position.set(data.x, 0.5, data.z);
             scene.add(bMesh);
             bloodParticles.push({
               mesh: bMesh,
               vx: angleX * 2 + (Math.random()-0.5)*4,
               vz: angleZ * 2 + (Math.random()-0.5)*4,
               vy: 1 + Math.random()*3,
               endTime: Date.now() + 2000,
               duration: 2000
             });
          }
        }
      } else {
        mesh.userData.isDying = true;
        mesh.userData.deathTime = Date.now();
        if (mesh.material) {
          mesh.material.transparent = true;
        }
      }
    }
    spawnFloatingText('+10', data.x, 1.2, data.z, '#00ffc8');
  });

  // Scrap magnet and trade hooks
  socket.on('scrap-picked', (data) => {
    if (data.type === 'wp' || data.type === 'blueprint') {
      GameAudio.playSound('scrapGood', 0.6);
    } else {
      GameAudio.playSound('scrapNormal', 0.6);
    }
    
    if (data.playerId === myPlayerId) {
      // Spawn small visual confirmation text
      const myMesh = playersMeshes[myPlayerId];
      if (myMesh) {
        spawnFloatingText('+1', myMesh.position.x, 1.2, myMesh.position.z, '#ffea00');
      }
    }
  });

  socket.on('scrap-transferred', (data) => {
    // Spawn floating confirmation at workbench center
    spawnFloatingText(`⚙️ ПЕРЕДАНО: ${data.amount}`, 0, 1.4, 0, '#00ffaa');
    // Force HUD visual refresh
    if (data.senderId === myPlayerId) {
      spawnFloatingText(`-${data.amount}`, playersMeshes[myPlayerId].position.x, 1.2, playersMeshes[myPlayerId].position.z, '#ff0055');
    } else {
      spawnFloatingText(`+${data.amount}`, playersMeshes[myPlayerId].position.x, 1.2, playersMeshes[myPlayerId].position.z, '#00ffc8');
    }
  });

  socket.on('craft-started', (data) => {
    if (data.playerId === myPlayerId) {
      // Visual indicator
      spawnFloatingText('СБОРКА НАЧАТА...', playersMeshes[myPlayerId].position.x, 1.2, playersMeshes[myPlayerId].position.z, '#00ffc8');
    }
  });

  socket.on('craft-success', (data) => {
    if (data.playerId === myPlayerId) {
      spawnFloatingText('СБОРКА УСПЕШНА!', playersMeshes[myPlayerId].position.x, 1.2, playersMeshes[myPlayerId].position.z, '#00ffaa');
      announcementOverlay.classList.add('hidden');
    }
  });

  socket.on('craft-interrupted', (data) => {
    if (data.playerId === myPlayerId) {
      spawnFloatingText('СБОРКА ПРЕРВАНА!', playersMeshes[myPlayerId].position.x, 1.2, playersMeshes[myPlayerId].position.z, '#ff0055');
    }
  });

  socket.on('craft-error', (data) => {
    alert(data.message);
  });

  socket.on('transfer-error', (data) => {
    alert(data.message);
  });

  socket.on('player-downed', (data) => {
    const targetMesh = playersMeshes[data.playerId];
    if (targetMesh) {
      spawnFloatingText('РАНЕН!', targetMesh.position.x, 1.4, targetMesh.position.z, '#ff0055');
    }
    
    announcementOverlay.classList.remove('hidden');
    announcementTitle.textContent = `${data.nickname.toUpperCase()} РАНЕН`;
    announcementTitle.className = 'pulse-text text-red';
    announcementSubtitle.textContent = `Потеряно скрапа: ${data.scrapDropped}`;
    
    setTimeout(() => {
      if (announcementTitle.textContent.includes('РАНЕН')) {
        announcementOverlay.classList.add('hidden');
      }
    }, 3000);
  });

  socket.on('revive-success', (data) => {
    const targetMesh = playersMeshes[data.playerId];
    if (targetMesh) {
      spawnFloatingText('РЕАНИМИРОВАН!', targetMesh.position.x, 1.4, targetMesh.position.z, '#00ffaa');
    }
    if (data.playerId === myPlayerId) {
      downedOverlay.classList.add('hidden');
    }
  });

  // Round Announcements
  socket.on('round-started', (data) => {
    announcementOverlay.classList.remove('hidden');
    announcementTitle.textContent = `РАУНД ${data.round}`;
    announcementTitle.className = 'pulse-text';
    announcementSubtitle.textContent = 'УНИЧТОЖЬТЕ МУТАНТОВ';
    
    setTimeout(() => {
      if (announcementTitle.textContent.startsWith('РАУНД')) {
        announcementOverlay.classList.add('hidden');
      }
    }, 3000);
  });

  socket.on('round-completed', (data) => {
    announcementOverlay.classList.remove('hidden');
    announcementTitle.textContent = 'ВОЛНА ЗАЧИЩЕНА';
    announcementTitle.className = 'pulse-text neon-text';
    announcementSubtitle.textContent = 'ПЕРЕРЫВ ДЛЯ СБОРА И КРАФТА';

    setTimeout(() => {
      if (announcementTitle.textContent === 'ВОЛНА ЗАЧИЩЕНА') {
        announcementOverlay.classList.add('hidden');
      }
    }, 3000);
  });

  socket.on('game-over', (data) => {
    isGameActive = false;
    
    // Close modal if open
    workbenchModal.classList.add('hidden');
    document.getElementById('hud-combo-wrapper').classList.add('hidden');

    disposeScene();
    
    gameContainer.classList.add('hidden');
    gameOverContainer.classList.remove('hidden');

    const resultsTitle = document.getElementById('results-title');
    const resultsSubtitle = document.getElementById('results-subtitle');
    resultsTitle.textContent = 'МИССИЯ ПРОВАЛЕНА';
    resultsTitle.dataset.text = 'МИССИЯ ПРОВАЛЕНА';
    resultsTitle.className = 'glitch-title crimson-text';
    resultsSubtitle.textContent = 'ОПЕРАЦИЯ ALTIMA ЗАВЕРШЕНА';
    resultsSubtitle.style.color = '';

    statRound.textContent = `${data.round}/50`;
    statScore.textContent = data.score;

    const p1 = data.stats.find(p => p.isHost);
    const p2 = data.stats.find(p => !p.isHost);

    if (p1) {
      statP1Name.textContent = p1.nickname.toUpperCase();
      statP1Damage.textContent = Math.round(p1.damage);
      statP1Kills.textContent = p1.kills;
      statP1Revives.textContent = p1.revives;
    }

    if (p2) {
      statP2Col.classList.remove('hidden');
      statP2Name.textContent = p2.nickname.toUpperCase();
      statP2Damage.textContent = Math.round(p2.damage);
      statP2Kills.textContent = p2.kills;
      statP2Revives.textContent = p2.revives;
    } else {
      statP2Col.classList.add('hidden');
    }
  });

  socket.on('game-victory', (data) => {
    isGameActive = false;
    workbenchModal.classList.add('hidden');
    document.getElementById('hud-combo-wrapper').classList.add('hidden');

    disposeScene();

    gameContainer.classList.add('hidden');
    gameOverContainer.classList.remove('hidden');

    const resultsTitle = document.getElementById('results-title');
    const resultsSubtitle = document.getElementById('results-subtitle');
    resultsTitle.textContent = '🏆 МИССИЯ ВЫПОЛНЕНА!';
    resultsTitle.dataset.text = 'МИССИЯ ВЫПОЛНЕНА!';
    resultsTitle.className = 'glitch-title neon-text victory-title';
    resultsSubtitle.textContent = '🎉 ALTIMA УНИЧТОЖЕНА. СЕКТОР ОСВОБОЖДЁН.';
    resultsSubtitle.style.color = '#00ffc8';

    statRound.textContent = '50/50 ✅';
    statScore.textContent = data.score;

    const p1 = data.stats.find(p => p.isHost);
    const p2 = data.stats.find(p => !p.isHost);

    if (p1) {
      statP1Name.textContent = p1.nickname.toUpperCase();
      statP1Damage.textContent = Math.round(p1.damage);
      statP1Kills.textContent = p1.kills;
      statP1Revives.textContent = p1.revives;
    }
    if (p2) {
      statP2Col.classList.remove('hidden');
      statP2Name.textContent = p2.nickname.toUpperCase();
      statP2Damage.textContent = Math.round(p2.damage);
      statP2Kills.textContent = p2.kills;
      statP2Revives.textContent = p2.revives;
    } else {
      statP2Col.classList.add('hidden');
    }
  });

  socket.on('tesla-fired', (data) => {
    if (!scene) return;
    if (data.playerId === myPlayerId) {
      localLastShotTime = Date.now();
    } else {
      remoteLastShotTime = Date.now();
    }
    let lastPt = new THREE.Vector3(data.x, 0.5, data.z);
    data.targets.forEach(tgt => {
      const nextPt = new THREE.Vector3(tgt.x, 0.4, tgt.z);
      createLightningBolt(lastPt, nextPt);
      lastPt = nextPt;
    });
  });

  socket.on('kamikaze-fuse-start', (data) => {
    const mesh = enemiesMeshes[data.enemyId];
    if (mesh) {
      mesh.userData.isFuseActive = true;
      spawnFloatingText('⚠️ ДЕТОНАЦИЯ!', mesh.position.x, 1.2, mesh.position.z, '#ff3300');
    }
  });

  socket.on('kamikaze-detonate', (data) => {
    if (!scene) return;
    const expGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const expMat = new THREE.MeshBasicMaterial({
      color: 0xff3300,
      transparent: true,
      opacity: 0.8
    });
    const expMesh = new THREE.Mesh(expGeo, expMat);
    expMesh.position.set(data.x, 0.5, data.z);
    scene.add(expMesh);
    
    activeVFX.push({
      mesh: expMesh,
      type: 'explosion',
      x: data.x,
      z: data.z,
      targetRadius: data.radius,
      endTime: Date.now() + 350,
      duration: 350
    });
    
    if (myPlayerId && playersMeshes[myPlayerId]) {
      const myMesh = playersMeshes[myPlayerId];
      const dist = Math.hypot(myMesh.position.x - data.x, myMesh.position.z - data.z);
      if (dist < 10) {
        cameraShakeAmount = Math.max(cameraShakeAmount, 0.8 * (1.0 - dist / 10));
      }
    }
  });

  socket.on('barrel-detonate', (data) => {
    if (!scene) return;
    const expGeo = new THREE.SphereGeometry(0.1, 16, 16);
    const expMat = new THREE.MeshBasicMaterial({
      color: 0xff4500, // orangey red
      transparent: true,
      opacity: 0.9
    });
    const expMesh = new THREE.Mesh(expGeo, expMat);
    expMesh.position.set(data.x, 0.5, data.z);
    scene.add(expMesh);
    
    activeVFX.push({
      mesh: expMesh,
      type: 'explosion',
      x: data.x,
      z: data.z,
      targetRadius: data.radius,
      endTime: Date.now() + 400,
      duration: 400
    });

    spawnFloatingText('💥 ВЗРЫВ БОЧКИ!', data.x, 1.2, data.z, '#ff4500');
    
    if (myPlayerId && playersMeshes[myPlayerId]) {
      const myMesh = playersMeshes[myPlayerId];
      const dist = Math.hypot(myMesh.position.x - data.x, myMesh.position.z - data.z);
      if (dist < 12) {
        cameraShakeAmount = Math.max(cameraShakeAmount, 1.2 * (1.0 - dist / 12));
      }
    }
  });

  socket.on('necromancer-revive', (data) => {
    if (!scene) return;
    const necMesh = enemiesMeshes[data.necromancerId];
    if (necMesh) {
      spawnFloatingText('🔮 ВОСКРЕШЕНИЕ!', necMesh.position.x, 1.4, necMesh.position.z, '#00ff33');
    }
    data.positions.forEach(pos => {
      for (let i = 0; i < 15; i++) {
        const pGeo = new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 4, 4);
        const pMat = new THREE.MeshBasicMaterial({
          color: 0x00ff33,
          transparent: true,
          opacity: 0.9
        });
        const pMesh = new THREE.Mesh(pGeo, pMat);
        pMesh.position.set(
          pos.x + (Math.random() - 0.5) * 0.8,
          0.1,
          pos.z + (Math.random() - 0.5) * 0.8
        );
        scene.add(pMesh);
        
        activeVFX.push({
          mesh: pMesh,
          type: 'spark',
          vy: 1.0 + Math.random() * 1.5,
          vx: (Math.random() - 0.5) * 0.4,
          vz: (Math.random() - 0.5) * 0.4,
          endTime: Date.now() + 600,
          duration: 600
        });
      }
    });
  });

  socket.on('shield-hit', (data) => {
    spawnFloatingText('🛡️ БЛОК', data.x, 1.2, data.z, '#888888');
  });

  socket.on('crates-spawned', (data) => {
    announcementOverlay.classList.remove('hidden');
    announcementTitle.textContent = '📦 СБРОС КРАЙТОВ';
    announcementTitle.className = 'pulse-text text-yellow';
    announcementSubtitle.textContent = 'Найдите и откройте контейнеры с ресурсами!';
    setTimeout(() => {
      if (announcementTitle.textContent === '📦 СБРОС КРАЙТОВ') {
        announcementOverlay.classList.add('hidden');
      }
    }, 3000);
  });

  socket.on('crate-destroyed', (data) => {
    if (!scene) return;
    for (let i = 0; i < 10; i++) {
      const pGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
      const pMat = new THREE.MeshStandardMaterial({
        color: 0x8b5a2b,
        roughness: 0.8
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(data.x, 0.35, data.z);
      scene.add(pMesh);
      
      activeVFX.push({
        mesh: pMesh,
        type: 'spark',
        vy: 1.0 + Math.random() * 2.0,
        vx: (Math.random() - 0.5) * 2.0,
        vz: (Math.random() - 0.5) * 2.0,
        endTime: Date.now() + 500,
        duration: 500
      });
    }
  });

  socket.on('cover-destroyed', (data) => {
    if (!scene) return;
    const mesh = coversMeshes[data.coverId];
    const px = mesh ? mesh.position.x : 0;
    const pz = mesh ? mesh.position.z : 0;
    
    for (let i = 0; i < 12; i++) {
      const pGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
      const pMat = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.9
      });
      const pMesh = new THREE.Mesh(pGeo, pMat);
      pMesh.position.set(px, 0.4, pz);
      scene.add(pMesh);
      
      activeVFX.push({
        mesh: pMesh,
        type: 'spark',
        vy: 1.0 + Math.random() * 2.0,
        vx: (Math.random() - 0.5) * 2.0,
        vz: (Math.random() - 0.5) * 2.0,
        endTime: Date.now() + 500,
        duration: 500
      });
    }
  });

  // Server state updates
  socket.on('state-update', (state) => {
    if (!isGameActive) return;

    enemiesList = state.enemies;
    scrapList = state.scrap;
    latestPlayersState = state.players;
    barrelsList = state.barrels || {};

    // 1. Process local player reconciliation
    if (state.players[myPlayerId]) {
      const serverMe = state.players[myPlayerId];
      
      // Update local HP and parameters
      localPlayerState.hp = serverMe.hp;
      localPlayerState.maxHp = serverMe.maxHp;
      localPlayerState.scrap = serverMe.scrap;
      localPlayerState.wp = serverMe.wp;
      localPlayerState.blueprints = serverMe.blueprints;
      localPlayerState.bp10 = serverMe.bp10;
      localPlayerState.bp20 = serverMe.bp20;
      localPlayerState.bp30 = serverMe.bp30;
      localPlayerState.weapons = serverMe.weapons;
      localPlayerState.currentWeapon = serverMe.currentWeapon;
      localPlayerState.isDowned = serverMe.isDowned;
      localPlayerState.isCrafting = serverMe.isCrafting;

      // Update local HUD HP bar
      const displayHp = Math.round(Math.max(0, serverMe.hp));
      hudLocalHpFill.style.width = `${(displayHp / serverMe.maxHp) * 100}%`;
      hudLocalHpText.textContent = `${displayHp}/${serverMe.maxHp}`;
      
      if (serverMe.hp > 50) {
        hudLocalHpFill.style.background = 'linear-gradient(90deg, #0055ff, #00bbff)';
      } else if (serverMe.hp > 20) {
        hudLocalHpFill.style.background = 'linear-gradient(90deg, #eab308, #facc15)';
      } else {
        hudLocalHpFill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
      }

      // Update local HUD scrap value
      hudLocalScrapHud.textContent = `⚙️ ${serverMe.scrap}/60`;
      if (serverMe.scrap >= 60) {
        hudLocalScrapHud.style.color = '#ef4444'; // Red flash backpack full
      } else {
        hudLocalScrapHud.style.color = '';
      }

      document.getElementById('hud-local-wp-hud').textContent = `🔧 ${serverMe.wp}/25`;
      document.getElementById('hud-local-bp10-hud').textContent = `📜A ${serverMe.bp10}`;
      document.getElementById('hud-local-bp20-hud').textContent = `📜B ${serverMe.bp20}`;
      document.getElementById('hud-local-bp30-hud').textContent = `📜C ${serverMe.bp30}`;

      const remotePlayerId = Object.keys(playerList).find(id => id !== myPlayerId);
      const isSolo = !remotePlayerId;
      const syringeHud = document.getElementById('hud-local-syringe-hud');
      if (isSolo) {
        syringeHud.classList.remove('hidden');
        syringeHud.textContent = `💉 ${serverMe.syringes}`;
      } else {
        syringeHud.classList.add('hidden');
      }

      // Update workbench modal labels
      wbLocalScrap.textContent = `⚙️ ${serverMe.scrap}/60`;
      document.getElementById('wb-local-wp').textContent = `🔧 ${serverMe.wp}/25`;
      document.getElementById('wb-local-bp10').textContent = `📜A ${serverMe.bp10}`;
      document.getElementById('wb-local-bp20').textContent = `📜B ${serverMe.bp20}`;
      document.getElementById('wb-local-bp30').textContent = `📜C ${serverMe.bp30}`;

      // Update local Weapon status and gauges
      updateWeaponGauges(serverMe, 'local');

      // Update Quick Selection UI Button Highlights
      updateWeaponHUDButtons(serverMe.weapons, serverMe.currentWeapon);

      // Handle downed UI overlays
      if (serverMe.isDowned) {
        downedOverlay.classList.remove('hidden');
        downedBleedTimer.textContent = Math.max(0, serverMe.downedTimeLeft).toFixed(1);
        
        if (isSolo) {
          if (!wasDowned) {
            localAutoReviveTimer = 4.0;
          }
          localAutoReviveTimer = Math.max(0, localAutoReviveTimer - 0.05); // 20Hz ticks = 50ms decrement
          downedReviveProgressContainer.classList.remove('hidden');
          downedReviveActionText.textContent = 'АВТО-РЕАНИМАЦИЯ ИНИЦИИРОВАНА...';
          downedReviveBarFill.style.width = `${((4.0 - localAutoReviveTimer) / 4.0) * 100}%`;
        } else {
          if (serverMe.reviveProgress > 0) {
            downedReviveProgressContainer.classList.remove('hidden');
            downedReviveActionText.textContent = 'ВАС РЕАНИМИРУЕТ НАПАРНИК...';
            downedReviveBarFill.style.width = `${(serverMe.reviveProgress / 4.0) * 100}%`;
          } else {
            downedReviveProgressContainer.classList.add('hidden');
          }
        }
      } else {
        downedOverlay.classList.add('hidden');
      }
      wasDowned = serverMe.isDowned;

      // Remove input payloads processed by server
      pendingInputs = pendingInputs.filter(input => input.seq > serverMe.lastInputSeq);
      
      // Re-apply remaining inputs on top of last authoritative server position
      let predX = serverMe.x;
      let predZ = serverMe.z;

      // Only move locally if player is alive and not crafting
      if (serverMe.hp > 0 && !serverMe.isCrafting) {
        pendingInputs.forEach(input => {
          let speed = PLAYER_SPEED;
          if (serverMe.isDowned) {
            speed = 0.8;
          } else {
            if (serverMe.currentWeapon === 'sniper') {
              speed *= 0.70;
            } else if (serverMe.currentWeapon === 'hmg' && input.shooting) {
              speed *= 0.60;
            }
            
            // Block movement if reviving downed teammate
            if (remotePlayerId && remotePlayerState && latestPlayersState[remotePlayerId]?.isDowned) {
              const dist = Math.hypot(predX - remotePlayerState.targetX, predZ - remotePlayerState.targetZ);
              if (dist <= 2.0 && input.shooting) {
                speed = 0;
              }
            }
          }

          if (speed > 0 && (input.xInput !== 0 || input.zInput !== 0)) {
            const len = Math.hypot(input.xInput, input.zInput);
            const normX = input.xInput / len;
            const normZ = input.zInput / len;
            const scale = Math.min(len, 1.0);
            
            predX += normX * speed * scale * input.dt;
            predZ += normZ * speed * scale * input.dt;

            const margin = 0.5;
            predX = Math.max(-ARENA_WIDTH / 2 + margin, Math.min(ARENA_WIDTH / 2 - margin, predX));
            predZ = Math.max(-ARENA_DEPTH / 2 + margin, Math.min(ARENA_DEPTH / 2 - margin, predZ));
          }
        });
      }

      const errorX = predX - localPlayerState.x;
      const errorZ = predZ - localPlayerState.z;
      const errorDist = Math.hypot(errorX, errorZ);

      if (errorDist > 0.8) {
        // Hard snap if deviation is huge (e.g. hit a crate/wall on server)
        localPlayerState.x = predX;
        localPlayerState.z = predZ;
      } else {
        // Gently drift towards server prediction to prevent long-term desync, but avoid micro-snaps
        localPlayerState.x += errorX * 0.1;
        localPlayerState.z += errorZ * 0.1;
      }
    }

    // 2. Process remote player position update
    for (const pId in state.players) {
      if (pId !== myPlayerId) {
        const sPlayer = state.players[pId];
        
        hudRemoteCard.classList.remove('hidden');
        document.getElementById('remote-weapon-info-row').classList.remove('hidden');
        document.getElementById('remote-inventory-row').classList.remove('hidden');
        const displayHp = Math.round(Math.max(0, sPlayer.hp));
        hudRemoteHpFill.style.width = `${(displayHp / sPlayer.maxHp) * 100}%`;
        hudRemoteHpText.textContent = `${displayHp}/${sPlayer.maxHp}`;
        
        if (sPlayer.hp > 50) {
          hudRemoteHpFill.style.background = 'linear-gradient(90deg, #00ffaa, #00e5ff)';
        } else if (sPlayer.hp > 20) {
          hudRemoteHpFill.style.background = 'linear-gradient(90deg, #eab308, #facc15)';
        } else {
          hudRemoteHpFill.style.background = 'linear-gradient(90deg, #ef4444, #f87171)';
        }

        hudRemoteScrapHud.textContent = `⚙️ ${sPlayer.scrap}/60`;
        document.getElementById('hud-remote-wp-hud').textContent = `🔧 ${sPlayer.wp}/25`;
        document.getElementById('hud-remote-bp10-hud').textContent = `📜A ${sPlayer.bp10}`;
        document.getElementById('hud-remote-bp20-hud').textContent = `📜B ${sPlayer.bp20}`;
        document.getElementById('hud-remote-bp30-hud').textContent = `📜C ${sPlayer.bp30}`;

        wbRemoteScrap.textContent = `⚙️ ${sPlayer.scrap}/60`;
        document.getElementById('wb-remote-wp').textContent = `🔧 ${sPlayer.wp}/25`;
        document.getElementById('wb-remote-bp10').textContent = `📜A ${sPlayer.bp10}`;
        document.getElementById('wb-remote-bp20').textContent = `📜B ${sPlayer.bp20}`;
        document.getElementById('wb-remote-bp30').textContent = `📜C ${sPlayer.bp30}`;

        updateWeaponGauges(sPlayer, 'remote');

        if (sPlayer.isDowned && sPlayer.reviveProgress > 0) {
          revivingTeammateOverlay.classList.remove('hidden');
          revivingTeammateBarFill.style.width = `${(sPlayer.reviveProgress / 4.0) * 100}%`;
        } else {
          revivingTeammateOverlay.classList.add('hidden');
        }

        if (!remotePlayerState) {
          remotePlayerState = {
            x: sPlayer.x,
            z: sPlayer.z,
            angle: sPlayer.angle,
            targetX: sPlayer.x,
            targetZ: sPlayer.z,
            targetAngle: sPlayer.angle,
            disconnected: sPlayer.disconnected,
            isDowned: sPlayer.isDowned
          };
          hudRemoteName.textContent = sPlayer.nickname.toUpperCase();
        } else {
          remotePlayerState.targetX = sPlayer.x;
          remotePlayerState.targetZ = sPlayer.z;
          remotePlayerState.targetAngle = sPlayer.angle;
          remotePlayerState.disconnected = sPlayer.disconnected;
          remotePlayerState.isDowned = sPlayer.isDowned;
        }

        if (sPlayer.disconnected) {
          hudRemoteDisconnectTag.classList.remove('hidden');
        } else {
          hudRemoteDisconnectTag.classList.add('hidden');
        }
      }
    }

    // 3. Update general HUD scores and rounds
    hudScore.textContent = String(state.score).padStart(5, '0');
    
    if (state.roundState === 'intermission') {
      hudRound.textContent = `РАУНД ${state.round}`;
      hudRoundLabel.textContent = 'ПОДГОТОВКА';
      hudTimer.classList.remove('hidden');
      hudTimer.textContent = Math.ceil(state.roundTimer);
    } else {
      hudRound.textContent = `РАУНД ${state.round}/50`;
      hudRoundLabel.textContent = 'ВОЛНА';
      hudTimer.classList.add('hidden');
    }

    // 4. Update bullets mesh coordinates
    if (!window.bulletGeos) {
      window.bulletGeos = {
        crossbow: new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8).rotateX(Math.PI / 2),
        sniper: new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8).rotateX(Math.PI / 2),
        pistol: new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8).rotateX(Math.PI / 2),
        default: new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8).rotateX(Math.PI / 2)
      };
      window.bulletMats = {
        crossbow: new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
        sniper: new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }),
        default: new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending })
      };
    }
    
    // Fallback if user didn't restart server
    if (typeof window.bulletPrevMap === 'undefined') {
      window.bulletPrevMap = new Map();
    }
    const currentBulletIds = new Set();
    
    let bulletIndex = 0;

    state.bullets.forEach(b => {
      currentBulletIds.add(b.id);
      
      let bulletMesh;
      if (bulletIndex < bulletMeshes.length) {
        bulletMesh = bulletMeshes[bulletIndex];
        bulletMesh.visible = true;
      } else {
        bulletMesh = new THREE.Mesh(window.bulletGeos.default, window.bulletMats.default);
        scene.add(bulletMesh);
        bulletMeshes.push(bulletMesh);
      }
      bulletIndex++;

      const isCrossbow = b.type === 'crossbow';
      const isSniper = b.type === 'sniper';
      const isPistol = b.type === 'pistol';
      
      if (isCrossbow) {
        bulletMesh.geometry = window.bulletGeos.crossbow;
        bulletMesh.material = window.bulletMats.crossbow;
      } else if (isSniper) {
        bulletMesh.geometry = window.bulletGeos.sniper;
        bulletMesh.material = window.bulletMats.sniper;
      } else if (isPistol) {
        bulletMesh.geometry = window.bulletGeos.pistol;
        bulletMesh.material = window.bulletMats.default;
      } else {
        bulletMesh.geometry = window.bulletGeos.default;
        bulletMesh.material = window.bulletMats.default;
      }
      
      
      bulletMesh.position.set(b.x, 0.6, b.z);
      
      if (b.vx !== undefined && b.vz !== undefined) {
        // Precise rotation based on velocity vector
        bulletMesh.rotation.y = Math.atan2(b.vx, b.vz);
        bulletMesh.userData.vx = b.vx;
        bulletMesh.userData.vz = b.vz;
      } else {
        // Fallback calculation for old server
        const prev = window.bulletPrevMap.get(b.id);
        if (prev) {
          if (prev.lockedAngle !== undefined) {
             bulletMesh.rotation.y = prev.lockedAngle;
             bulletMesh.userData.vx = prev.vx;
             bulletMesh.userData.vz = prev.vz;
          } else {
            const dx = b.x - prev.x;
            const dz = b.z - prev.z;
            const dist = Math.hypot(dx, dz);
            if (dist > 0.05) { // Only calculate if moved enough to avoid jitter
              const angle = Math.atan2(dx, dz);
              bulletMesh.rotation.y = angle;
              const approxVx = dx / 0.05; // Assuming 50ms ticks
              const approxVz = dz / 0.05;
              bulletMesh.userData.vx = approxVx;
              bulletMesh.userData.vz = approxVz;
              window.bulletPrevMap.set(b.id, {x: b.x, z: b.z, lockedAngle: angle, vx: approxVx, vz: approxVz});
            } else {
              bulletMesh.rotation.y = prev.angle || 0;
              bulletMesh.userData.vx = 0;
              bulletMesh.userData.vz = 0;
            }
          }
        } else {
          // Guess angle based on player for the very first frame
          const owner = playersMeshes[b.ownerId];
          const guessAngle = owner ? owner.rotation.y : 0;
          window.bulletPrevMap.set(b.id, {x: b.x, z: b.z, angle: guessAngle});
          bulletMesh.rotation.y = guessAngle;
          // Approximate velocity based on angle and standard bullet speed (22 m/s)
          bulletMesh.userData.vx = Math.sin(guessAngle) * 22;
          bulletMesh.userData.vz = Math.cos(guessAngle) * 22;
        }
      }
    });
    
    // Hide unused pooled bullets
    for (let i = bulletIndex; i < bulletMeshes.length; i++) {
      bulletMeshes[i].visible = false;
    }
    
    // Clean up old bullets
    for (const id of window.bulletPrevMap.keys()) {
      if (!currentBulletIds.has(id)) {
        window.bulletPrevMap.delete(id);
      }
    }

    // 4.1 Update shooter projectiles
    if (!window.projGeoCache) {
      window.projGeoCache = new THREE.SphereGeometry(0.2, 8, 8);
      window.projMatCache = new THREE.MeshBasicMaterial({ color: 0xaa00ff }); // purple
    }
    
    let projIndex = 0;
    if (state.projectiles) {
      state.projectiles.forEach(p => {
        let projMesh;
        if (projIndex < projectileMeshes.length) {
          projMesh = projectileMeshes[projIndex];
          projMesh.visible = true;
        } else {
          projMesh = new THREE.Mesh(window.projGeoCache, window.projMatCache);
          scene.add(projMesh);
          projectileMeshes.push(projMesh);
        }
        projIndex++;
        projMesh.position.set(p.x, 0.5, p.z);
        if (p.vx !== undefined && p.vz !== undefined) {
          projMesh.userData.vx = p.vx;
          projMesh.userData.vz = p.vz;
        } else {
          projMesh.userData.vx = 0;
          projMesh.userData.vz = 0;
        }
      });
    }
    
    // Hide unused pooled projectiles
    for (let i = projIndex; i < projectileMeshes.length; i++) {
      projectileMeshes[i].visible = false;
    }

    // 4.2 Sync covers, crates, puddles, and barrels
    syncCovers(state.covers);
    syncCrates(state.crates);
    syncPuddles(state.puddles || []);
    syncFirePuddles(state.firePuddles || []);
    syncBarrels(state.barrels || {});

    // 4.3 Update combo HUD
    if (state.combo && state.combo.active && state.combo.multiplier > 1) {
      const comboWrapper = document.getElementById('hud-combo-wrapper');
      const comboText = document.getElementById('hud-combo-text');
      comboWrapper.classList.remove('hidden');
      comboText.textContent = `x${state.combo.multiplier} КОМБО`;
    } else {
      document.getElementById('hud-combo-wrapper').classList.add('hidden');
    }
  });
}

// Update the circular reload / heat gauges in HUD
function updateWeaponGauges(player, target) {
  const isLocal = target === 'local';
  const nameElement = isLocal ? hudLocalWeapon : hudRemoteWeapon;
  const fillElement = isLocal ? hudLocalWeaponGauge : hudRemoteWeaponGauge;
  
  const lastShot = isLocal ? localLastShotTime : remoteLastShotTime;

  if (player.isCrafting) {
    nameElement.textContent = 'СБОРКА...';
    const percent = Math.min(100, Math.max(0, (1.0 - player.craftTimeLeft / player.craftTotalTime) * 100));
    fillElement.style.width = `${percent}%`;
    fillElement.style.background = '#00ffc8';
    
    // Toggle circular center text overlay
    if (isLocal) {
      announcementOverlay.classList.remove('hidden');
      announcementTitle.textContent = 'СБОРКА...';
      announcementTitle.className = 'pulse-text text-blue';
      announcementSubtitle.textContent = `${Math.ceil(player.craftTimeLeft)}с`;
    }
    return;
  }

  const weaponIcons = {
    pistol: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 5px;"><path d="M4,17 L7,17 L7,12 L19,12 L19,8 L4,8 Z"/></svg>ПИСТОЛЕТ',
    shotgun: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 5px;"><path d="M2,14 L20,14 L20,10 L7,10 L7,12 L2,12 Z"/></svg>ДРОБОВИК',
    ar: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 5px;"><path d="M2,15 L6,15 L6,13 L20,13 L20,9 L10,9 L10,7 L6,7 L6,9 L2,9 Z"/></svg>АВТОМАТ',
    sniper: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 5px;"><path d="M0,13 L22,13 L22,11 L10,11 L10,9 L6,9 L6,11 L0,11 Z"/></svg>СНАЙПЕРКА',
    hmg: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 5px;"><path d="M2,15 L8,15 L8,13 L22,13 L22,7 L8,7 L8,9 L2,9 Z"/></svg>ПУЛЕМЕТ',
    flamethrower: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 5px;"><path d="M2,15 L6,15 L6,13 L18,13 L18,11 L22,11 L22,9 L18,9 L18,11 L6,11 L6,9 L2,9 Z"/></svg>ОГНЕМЕТ',
    tesla: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 5px;"><path d="M4,14 L8,14 L8,12 L16,12 L16,8 L12,8 L12,10 L4,10 Z"/></svg>ТЕСЛА',
    crossbow: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: middle; margin-right: 5px;"><path d="M2,12 L20,12 M18,8 L22,12 L18,16 M10,6 L10,18 M8,8 L12,12 L8,16" stroke="currentColor" stroke-width="2" fill="none"/></svg>АРБАЛЕТ'
  };

  if (player.currentWeapon === 'pistol') {
    nameElement.innerHTML = weaponIcons.pistol;
    fillElement.style.width = '0%';
    
    if (isLocal && announcementTitle.textContent === 'СБОРКА...') {
      announcementOverlay.classList.add('hidden');
    }
  } else if (player.currentWeapon === 'shotgun') {
    nameElement.innerHTML = weaponIcons.shotgun;
    // 1.5s (1500ms) reload LERP gauge
    const elapsed = Date.now() - lastShot;
    const progress = Math.min(1.0, elapsed / 1500);
    fillElement.style.width = `${(1.0 - progress) * 100}%`;
    fillElement.style.background = '#4a5d6e'; // Steel blue
    
    if (isLocal && announcementTitle.textContent === 'СБОРКА...') {
      announcementOverlay.classList.add('hidden');
    }
  } else if (player.currentWeapon === 'ar') {
    if (player.isOverheated) {
      nameElement.innerHTML = '<span style="color: #8b0000;">ПЕРЕГРЕВ!</span>';
      fillElement.style.width = `${player.heat}%`;
      fillElement.style.background = '#8b0000';
    } else {
      nameElement.innerHTML = weaponIcons.ar;
      fillElement.style.width = `${player.heat}%`;
      fillElement.style.background = '#d4af37'; // Gold
    }
    
    if (isLocal && announcementTitle.textContent === 'СБОРКА...') {
      announcementOverlay.classList.add('hidden');
    }
  } else if (player.currentWeapon === 'sniper') {
    nameElement.innerHTML = weaponIcons.sniper;
    const elapsed = Date.now() - lastShot;
    const progress = Math.min(1.0, elapsed / 2500);
    fillElement.style.width = `${(1.0 - progress) * 100}%`;
    fillElement.style.background = '#7b9bb5';
    
    if (isLocal && announcementTitle.textContent === 'СБОРКА...') {
      announcementOverlay.classList.add('hidden');
    }
  } else if (player.currentWeapon === 'hmg') {
    if (player.isOverheated) {
      nameElement.innerHTML = '<span style="color: #8b0000;">ПЕРЕГРЕВ!</span>';
      fillElement.style.width = `${player.heat}%`;
      fillElement.style.background = '#8b0000';
    } else {
      nameElement.innerHTML = weaponIcons.hmg;
      fillElement.style.width = `${player.heat}%`;
      fillElement.style.background = '#d4af37';
    }
    
    if (isLocal && announcementTitle.textContent === 'СБОРКА...') {
      announcementOverlay.classList.add('hidden');
    }
  } else if (player.currentWeapon === 'flamethrower') {
    nameElement.innerHTML = weaponIcons.flamethrower;
    fillElement.style.width = `${player.energy}%`;
    fillElement.style.background = '#ff5500';
    
    if (isLocal && announcementTitle.textContent === 'СБОРКА...') {
      announcementOverlay.classList.add('hidden');
    }
  } else if (player.currentWeapon === 'tesla') {
    nameElement.innerHTML = weaponIcons.tesla;
    const battPercent = Math.min(100, Math.max(0, (player.battery / 80) * 100));
    if (player.isBatteryDepleted) {
      fillElement.style.width = `${battPercent}%`;
      fillElement.style.background = '#ef4444';
    } else {
      fillElement.style.width = `${battPercent}%`;
      fillElement.style.background = '#00e5ff';
    }
    if (isLocal && announcementTitle.textContent === 'СБОРКА...') {
      announcementOverlay.classList.add('hidden');
    }
  } else if (player.currentWeapon === 'crossbow') {
    nameElement.textContent = 'АРБАЛЕТ';
    const elapsed = Date.now() - lastShot;
    const progress = Math.min(1.0, elapsed / 1200);
    fillElement.style.width = `${(1.0 - progress) * 100}%`;
    fillElement.style.background = '#a855f7';
    if (isLocal && announcementTitle.textContent === 'СБОРКА...') {
      announcementOverlay.classList.add('hidden');
    }
  }
}

// Modify quick switcher button visual layers
function updateWeaponHUDButtons(unlockedWeapons, currentWeapon) {
  // Pistol
  selectPistolBtn.className = 'weapon-btn';
  if (currentWeapon === 'pistol') selectPistolBtn.classList.add('active');
  else selectPistolBtn.classList.add('unlocked');
  selectPistolBtn.removeAttribute('disabled');

  // Shotgun
  selectShotgunBtn.className = 'weapon-btn';
  if (unlockedWeapons.includes('shotgun')) {
    selectShotgunBtn.classList.remove('locked');
    selectShotgunBtn.removeAttribute('disabled');
    if (currentWeapon === 'shotgun') selectShotgunBtn.classList.add('active');
    else selectShotgunBtn.classList.add('unlocked');
  } else {
    selectShotgunBtn.classList.add('locked');
    selectShotgunBtn.setAttribute('disabled', 'true');
  }

  // Assault Rifle
  selectArBtn.className = 'weapon-btn';
  if (unlockedWeapons.includes('ar')) {
    selectArBtn.classList.remove('locked');
    selectArBtn.removeAttribute('disabled');
    if (currentWeapon === 'ar') selectArBtn.classList.add('active');
    else selectArBtn.classList.add('unlocked');
  } else {
    selectArBtn.classList.add('locked');
    selectArBtn.setAttribute('disabled', 'true');
  }

  // Sniper
  selectSniperBtn.className = 'weapon-btn';
  if (unlockedWeapons.includes('sniper')) {
    selectSniperBtn.classList.remove('locked');
    selectSniperBtn.removeAttribute('disabled');
    if (currentWeapon === 'sniper') selectSniperBtn.classList.add('active');
    else selectSniperBtn.classList.add('unlocked');
  } else {
    selectSniperBtn.classList.add('locked');
    selectSniperBtn.setAttribute('disabled', 'true');
  }

  // HMG
  selectHmgBtn.className = 'weapon-btn';
  if (unlockedWeapons.includes('hmg')) {
    selectHmgBtn.classList.remove('locked');
    selectHmgBtn.removeAttribute('disabled');
    if (currentWeapon === 'hmg') selectHmgBtn.classList.add('active');
    else selectHmgBtn.classList.add('unlocked');
  } else {
    selectHmgBtn.classList.add('locked');
    selectHmgBtn.setAttribute('disabled', 'true');
  }

  // Flamethrower
  selectFlamethrowerBtn.className = 'weapon-btn';
  if (unlockedWeapons.includes('flamethrower')) {
    selectFlamethrowerBtn.classList.remove('locked');
    selectFlamethrowerBtn.removeAttribute('disabled');
    if (currentWeapon === 'flamethrower') selectFlamethrowerBtn.classList.add('active');
    else selectFlamethrowerBtn.classList.add('unlocked');
  } else {
    selectFlamethrowerBtn.classList.add('locked');
    selectFlamethrowerBtn.setAttribute('disabled', 'true');
  }

  // Tesla
  selectTeslaBtn.className = 'weapon-btn';
  if (unlockedWeapons.includes('tesla')) {
    selectTeslaBtn.classList.remove('locked');
    selectTeslaBtn.removeAttribute('disabled');
    if (currentWeapon === 'tesla') selectTeslaBtn.classList.add('active');
    else selectTeslaBtn.classList.add('unlocked');
  } else {
    selectTeslaBtn.classList.add('locked');
    selectTeslaBtn.setAttribute('disabled', 'true');
  }

  // Crossbow
  selectCrossbowBtn.className = 'weapon-btn';
  if (unlockedWeapons.includes('crossbow')) {
    selectCrossbowBtn.classList.remove('locked');
    selectCrossbowBtn.removeAttribute('disabled');
    if (currentWeapon === 'crossbow') selectCrossbowBtn.classList.add('active');
    else selectCrossbowBtn.classList.add('unlocked');
  } else {
    selectCrossbowBtn.classList.add('locked');
    selectCrossbowBtn.setAttribute('disabled', 'true');
  }

  // Update central workbench modal craft cards
  if (unlockedWeapons.includes('shotgun')) {
    document.getElementById('craft-shotgun-card').classList.add('already-owned');
    craftShotgunBtn.textContent = 'СОБРАНО';
    craftShotgunBtn.setAttribute('disabled', 'true');
    craftShotgunBtn.className = 'btn secondary-btn';
  } else {
    document.getElementById('craft-shotgun-card').classList.remove('already-owned');
    craftShotgunBtn.textContent = 'СОБРАТЬ (7с)';
    craftShotgunBtn.removeAttribute('disabled');
    craftShotgunBtn.className = 'btn success-btn';
  }
  
  if (unlockedWeapons.includes('ar')) {
    document.getElementById('craft-ar-card').classList.add('already-owned');
    craftArBtn.textContent = 'СОБРАНО';
    craftArBtn.setAttribute('disabled', 'true');
    craftArBtn.className = 'btn secondary-btn';
  } else {
    document.getElementById('craft-ar-card').classList.remove('already-owned');
    craftArBtn.textContent = 'СОБРАТЬ (7с)';
    craftArBtn.removeAttribute('disabled');
    craftArBtn.className = 'btn success-btn';
  }

  if (unlockedWeapons.includes('sniper')) {
    document.getElementById('craft-sniper-card').classList.add('already-owned');
    craftSniperBtn.textContent = 'СОБРАНО';
    craftSniperBtn.setAttribute('disabled', 'true');
    craftSniperBtn.className = 'btn secondary-btn';
  } else {
    document.getElementById('craft-sniper-card').classList.remove('already-owned');
    craftSniperBtn.textContent = 'СОБРАТЬ (7с)';
    craftSniperBtn.removeAttribute('disabled');
    craftSniperBtn.className = 'btn success-btn';
  }

  if (unlockedWeapons.includes('hmg')) {
    document.getElementById('craft-hmg-card').classList.add('already-owned');
    craftHmgBtn.textContent = 'СОБРАНО';
    craftHmgBtn.setAttribute('disabled', 'true');
    craftHmgBtn.className = 'btn secondary-btn';
  } else {
    document.getElementById('craft-hmg-card').classList.remove('already-owned');
    craftHmgBtn.textContent = 'СОБРАТЬ (7с)';
    craftHmgBtn.removeAttribute('disabled');
    craftHmgBtn.className = 'btn success-btn';
  }

  if (unlockedWeapons.includes('flamethrower')) {
    document.getElementById('craft-flamethrower-card').classList.add('already-owned');
    craftFlamethrowerBtn.textContent = 'СОБРАНО';
    craftFlamethrowerBtn.setAttribute('disabled', 'true');
    craftFlamethrowerBtn.className = 'btn secondary-btn';
  } else {
    document.getElementById('craft-flamethrower-card').classList.remove('already-owned');
    craftFlamethrowerBtn.textContent = 'СОБРАТЬ (7с)';
    craftFlamethrowerBtn.removeAttribute('disabled');
    craftFlamethrowerBtn.className = 'btn success-btn';
  }

  if (unlockedWeapons.includes('tesla')) {
    document.getElementById('craft-tesla-card').classList.add('already-owned');
    craftTeslaBtn.textContent = 'СОБРАНО';
    craftTeslaBtn.setAttribute('disabled', 'true');
    craftTeslaBtn.className = 'btn secondary-btn';
  } else {
    document.getElementById('craft-tesla-card').classList.remove('already-owned');
    craftTeslaBtn.textContent = 'СОБРАТЬ (7с)';
    craftTeslaBtn.removeAttribute('disabled');
    craftTeslaBtn.className = 'btn success-btn';
  }

  if (unlockedWeapons.includes('crossbow')) {
    document.getElementById('craft-crossbow-card').classList.add('already-owned');
    craftCrossbowBtn.textContent = 'СОБРАНО';
    craftCrossbowBtn.setAttribute('disabled', 'true');
    craftCrossbowBtn.className = 'btn secondary-btn';
  } else {
    document.getElementById('craft-crossbow-card').classList.remove('already-owned');
    craftCrossbowBtn.textContent = 'СОБРАТЬ (7с)';
    craftCrossbowBtn.removeAttribute('disabled');
    craftCrossbowBtn.className = 'btn success-btn';
  }

  // Lock cards dynamically if lacking resources
  const myScrap = localPlayerState.scrap;
  const myWp = localPlayerState.wp || 0;
  const myBp10 = localPlayerState.bp10 || 0;
  const myBp20 = localPlayerState.bp20 || 0;

  if (!unlockedWeapons.includes('shotgun')) {
    if (myScrap < 15) {
      craftShotgunBtn.setAttribute('disabled', 'true');
      craftShotgunBtn.textContent = 'НЕДОСТАТОЧНО ХЛАМА';
    }
  }
  if (!unlockedWeapons.includes('ar')) {
    if (myScrap < 20) {
      craftArBtn.setAttribute('disabled', 'true');
      craftArBtn.textContent = 'НЕДОСТАТОЧНО ХЛАМА';
    }
  }
  if (!unlockedWeapons.includes('sniper')) {
    if (myWp < 10 || myBp10 < 1) {
      craftSniperBtn.setAttribute('disabled', 'true');
      craftSniperBtn.textContent = 'НЕДОСТАТОЧНО WP/bp10';
    }
  }
  if (!unlockedWeapons.includes('hmg')) {
    if (myWp < 15 || myBp10 < 1) {
      craftHmgBtn.setAttribute('disabled', 'true');
      craftHmgBtn.textContent = 'НЕДОСТАТОЧНО WP/bp10';
    }
  }
  if (!unlockedWeapons.includes('flamethrower')) {
    if (myWp < 12 || myBp10 < 1 || myBp20 < 1) {
      craftFlamethrowerBtn.setAttribute('disabled', 'true');
      craftFlamethrowerBtn.textContent = 'НЕДОСТАТОЧНО WP/bp10/bp20';
    }
  }
  if (!unlockedWeapons.includes('tesla')) {
    if (myWp < 15 || myBp10 < 1 || myBp20 < 1) {
      craftTeslaBtn.setAttribute('disabled', 'true');
      craftTeslaBtn.textContent = 'НЕДОСТАТОЧНО WP/bp10/bp20';
    }
  }
  if (!unlockedWeapons.includes('crossbow')) {
    if (myWp < 10 || myBp10 < 1 || myBp20 < 1) {
      craftCrossbowBtn.setAttribute('disabled', 'true');
      craftCrossbowBtn.textContent = 'НЕДОСТАТОЧНО WP/bp10/bp20';
    }
  }
}

let reconnectInterval;
function startReconnectTimer() {
  let timeLeft = 30;
  reconnectTimer.textContent = timeLeft;
  clearInterval(reconnectInterval);
  reconnectInterval = setInterval(() => {
    timeLeft--;
    reconnectTimer.textContent = timeLeft;
    if (timeLeft <= 0) {
      clearInterval(reconnectInterval);
      alert('Время ожидания восстановления сигнала истекло.');
      sessionStorage.clear();
      location.reload();
    }
  }, 1000);
}

// ----------------------------------------------------
// LOBBY FLOW LOGIC
// ----------------------------------------------------
function showStep(stepElement) {
  const steps = document.querySelectorAll('.lobby-step');
  steps.forEach(s => s.classList.remove('active'));
  stepElement.classList.add('active');
}

function enterLobby() {
  const nickname = nicknameInput.value.trim();
  if (nickname.length < 3) {
    alert('Позывной должен быть не менее 3 символов!');
    return;
  }
  localStorage.setItem('altima_nickname', nickname);
  currentNickname.textContent = nickname.toUpperCase();
  showStep(actionStep);
}

function createRoom() {
  const nickname = nicknameInput.value.trim();
  socket.emit('create-room', { nickname });
}

function joinRoom() {
  const code = roomCodeInput.value.trim();
  const nickname = nicknameInput.value.trim();
  if (code.length !== 4) {
    alert('Код сектора должен содержать 4 символа!');
    return;
  }
  socket.emit('join-room', { roomCode: code, nickname });
}

function copyRoomCode() {
  navigator.clipboard.writeText(myRoomCode).then(() => {
    copyCodeBtn.textContent = 'СКОПИРОВАНО!';
    setTimeout(() => copyCodeBtn.textContent = 'КОПИРОВАТЬ', 1500);
  });
}

function updateWaitingRoomUI(players) {
  playerList = players;
  playersList.innerHTML = '';
  
  const ids = Object.keys(players);
  isHost = players[myPlayerId] && players[myPlayerId].isHost;

  displayRoomCode.textContent = myRoomCode;

  for (let i = 0; i < 2; i++) {
    const slotId = ids[i];
    const slotElement = document.createElement('div');
    
    if (slotId) {
      const p = players[slotId];
      slotElement.className = `player-slot ${p.isHost ? 'host' : 'guest'}`;
      slotElement.innerHTML = `
        <span>${p.nickname.toUpperCase()}</span>
        <span class="player-role-tag">${p.isHost ? 'ХОСТ' : 'ГОСТЬ'}</span>
      `;
    } else {
      slotElement.className = 'player-slot empty';
      slotElement.textContent = 'ОЖИДАНИЕ ПОДКЛЮЧЕНИЯ...';
    }
    playersList.appendChild(slotElement);
  }

  if (isHost) {
    startGameBtn.classList.remove('hidden');
    guestWaitingMsg.classList.add('hidden');
    if (ids.length >= 1) {
      startGameBtn.removeAttribute('disabled');
      startGameBtn.classList.add('pulse-glow');
    } else {
      startGameBtn.setAttribute('disabled', 'true');
      startGameBtn.classList.remove('pulse-glow');
    }
  } else {
    startGameBtn.classList.add('hidden');
    guestWaitingMsg.classList.remove('hidden');
  }
}

function leaveRoom() {
  sessionStorage.clear();
  location.reload();
}

function startGame() {
  if (isHost && Object.keys(playerList).length >= 1) {
    socket.emit('start-game');
  }
}

// ----------------------------------------------------
// INPUT LISTENING LOGIC
// ----------------------------------------------------
const keys = { w: false, a: false, s: false, d: false };

function handleKeyDown(e) {
  if (!isGameActive) return;
  const key = e.key.toLowerCase();
  
  // Movement keys
  if (key === 'w') keys.w = true;
  if (key === 'a') keys.a = true;
  if (key === 's') keys.s = true;
  if (key === 'd') keys.d = true;

  // Weapon Hotkeys (1-8)
  if (key === '1') {
    socket.emit('switch-weapon', { weaponName: 'pistol' });
  } else if (key === '2') {
    if (localPlayerState.weapons.includes('shotgun')) {
      socket.emit('switch-weapon', { weaponName: 'shotgun' });
    }
  } else if (key === '3') {
    if (localPlayerState.weapons.includes('ar')) {
      socket.emit('switch-weapon', { weaponName: 'ar' });
    }
  } else if (key === '4') {
    if (localPlayerState.weapons.includes('sniper')) {
      socket.emit('switch-weapon', { weaponName: 'sniper' });
    }
  } else if (key === '5') {
    if (localPlayerState.weapons.includes('hmg')) {
      socket.emit('switch-weapon', { weaponName: 'hmg' });
    }
  } else if (key === '6') {
    if (localPlayerState.weapons.includes('flamethrower')) {
      socket.emit('switch-weapon', { weaponName: 'flamethrower' });
    }
  } else if (key === '7') {
    if (localPlayerState.weapons.includes('tesla')) {
      socket.emit('switch-weapon', { weaponName: 'tesla' });
    }
  } else if (key === '8') {
    if (localPlayerState.weapons.includes('crossbow')) {
      socket.emit('switch-weapon', { weaponName: 'crossbow' });
    }
  }

  // Toggle central workbench interaction (E key)
  if (key === 'e') {
    // Proximity check <= 2m
    const myMesh = playersMeshes[myPlayerId];
    if (myMesh) {
      const distToCenter = Math.hypot(myMesh.position.x, myMesh.position.z);
      if (distToCenter <= 2.0) {
        workbenchModal.classList.toggle('hidden');
      }
    }
  }
}

function handleKeyUp(e) {
  if (!isGameActive) return;
  const key = e.key.toLowerCase();
  if (key === 'w') keys.w = false;
  if (key === 'a') keys.a = false;
  if (key === 's') keys.s = false;
  if (key === 'd') keys.d = false;
}

function handleMouseMove(e) {
  if (!isGameActive || isTouchDevice || !renderer) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

// PC continuous mouse aiming raycaster called in render loop
function updatePCAiming() {
  if (isTouchDevice || !scene || !camera || !renderer) return;

  const raycaster = new THREE.Raycaster();
  const mouseVector = new THREE.Vector2(mouseX, mouseY);
  raycaster.setFromCamera(mouseVector, camera);

  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const intersectPoint = new THREE.Vector3();
  
  if (raycaster.ray.intersectPlane(groundPlane, intersectPoint)) {
    const localMesh = playersMeshes[myPlayerId];
    if (localMesh) {
      const dx = intersectPoint.x - localMesh.position.x;
      const dz = intersectPoint.z - localMesh.position.z;
      targetAngle = Math.atan2(dx, dz);
    }
  }
}

// ----------------------------------------------------
// MOBILE JOYSTICKS SETUP & AUTO-AIM
// ----------------------------------------------------
function setupMobileJoysticks() {
  const leftZone = document.getElementById('joystick-left-zone');
  const rightZone = document.getElementById('joystick-right-zone');
  const leftHandle = document.getElementById('joystick-left-handle');
  const rightHandle = document.getElementById('joystick-right-handle');

  const maxDrag = 40; // pixels

  // Left joystick logic (Movement)
  leftZone.addEventListener('touchstart', (e) => {
    const touch = e.targetTouches[0];
    joystickLeft.active = true;
    joystickLeft.startX = touch.clientX;
    joystickLeft.startY = touch.clientY;
    activeTouches[touch.identifier] = 'left';
  });

  leftZone.addEventListener('touchmove', (e) => {
    if (!joystickLeft.active) return;
    
    let touch = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (activeTouches[e.touches[i].identifier] === 'left') {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch) return;

    const dx = touch.clientX - joystickLeft.startX;
    const dy = touch.clientY - joystickLeft.startY;
    const dist = Math.hypot(dx, dy);

    let angle = Math.atan2(dy, dx);
    let dragDist = Math.min(dist, maxDrag);

    const handleX = Math.cos(angle) * dragDist;
    const handleY = Math.sin(angle) * dragDist;
    leftHandle.style.transform = `translate(${handleX}px, ${handleY}px)`;

    // Outer deadzone: lock to 1.0 if pushed > 80% to prevent micro-stutters in walking speed
    let inputMagnitude = dragDist / maxDrag;
    if (inputMagnitude > 0.8) inputMagnitude = 1.0;

    joystickLeft.xInput = Math.cos(angle) * inputMagnitude;
    joystickLeft.zInput = Math.sin(angle) * inputMagnitude;
  });

  const handleLeftEnd = () => {
    joystickLeft.active = false;
    joystickLeft.xInput = 0;
    joystickLeft.zInput = 0;
    leftHandle.style.transform = 'translate(0px, 0px)';
  };
  leftZone.addEventListener('touchend', handleLeftEnd);
  leftZone.addEventListener('touchcancel', handleLeftEnd);

  // Right joystick logic (Aim & Auto-Shoot)
  rightZone.addEventListener('touchstart', (e) => {
    const touch = e.targetTouches[0];
    joystickRight.active = true;
    joystickRight.startX = touch.clientX;
    joystickRight.startY = touch.clientY;
    activeTouches[touch.identifier] = 'right';
    isShooting = true;
  });

  rightZone.addEventListener('touchmove', (e) => {
    if (!joystickRight.active) return;

    let touch = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (activeTouches[e.touches[i].identifier] === 'right') {
        touch = e.touches[i];
        break;
      }
    }
    if (!touch) return;

    const dx = touch.clientX - joystickRight.startX;
    const dy = touch.clientY - joystickRight.startY;
    const dist = Math.hypot(dx, dy);

    let angle = Math.atan2(dy, dx);
    let dragDist = Math.min(dist, maxDrag);

    const handleX = Math.cos(angle) * dragDist;
    const handleY = Math.sin(angle) * dragDist;
    rightHandle.style.transform = `translate(${handleX}px, ${handleY}px)`;

    joystickRight.angle = Math.atan2(Math.cos(angle), Math.sin(angle));
    targetAngle = joystickRight.angle;
  });

  const handleRightEnd = () => {
    joystickRight.active = false;
    isShooting = false;
    rightHandle.style.transform = 'translate(0px, 0px)';
  };
  rightZone.addEventListener('touchend', handleRightEnd);
  rightZone.addEventListener('touchcancel', handleRightEnd);
}

// Mobile Auto-Aim calculation (±15° cone lock-on)
function applyMobileAutoAim() {
  if (!isTouchDevice || !joystickRight.active) return;

  const rawAngle = joystickRight.angle;
  const coneRadius = 15 * Math.PI / 180;
  let bestTargetAngle = rawAngle;
  let closestDist = Infinity;

  for (const eId in enemiesList) {
    const enemy = enemiesList[eId];
    const dist = Math.hypot(enemy.x - localPlayerState.x, enemy.z - localPlayerState.z);
    const enemyAngle = Math.atan2(enemy.x - localPlayerState.x, enemy.z - localPlayerState.z);
    
    let angleDiff = enemyAngle - rawAngle;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

    if (Math.abs(angleDiff) <= coneRadius) {
      if (dist < closestDist) {
        closestDist = dist;
        bestTargetAngle = enemyAngle;
      }
    }
  }

  targetAngle = bestTargetAngle;
}

// ----------------------------------------------------
// THREE.JS 3D ENGINE GRAPHICS
// ----------------------------------------------------
function init3D() {
  const width = gameCanvas.clientWidth;
  const height = gameCanvas.clientHeight;

  // Reset and clear tracking objects for Stage 5 & 6
  coversMeshes = {};
  cratesMeshes = {};
  puddleMeshes = {};
  firePuddleMeshes = {};
  barrelsMeshes = {};
  warpWarningMeshes = {};
  flameParticles = [];
  activeVFX = [];

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060913);
  scene.fog = new THREE.FogExp2(0x060913, 0.015);

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 18, 12);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  gameCanvas.appendChild(renderer.domElement);

  window.addEventListener('resize', onWindowResize);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(20, 40, 20);
  dirLight.castShadow = true;
  
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  const d = 25;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  // Neon point lights
  const colors = [0x00ffc8, 0xff0055, 0x0088ff, 0xbc00ff];
  const corners = [
    [-19, 2, -14],
    [19, 2, -14],
    [-19, 2, 14],
    [19, 2, 14],
  ];

  corners.forEach((pos, idx) => {
    const light = new THREE.PointLight(colors[idx], 3, 15);
    light.position.set(pos[0], pos[1], pos[2]);
    scene.add(light);

    const lampGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const lampMat = new THREE.MeshBasicMaterial({ color: colors[idx] });
    const lampMesh = new THREE.Mesh(lampGeo, lampMat);
    lampMesh.position.set(pos[0], pos[1], pos[2]);
    scene.add(lampMesh);
  });

  // Arena floor plane
  const floorGeo = new THREE.PlaneGeometry(ARENA_WIDTH, ARENA_DEPTH);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x3d2b1f, // Realistic dirt color
    roughness: 1.0,
    metalness: 0.0,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // Scattered rocks for realism
  const rockGeo = new THREE.DodecahedronGeometry(0.2, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9, metalness: 0.1 });
  for(let i = 0; i < 40; i++) {
    const rock = new THREE.Mesh(rockGeo, rockMat);
    rock.position.set(
      (Math.random() - 0.5) * ARENA_WIDTH,
      0,
      (Math.random() - 0.5) * ARENA_DEPTH
    );
    const scale = Math.random() * 1.5 + 0.5;
    rock.scale.set(scale, scale, scale);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    rock.receiveShadow = true;
    rock.castShadow = true;
    scene.add(rock);
  }

  // Concrete walls
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1f293d, roughness: 0.9 });
  const wallHeight = 1.8;
  const wallThickness = 0.8;

  const wallSpecs = [
    { w: ARENA_WIDTH, h: wallHeight, d: wallThickness, x: 0, z: -ARENA_DEPTH / 2 - wallThickness / 2 },
    { w: ARENA_WIDTH, h: wallHeight, d: wallThickness, x: 0, z: ARENA_DEPTH / 2 + wallThickness / 2 },
    { w: wallThickness, h: wallHeight, d: ARENA_DEPTH + wallThickness * 2, x: -ARENA_WIDTH / 2 - wallThickness / 2, z: 0 },
    { w: wallThickness, h: wallHeight, d: ARENA_DEPTH + wallThickness * 2, x: ARENA_WIDTH / 2 + wallThickness / 2, z: 0 },
  ];

  wallSpecs.forEach(spec => {
    const wallGeo = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
    const wall = new THREE.Mesh(wallGeo, wallMaterial);
    wall.position.set(spec.x, wallHeight / 2, spec.z);
    wall.receiveShadow = true;
    wall.castShadow = true;
    scene.add(wall);
    environmentMeshes.push(wall);
  });

  // Center Workbench (Detailed Industrial)
  const workbenchGroup = new THREE.Group();
  
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.6 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.9, metalness: 0.2 });

  // Main block (Octagon base)
  const baseGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.8, 8);
  const baseMesh = new THREE.Mesh(baseGeo, rustMat);
  baseMesh.position.set(0, 0.4, 0);
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  workbenchGroup.add(baseMesh);

  // Table top
  const topGeo = new THREE.CylinderGeometry(1.7, 1.7, 0.1, 8);
  const topMesh = new THREE.Mesh(topGeo, metalMat);
  topMesh.position.set(0, 0.85, 0);
  topMesh.castShadow = true;
  topMesh.receiveShadow = true;
  workbenchGroup.add(topMesh);

  // Tools/Blueprints on table
  const blueprintGeo = new THREE.PlaneGeometry(1.0, 0.8);
  const blueprintMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 1.0 });
  const blueprintMesh = new THREE.Mesh(blueprintGeo, blueprintMat);
  blueprintMesh.rotation.x = -Math.PI / 2;
  blueprintMesh.rotation.z = 0.4;
  blueprintMesh.position.set(-0.5, 0.91, 0.3);
  workbenchGroup.add(blueprintMesh);

  const hammerGeo = new THREE.BoxGeometry(0.1, 0.1, 0.4);
  const hammerMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const hammerMesh = new THREE.Mesh(hammerGeo, hammerMat);
  hammerMesh.position.set(0.6, 0.95, -0.2);
  hammerMesh.rotation.y = 0.5;
  workbenchGroup.add(hammerMesh);

  scene.add(workbenchGroup);

  // Spawn players
  spawnPlayerMesh(myPlayerId, true);
  for (const id in playerList) {
    if (id !== myPlayerId) {
      spawnPlayerMesh(id, false);
    }
  }

  clock = new THREE.Clock();
  animate();
}

function spawnPlayerMesh(playerId, isLocal) {
  const isHostPlayer = playerList[playerId] ? playerList[playerId].isHost : isLocal;
  const skinColor = 0xffccaa; // Caucasian-ish skin tone for realism
  const shirtColor = isHostPlayer ? 0x2b3d4f : 0x3d4a31; // Tactical blue-grey / olive
  const pantsColor = 0x1f1f1f;
  
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.6 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.8 });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }); 

  const playerGroup = new THREE.Group();

  // Head
  const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.6;
  head.castShadow = true;
  playerGroup.add(head);

  // Torso
  const torsoGeo = new THREE.BoxGeometry(0.6, 0.7, 0.4);
  const torso = new THREE.Mesh(torsoGeo, shirtMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  playerGroup.add(torso);

  // Arms (Pivots for aiming)
  const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
  
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(0.4, 1.3, 0); // Shoulder
  const leftArm = new THREE.Mesh(armGeo, skinMat);
  leftArm.position.y = -0.25;
  leftArm.castShadow = true;
  leftArmPivot.add(leftArm);
  playerGroup.add(leftArmPivot);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(-0.4, 1.3, 0);
  const rightArm = new THREE.Mesh(armGeo, skinMat);
  rightArm.position.y = -0.25;
  rightArm.castShadow = true;
  rightArmPivot.add(rightArm);
  playerGroup.add(rightArmPivot);

  // Legs (Pivots for walking)
  const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.3);
  
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.15, 0.7, 0);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.y = -0.35;
  leftLeg.castShadow = true;
  leftLegPivot.add(leftLeg);
  playerGroup.add(leftLegPivot);

  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.15, 0.7, 0);
  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.y = -0.35;
  rightLeg.castShadow = true;
  rightLegPivot.add(rightLeg);
  playerGroup.add(rightLegPivot);

  // Weapon attached to right arm
  // Made long along Y axis so it points forward when arm rotates -90 deg on X
  const weaponGeo = new THREE.BoxGeometry(0.1, 0.7, 0.15); 
  const weaponMesh = new THREE.Mesh(weaponGeo, darkMat);
  weaponMesh.position.set(0, -0.45, 0.1); // At the hand, slightly forward
  rightArmPivot.add(weaponMesh);
  
  // Point arms down initially
  leftArmPivot.rotation.x = 0;
  rightArmPivot.rotation.x = 0;

  playerGroup.userData = {
    head: head,
    torso: torso,
    leftArm: leftArmPivot,
    rightArm: rightArmPivot,
    leftLeg: leftLegPivot,
    rightLeg: rightLegPivot,
    weapon: weaponMesh
  };

  playerGroup.position.set(isLocal ? -5 : 5, 0, 0);
  scene.add(playerGroup);
  playersMeshes[playerId] = playerGroup;
}

// Helper to spawn floating text using HTML DOM for high performance
function spawnFloatingText(text, x, y, z, colorHex = '#ff0055') {
  if (!scene || !camera || !renderer) return;
  
  const pos = new THREE.Vector3(x, y, z);
  pos.project(camera);
  
  // Don't show if behind camera
  if (pos.z > 1) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const screenX = rect.left + (pos.x * 0.5 + 0.5) * rect.width;
  const screenY = rect.top + -(pos.y * 0.5 - 0.5) * rect.height;

  const div = document.createElement('div');
  div.textContent = text;
  div.style.position = 'absolute';
  div.style.left = screenX + 'px';
  div.style.top = screenY + 'px';
  div.style.color = colorHex;
  div.style.fontWeight = '900';
  div.style.fontSize = '24px';
  div.style.fontFamily = '"Roboto", sans-serif';
  div.style.textShadow = '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000';
  div.style.pointerEvents = 'none';
  div.style.zIndex = '1000';
  div.style.transform = 'translate(-50%, -50%)';
  div.style.transition = 'top 0.8s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.8s ease-in';
  div.style.opacity = '1';
  
  document.body.appendChild(div);

  // Trigger CSS transition next frame
  requestAnimationFrame(() => {
    div.style.top = (screenY - 80) + 'px';
    div.style.opacity = '0';
  });

  setTimeout(() => {
    if(document.body.contains(div)) div.remove();
  }, 800);

}

function onWindowResize() {
  if (!scene || !camera || !renderer) return;
  const width = gameCanvas.clientWidth;
  const height = gameCanvas.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

// ----------------------------------------------------
// GAME TICK AND RENDER LOOP (60FPS)
// ----------------------------------------------------
function animate() {
  if (!scene) return;

  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);

  // 1. Inputs Check
  let xInput = 0;
  let zInput = 0;

  if (isTouchDevice) {
    xInput = joystickLeft.xInput;
    zInput = joystickLeft.zInput;
    applyMobileAutoAim();
  } else {
    if (keys.w) zInput = -1;
    if (keys.s) zInput = 1;
    if (keys.a) xInput = -1;
    if (keys.d) xInput = 1;
    updatePCAiming();
  }

  // 2. Client-Side Prediction (Local player movement)
  if (isGameActive && myPlayerId && playersMeshes[myPlayerId]) {
    const myMesh = playersMeshes[myPlayerId];
    
    const isCrafting = localPlayerState.isCrafting;
    const isDowned = localPlayerState.isDowned;
    
    if (localPlayerState.hp > 0) {
      if (isDowned) {
        isShooting = false;
      }
      
      // Calculate speed
      let speed = PLAYER_SPEED;
      if (isDowned) {
        speed = 0.8;
      } else {
        if (localPlayerState.currentWeapon === 'sniper') {
          speed *= 0.70;
        } else if (localPlayerState.currentWeapon === 'hmg' && isShooting) {
          speed *= 0.60;
        }
        
        // Block movement if reviving downed teammate
        const remotePlayerId = Object.keys(playerList).find(id => id !== myPlayerId);
        if (remotePlayerId && remotePlayerState && latestPlayersState[remotePlayerId]?.isDowned) {
          const dist = Math.hypot(localPlayerState.x - remotePlayerState.targetX, localPlayerState.z - remotePlayerState.targetZ);
          if (dist <= 2.0 && isShooting) {
            speed = 0;
          }
        }
      }
      
      if (!isCrafting && speed > 0 && (xInput !== 0 || zInput !== 0)) {
        const len = Math.hypot(xInput, zInput);
        const normX = xInput / len;
        const normZ = zInput / len;
        const scale = Math.min(len, 1.0);

        localPlayerState.x += normX * speed * scale * dt;
        localPlayerState.z += normZ * speed * scale * dt;

        const margin = 0.5;
        localPlayerState.x = Math.max(-ARENA_WIDTH / 2 + margin, Math.min(ARENA_WIDTH / 2 - margin, localPlayerState.x));
        localPlayerState.z = Math.max(-ARENA_DEPTH / 2 + margin, Math.min(ARENA_DEPTH / 2 - margin, localPlayerState.z));
      }

      localPlayerState.angle = targetAngle;
      
      // Save pending prediction frames for reconciliation
      pendingInputs.push({
        seq: inputSeq++,
        xInput: (isCrafting || speed === 0) ? 0 : xInput,
        zInput: (isCrafting || speed === 0) ? 0 : zInput,
        angle: targetAngle,
        shooting: isShooting,
        dt
      });

      socket.emit('player-input', {
        xInput: (isCrafting || speed === 0) ? 0 : xInput,
        zInput: (isCrafting || speed === 0) ? 0 : zInput,
        angle: targetAngle,
        seq: inputSeq - 1,
        shooting: isShooting
      });

      // Procedural animations (Bobbing and Recoil)
      const time = Date.now() / 1000;
      let yOffset = 0;
      let recoilOffset = 0;
      
      // Bobbing
      if (speed > 0 && (xInput !== 0 || zInput !== 0) && !isDowned) {
        yOffset = Math.sin(time * 12) * 0.15;
      }
      
      // Recoil
      const timeSinceShot = Date.now() - localLastShotTime;
      if (timeSinceShot < 150 && !isDowned) {
        recoilOffset = (1.0 - timeSinceShot/150) * 0.05; 
      }

      const drawX = localPlayerState.x - Math.sin(localPlayerState.angle) * recoilOffset;
      const drawZ = localPlayerState.z - Math.cos(localPlayerState.angle) * recoilOffset;

      // Extremely smooth interpolation to completely hide client-prediction snapping
      myMesh.position.x += (drawX - myMesh.position.x) * 0.15;
      myMesh.position.z += (drawZ - myMesh.position.z) * 0.15;
      myMesh.position.y = yOffset;
      
      myMesh.rotation.y = localPlayerState.angle;
      
      if (myMesh.userData.leftLeg) {
        let armSwing = 0;
        let targetSwing = 0;
        if (speed > 0 && (xInput !== 0 || zInput !== 0) && !isDowned) {
          targetSwing = Math.sin(time * 15) * 0.6; // Slightly faster/bigger swing
          armSwing = targetSwing * 0.5;
        }
        
        // Smooth LERP for legs, torso, head
        myMesh.userData.leftLeg.rotation.x += (targetSwing - myMesh.userData.leftLeg.rotation.x) * 0.2;
        myMesh.userData.rightLeg.rotation.x += (-targetSwing - myMesh.userData.rightLeg.rotation.x) * 0.2;
        myMesh.userData.torso.rotation.y += (targetSwing * 0.15 - myMesh.userData.torso.rotation.y) * 0.2;
        myMesh.userData.head.rotation.y += (-targetSwing * 0.1 - myMesh.userData.head.rotation.y) * 0.2;
        
        const isAiming = isShooting || (timeSinceShot < 1000);
        let targetLeftArm = -armSwing;
        let targetRightArm = armSwing;
        
        if (isAiming && !isDowned) {
          // Negative angle to point forward (+Z)
          // Recoil makes arms lift up slightly
          const armTilt = -Math.PI / 2.5 + (recoilOffset * 0.8);
          targetRightArm = armTilt;
          // Left arm can stay down or slightly forward. Let's let it swing naturally!
        }
        
        // Smooth LERP for arms
        myMesh.userData.leftArm.rotation.x += (targetLeftArm - myMesh.userData.leftArm.rotation.x) * 0.2;
        myMesh.userData.rightArm.rotation.x += (targetRightArm - myMesh.userData.rightArm.rotation.x) * 0.2;

        myMesh.rotation.z = isDowned ? Math.PI / 2 : 0;
      } else {
        let targetTilt = 0;
        if (!isDowned && xInput !== 0) {
          targetTilt = -xInput * 0.08;
        }
        myMesh.rotation.z = isDowned ? Math.PI / 2 : targetTilt;
      }
      myMesh.visible = true;

      // Update sniper laser line helper
      if (localPlayerState.currentWeapon === 'sniper' && !isDowned) {
        if (!sniperLaserLine) {
          const laserGeo = new THREE.BufferGeometry();
          laserGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
          const laserMat = new THREE.LineBasicMaterial({ color: 0xff0055, linewidth: 2, transparent: true, opacity: 0.6 });
          sniperLaserLine = new THREE.Line(laserGeo, laserMat);
          scene.add(sniperLaserLine);
        }
        const range = 30.0;
        const endX = localPlayerState.x + Math.sin(localPlayerState.angle) * range;
        const endZ = localPlayerState.z + Math.cos(localPlayerState.angle) * range;
        const positions = sniperLaserLine.geometry.attributes.position.array;
        positions[0] = localPlayerState.x;
        positions[1] = 0.5;
        positions[2] = localPlayerState.z;
        positions[3] = endX;
        positions[4] = 0.5;
        positions[5] = endZ;
        sniperLaserLine.geometry.attributes.position.needsUpdate = true;
        sniperLaserLine.visible = true;
      } else {
        if (sniperLaserLine) {
          sniperLaserLine.visible = false;
        }
      }
    } else {
      // Draw laying down dead player
      myMesh.position.set(localPlayerState.x, 0, localPlayerState.z);
      myMesh.rotation.z = Math.PI / 2;
      if (sniperLaserLine) {
        sniperLaserLine.visible = false;
      }
    }
  }

  // 3. Remote Player Interpolation & Lay Flat sync
  const remotePlayerId = Object.keys(playerList).find(id => id !== myPlayerId);
  if (remotePlayerId && remotePlayerState) {
    if (!playersMeshes[remotePlayerId]) {
      spawnPlayerMesh(remotePlayerId, false);
    }

    const remoteMesh = playersMeshes[remotePlayerId];
    
    const remoteServerState = latestPlayersState[remotePlayerId];
    if (remoteServerState) {
      if (remoteServerState.hp <= 0 || remoteServerState.isDowned) {
        remoteMesh.rotation.z = Math.PI / 2;
      } else {
        remoteMesh.rotation.z = 0;
      }
    }

    // LERP & Animations
    const baseTargetX = remotePlayerState.targetX;
    const baseTargetZ = remotePlayerState.targetZ;

    let recoilOffset = 0;
    const timeSinceShot = Date.now() - remoteLastShotTime;
    if (timeSinceShot < 150 && remoteServerState && !remoteServerState.isDowned) {
      recoilOffset = (1.0 - timeSinceShot/150) * 0.05;
    }
    
    const drawX = baseTargetX - Math.sin(remotePlayerState.targetAngle) * recoilOffset;
    const drawZ = baseTargetZ - Math.cos(remotePlayerState.targetAngle) * recoilOffset;

    const movingSpeed = Math.hypot(drawX - remoteMesh.position.x, drawZ - remoteMesh.position.z);
    remoteMesh.position.x += (drawX - remoteMesh.position.x) * 0.15;
    remoteMesh.position.z += (drawZ - remoteMesh.position.z) * 0.15;

    // Bobbing and Limbs
    const time = Date.now() / 1000;
    if (remoteMesh.userData.leftLeg) {
      let armSwing = 0;
      let targetSwing = 0;
      if (movingSpeed > 0.05 && remoteServerState && !remoteServerState.isDowned) {
        targetSwing = Math.sin(time * 15) * 0.6;
        armSwing = targetSwing * 0.5;
        remoteMesh.position.y = Math.sin(time * 15) * 0.15;
      } else {
        remoteMesh.position.y = 0;
      }
      
      // Smooth LERP for legs, torso, head
      remoteMesh.userData.leftLeg.rotation.x += (targetSwing - remoteMesh.userData.leftLeg.rotation.x) * 0.2;
      remoteMesh.userData.rightLeg.rotation.x += (-targetSwing - remoteMesh.userData.rightLeg.rotation.x) * 0.2;
      remoteMesh.userData.torso.rotation.y += (targetSwing * 0.15 - remoteMesh.userData.torso.rotation.y) * 0.2;
      remoteMesh.userData.head.rotation.y += (-targetSwing * 0.1 - remoteMesh.userData.head.rotation.y) * 0.2;
      
      const isAiming = timeSinceShot < 1000;
      let targetLeftArm = -armSwing;
      let targetRightArm = armSwing;
      
      if (isAiming && remoteServerState && !remoteServerState.isDowned) {
        const armTilt = -Math.PI / 2.5 + (recoilOffset * 0.8);
        targetRightArm = armTilt;
      }
      
      // Smooth LERP for arms
      remoteMesh.userData.leftArm.rotation.x += (targetLeftArm - remoteMesh.userData.leftArm.rotation.x) * 0.2;
      remoteMesh.userData.rightArm.rotation.x += (targetRightArm - remoteMesh.userData.rightArm.rotation.x) * 0.2;
      
    } else {
      if (movingSpeed > 0.05 && remoteServerState && !remoteServerState.isDowned) {
        remoteMesh.position.y = Math.sin(time * 12) * 0.15;
      } else {
        remoteMesh.position.y = 0;
      }
    }

    let angleDiff = remotePlayerState.targetAngle - remoteMesh.rotation.y;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    remoteMesh.rotation.y += angleDiff * 0.15;
  }

  // 4. Sync dynamic models
  syncEnemiesRender();
  syncScrapRender();
  syncBarrels(barrelsList);

  // Combo decay
  if (comboDecayTimer > 0) {
    comboDecayTimer -= dt;
    if (comboDecayTimer <= 0) {
      document.getElementById('hud-combo-wrapper').classList.add('hidden');
    }
  }

  // 5. Adjust Camera, Hint & Screen shakes
  adjustCamera();
  checkWorkbenchProximity();

  if (cameraShakeAmount > 0.01) {
    camera.position.x += (Math.random() - 0.5) * cameraShakeAmount;
    camera.position.z += (Math.random() - 0.5) * cameraShakeAmount;
    cameraShakeAmount *= 0.85;
  }

  // Update active VFX
  const nowVfx = Date.now();
  activeVFX = activeVFX.filter(vfx => {
    const timeLeft = vfx.endTime - nowVfx;
    if (timeLeft <= 0) {
      scene.remove(vfx.mesh);
      if (vfx.mesh.geometry) vfx.mesh.geometry.dispose();
      if (vfx.mesh.material) vfx.mesh.material.dispose();
      return false;
    }
    
    const progress = (vfx.duration - timeLeft) / vfx.duration;
    if (vfx.type === 'tesla') {
      vfx.mesh.material.opacity = 1.0 - progress;
    } else if (vfx.type === 'explosion') {
      const radius = 0.1 + (vfx.targetRadius - 0.1) * progress;
      vfx.mesh.scale.set(radius * 10, radius * 10, radius * 10);
      vfx.mesh.material.opacity = 0.8 * (1.0 - progress);
    } else if (vfx.type === 'spark') {
      vfx.mesh.position.y += vfx.vy * dt;
      vfx.mesh.position.x += vfx.vx * dt;
      vfx.mesh.position.z += vfx.vz * dt;
      vfx.mesh.material.opacity = 1.0 - progress;
    }
    return true;
  });

  // Update flame particles
  const nowFlame = Date.now();
  flameParticles = flameParticles.filter(p => {
    const timeLeft = p.endTime - nowFlame;
    if (timeLeft <= 0) {
      scene.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
      return false;
    }
    const progress = (p.duration - timeLeft) / p.duration;
    
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.position.y += p.vy * dt;
    
    const size = 1.0 + progress * 2.0;
    p.mesh.scale.set(size, size, size);
    p.mesh.material.opacity = 0.8 * (1.0 - progress);
    return true;
  });

  // Update blood particles
  const nowBlood = Date.now();
  bloodParticles = bloodParticles.filter(p => {
    const timeLeft = p.endTime - nowBlood;
    if (timeLeft <= 0) {
      scene.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
      return false;
    }
    
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 12.0 * dt; // Gravity
    p.mesh.position.y += p.vy * dt;
    
    // Floor collision
    if (p.mesh.position.y <= 0.05) {
      p.mesh.position.y = 0.05;
      p.vx = 0;
      p.vz = 0;
      p.vy = 0;
      // Fade out slowly on floor
      p.mesh.material.transparent = true;
      p.mesh.material.opacity = Math.max(0, timeLeft / 300);
    }
    return true;
  });

  // Update gib particles
  const nowGib = Date.now();
  gibParticles = gibParticles.filter(p => {
    const timeLeft = p.endTime - nowGib;
    if (timeLeft <= 0) {
      scene.remove(p.mesh);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.mesh.material) p.mesh.material.dispose();
      return false;
    }
    
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.z += p.vz * dt;
    p.vy -= 15.0 * dt; // Gravity
    p.mesh.position.y += p.vy * dt;
    
    if (p.mesh.position.y <= 0.1) {
      p.mesh.position.y = 0.1;
      p.vx *= 0.5; // Friction
      p.vz *= 0.5;
      p.vy = 0;
      if (timeLeft < 1000) {
        p.mesh.material.transparent = true;
        p.mesh.material.opacity = Math.max(0, timeLeft / 1000);
      }
    }
    return true;
  });

  // 5.1 Bullet and Projectile Interpolation (Client-Side Prediction)
  for (let i = 0; i < bulletMeshes.length; i++) {
    const bMesh = bulletMeshes[i];
    if (bMesh.visible && bMesh.userData.vx !== undefined) {
      bMesh.position.x += bMesh.userData.vx * dt;
      bMesh.position.z += bMesh.userData.vz * dt;
    }
  }
  for (let i = 0; i < projectileMeshes.length; i++) {
    const pMesh = projectileMeshes[i];
    if (pMesh.visible && pMesh.userData.vx !== undefined) {
      pMesh.position.x += pMesh.userData.vx * dt;
      pMesh.position.z += pMesh.userData.vz * dt;
    }
  }

  // 6. Render
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// Proximity context actions (E key alerts)
function checkWorkbenchProximity() {
  if (!isGameActive) return;

  const localMesh = playersMeshes[myPlayerId];
  if (localMesh) {
    const distToCenter = Math.hypot(localMesh.position.x, localMesh.position.z);
    
    // Within 2m of central workbench
    if (distToCenter <= 2.0) {
      workbenchHudHint.classList.remove('hidden');
    } else {
      workbenchHudHint.classList.add('hidden');
      workbenchModal.classList.add('hidden'); // Close modal if player runs away
    }
  }
}

// Sync Three.js enemy models
function syncEnemiesRender() {
  if (!scene) return;

  for (const eId in enemiesList) {
    const sEnemy = enemiesList[eId];
    
    if (!enemiesMeshes[eId]) {
      let mesh = new THREE.Group();
      mesh.userData = {
        type: sEnemy.type,
        isGroup: true,
        baseColor: 0xff3333,
        baseEmissive: 0x330000,
        yHeight: 0.4
      };

      if (sEnemy.type === 'shieldbearer') {
        const bodyGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.6, metalness: 0.2, emissive: 0x222222 });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.4;
        bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
        bodyMesh.userData.isBody = true;
        mesh.add(bodyMesh);
        
        const shieldGeo = new THREE.BoxGeometry(1.3, 0.85, 0.12);
        const shieldMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.3, metalness: 0.9, emissive: 0x111111 });
        const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        shieldMesh.position.set(0, 0.425, 0.45);
        shieldMesh.name = 'shield';
        shieldMesh.castShadow = true; shieldMesh.receiveShadow = true;
        mesh.add(shieldMesh);
        
        mesh.userData.baseColor = 0x777777;
        mesh.userData.baseEmissive = 0x222222;
        mesh.userData.yHeight = 0;
      } 
      else if (sEnemy.type === 'spider') {
        mesh.userData.baseColor = 0x333333;
        mesh.userData.baseEmissive = 0x111111;
        mesh.userData.yHeight = 0.2;
        
        const bodyGeo = new THREE.BoxGeometry(0.4, 0.3, 0.4);
        const mat = new THREE.MeshStandardMaterial({ color: 0x333333, emissive: 0x111111 });
        const bodyMesh = new THREE.Mesh(bodyGeo, mat);
        bodyMesh.position.y = 0.2;
        bodyMesh.castShadow = true;
        bodyMesh.userData.isBody = true;
        mesh.add(bodyMesh);
        
        for(let i=0; i<4; i++) {
          const legGeo = new THREE.BoxGeometry(0.1, 0.4, 0.1);
          // pivot at top
          legGeo.translate(0, -0.2, 0);
          const legMesh = new THREE.Mesh(legGeo, mat);
          legMesh.position.set((i%2===0?-0.2:0.2), 0.3, (i<2?-0.15:0.15));
          legMesh.name = 'leg' + i;
          mesh.add(legMesh);
        }
      }
      else if (sEnemy.type === 'kamikaze') {
        mesh.userData.baseColor = 0xffea00;
        mesh.userData.baseEmissive = 0x551100;
        mesh.userData.yHeight = 0.35;
        
        const bodyGeo = new THREE.DodecahedronGeometry(0.5);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0x551100 });
        const bodyMesh = new THREE.Mesh(bodyGeo, mat);
        bodyMesh.position.y = 0.4;
        bodyMesh.castShadow = true;
        bodyMesh.name = 'pulsatingBody';
        bodyMesh.userData.isBody = true;
        mesh.add(bodyMesh);
        
        // legs
        for(let i=0; i<2; i++) {
          const legGeo = new THREE.BoxGeometry(0.15, 0.3, 0.15);
          legGeo.translate(0, -0.15, 0);
          const legMesh = new THREE.Mesh(legGeo, mat);
          legMesh.position.set(i===0?-0.2:0.2, 0.3, 0);
          legMesh.name = 'leg' + i;
          mesh.add(legMesh);
        }
      }
      else if (sEnemy.type === 'tank' || sEnemy.type === 'boss_hammer') {
        const isBoss = sEnemy.type === 'boss_hammer';
        mesh.userData.baseColor = isBoss ? 0x660000 : 0x3a3a3a;
        mesh.userData.baseEmissive = isBoss ? 0x220000 : 0x111111;
        mesh.userData.yHeight = isBoss ? 1.0 : 0.7;
        const scale = isBoss ? 1.5 : 1.0;
        
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        const mat = new THREE.MeshStandardMaterial({ color: mesh.userData.baseColor, emissive: mesh.userData.baseEmissive, roughness: 0.8 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00 });
        
        const bodyGeo = new THREE.BoxGeometry(1.4*scale, 1.2*scale, 0.8*scale);
        const bodyMesh = new THREE.Mesh(bodyGeo, mat);
        bodyMesh.position.y = 0.8*scale; // Raised up for legs
        bodyMesh.castShadow = true;
        bodyMesh.userData.isBody = true;
        mesh.add(bodyMesh);
        
        // head
        const headGeo = new THREE.BoxGeometry(0.5*scale, 0.4*scale, 0.5*scale);
        const headMesh = new THREE.Mesh(headGeo, mat);
        headMesh.position.set(0, 1.6*scale, 0.2*scale); // Forward
        headMesh.castShadow = true;
        headMesh.name = 'head';
        
        // eyes
        const eyeGeo = new THREE.BoxGeometry(0.1*scale, 0.05*scale, 0.05*scale);
        for(let i=0; i<2; i++) {
          const eye = new THREE.Mesh(eyeGeo, eyeMat);
          eye.position.set(i===0?-0.15*scale:0.15*scale, 0.05*scale, 0.26*scale);
          headMesh.add(eye);
        }
        mesh.add(headMesh);
        
        // arms
        for(let i=0; i<2; i++) {
          const armGeo = new THREE.BoxGeometry(0.4*scale, 1.0*scale, 0.4*scale);
          armGeo.translate(0, -0.5*scale, 0);
          const armMesh = new THREE.Mesh(armGeo, mat);
          armMesh.position.set(i===0?-0.9*scale:0.9*scale, 1.3*scale, 0.2*scale);
          armMesh.name = 'arm' + i;
          armMesh.castShadow = true;
          mesh.add(armMesh);
        }
        
        // legs
        for(let i=0; i<2; i++) {
          const legGeo = new THREE.BoxGeometry(0.4*scale, 0.6*scale, 0.4*scale);
          legGeo.translate(0, -0.3*scale, 0);
          const legMesh = new THREE.Mesh(legGeo, pantsMat);
          legMesh.position.set(i===0?-0.4*scale:0.4*scale, 0.6*scale, 0);
          legMesh.name = 'leg' + i;
          legMesh.castShadow = true;
          mesh.add(legMesh);
        }
      }
      else if (sEnemy.type === 'necromancer') {
        mesh.userData.baseColor = 0x005511;
        mesh.userData.baseEmissive = 0x00ff33;
        mesh.userData.yHeight = 0.6;
        
        const mat = new THREE.MeshStandardMaterial({ color: 0x005511, emissive: 0x00ff33 });
        const bodyGeo = new THREE.BoxGeometry(0.6, 1.0, 0.5);
        const bodyMesh = new THREE.Mesh(bodyGeo, mat);
        bodyMesh.position.y = 0.5;
        bodyMesh.castShadow = true;
        bodyMesh.userData.isBody = true;
        mesh.add(bodyMesh);
        
        const sackGeo = new THREE.SphereGeometry(0.5);
        const sackMat = new THREE.MeshStandardMaterial({ color: 0x4a0e4e, emissive: 0xff00ff });
        const sackMesh = new THREE.Mesh(sackGeo, sackMat);
        sackMesh.position.set(0, 0.8, -0.4);
        sackMesh.name = 'sack';
        mesh.add(sackMesh);
        
        // arms
        for(let i=0; i<2; i++) {
          const armGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
          armGeo.translate(0, -0.4, 0);
          const armMesh = new THREE.Mesh(armGeo, mat);
          armMesh.position.set(i===0?-0.4:0.4, 0.9, 0.2);
          armMesh.name = 'arm' + i;
          mesh.add(armMesh);
        }
      }
      else if (sEnemy.type === 'boss_swarm' || sEnemy.type === 'boss_drone' || sEnemy.type === 'boss_razlom' || sEnemy.type === 'boss_general') {
        let geo, color, emissive, yVal = 0, scale = 1;
        if (sEnemy.type === 'boss_swarm') { geo = new THREE.SphereGeometry(1.8, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2); color = 0x4a0e4e; emissive = 0x220022; }
        else if (sEnemy.type === 'boss_drone') { geo = new THREE.OctahedronGeometry(1.0); color = 0x00aaff; emissive = 0x002255; yVal = 3.5; }
        else if (sEnemy.type === 'boss_razlom') { geo = new THREE.OctahedronGeometry(1.4); color = 0x9900ff; emissive = 0x330066; yVal = 1.0; }
        else { geo = new THREE.BoxGeometry(2.5, 2.5, 2.5); color = 0xcc8800; emissive = 0x331100; yVal = 1.25; }
        
        const mat = new THREE.MeshStandardMaterial({ color: color, emissive: emissive, roughness: 0.5 });
        const bodyMesh = new THREE.Mesh(geo, mat);
        bodyMesh.position.y = yVal;
        bodyMesh.castShadow = true;
        bodyMesh.userData.isBody = true;
        mesh.add(bodyMesh);
        
        mesh.userData.baseColor = color;
        mesh.userData.baseEmissive = emissive;
        mesh.userData.yHeight = yVal;
      }
      else {
        // Base mutant (default, sprinter, shooter)
        let scale = sEnemy.type === 'sprinter' ? 0.7 : 1.0;
        let skinColor = sEnemy.type === 'shooter' ? 0x3b5c45 : (sEnemy.type === 'sprinter' ? 0x736c5b : 0x5a6350); // Realistic decayed skin
        let shirtColor = sEnemy.type === 'sprinter' ? 0x5c3d2e : (sEnemy.type === 'shooter' ? 0x2a3b4c : 0x454545); // Tattered, dark muddy clothes
        let pantsColor = 0x1a1a1a;
        
        mesh.userData.baseColor = shirtColor;
        mesh.userData.baseEmissive = 0x220000;
        mesh.userData.yHeight = 0.4 * scale;
        
        const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.9 });
        const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.9 });
        const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000 });
        
        // Torso
        const bodyGeo = new THREE.BoxGeometry(0.6*scale, 0.7*scale, 0.4*scale);
        const bodyMesh = new THREE.Mesh(bodyGeo, shirtMat);
        bodyMesh.position.y = 0.65*scale; // Up to make room for legs
        bodyMesh.castShadow = true;
        bodyMesh.userData.isBody = true;
        mesh.add(bodyMesh);
        
        // Head
        const headGeo = new THREE.BoxGeometry(0.35*scale, 0.35*scale, 0.35*scale);
        const headMesh = new THREE.Mesh(headGeo, skinMat);
        headMesh.position.set(0, 1.1*scale, 0.1*scale); // Forward facing
        headMesh.castShadow = true;
        headMesh.name = 'head';
        
        // Glowing eyes to show direction
        const eyeGeo = new THREE.BoxGeometry(0.1*scale, 0.05*scale, 0.05*scale);
        for(let i=0; i<2; i++) {
          const eye = new THREE.Mesh(eyeGeo, eyeMat);
          eye.position.set(i===0?-0.1*scale:0.1*scale, 0.05*scale, 0.18*scale);
          headMesh.add(eye);
        }
        mesh.add(headMesh);
        
        // Arms
        for(let i=0; i<2; i++) {
          const armGeo = new THREE.BoxGeometry(0.15*scale, 0.6*scale, 0.15*scale);
          armGeo.translate(0, -0.3*scale, 0);
          const armMesh = new THREE.Mesh(armGeo, skinMat);
          armMesh.position.set(i===0?-0.4*scale:0.4*scale, 0.95*scale, 0);
          armMesh.rotation.x = -Math.PI / 2; // arms strictly forward zombie style
          armMesh.name = 'arm' + i;
          armMesh.castShadow = true;
          mesh.add(armMesh);
        }
        
        // Legs
        for(let i=0; i<2; i++) {
          const legGeo = new THREE.BoxGeometry(0.2*scale, 0.6*scale, 0.2*scale);
          legGeo.translate(0, -0.3*scale, 0);
          const legMesh = new THREE.Mesh(legGeo, pantsMat);
          legMesh.position.set(i===0?-0.15*scale:0.15*scale, 0.4*scale, 0);
          legMesh.name = 'leg' + i;
          legMesh.castShadow = true;
          mesh.add(legMesh);
        }
      }

      mesh.position.set(sEnemy.x, 0, sEnemy.z);
      scene.add(mesh);
      enemiesMeshes[eId] = mesh;
    }

    const mesh = enemiesMeshes[eId];
    if (mesh && !mesh.userData.isDying) {
      const dx = sEnemy.x - mesh.position.x;
      const dz = sEnemy.z - mesh.position.z;
      const speed = Math.hypot(dx, dz);
      
      mesh.position.x += dx * 0.18;
      mesh.position.z += dz * 0.18;
      
      let targetY = mesh.userData.yHeight || 0.4;
      if (sEnemy.type === 'boss_drone') {
        targetY = sEnemy.isLanded ? 0.6 : 3.5;
      }
      
      // Bobbing for non-floating enemies
      if (speed > 0.02 && targetY < 1.0) {
        targetY += Math.sin(Date.now() / 1000 * 15) * 0.1;
      }
      mesh.position.y += (targetY - mesh.position.y) * 0.1;

      let diff = sEnemy.angle - mesh.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      mesh.rotation.y += diff * 0.18;

      // Procedural animation and states for Group meshes
      const shield = mesh.getObjectByName('shield');
      if (shield) shield.visible = sEnemy.shieldHp > 0;
      
      const time = Date.now() / 1000;
      if (speed > 0.02) {
        const body = mesh.children.find(c => c.userData.isBody);
        if (body && sEnemy.type !== 'kamikaze' && sEnemy.type !== 'spider' && !sEnemy.type.startsWith('boss_')) {
          body.rotation.x = Math.PI / 12; // lean forward
        }
        
        const arm0 = mesh.getObjectByName('arm0');
        const arm1 = mesh.getObjectByName('arm1');
        if (arm0) arm0.rotation.x = Math.sin(time * 15) * 0.5 + (sEnemy.type === 'tank' || sEnemy.type === 'boss_hammer' || sEnemy.type === 'necromancer' ? 0 : -Math.PI / 2);
        if (arm1) arm1.rotation.x = -Math.sin(time * 15) * 0.5 + (sEnemy.type === 'tank' || sEnemy.type === 'boss_hammer' || sEnemy.type === 'necromancer' ? 0 : -Math.PI / 2);
        
        const leg0 = mesh.getObjectByName('leg0');
        const leg1 = mesh.getObjectByName('leg1');
        const leg2 = mesh.getObjectByName('leg2');
        const leg3 = mesh.getObjectByName('leg3');
        if (leg0) leg0.rotation.x = Math.sin(time * 20) * 0.5;
        if (leg1) leg1.rotation.x = -Math.sin(time * 20) * 0.5;
        if (leg2) leg2.rotation.x = Math.sin(time * 20 + Math.PI) * 0.5;
        if (leg3) leg3.rotation.x = -Math.sin(time * 20 + Math.PI) * 0.5;
      } else {
         const body = mesh.children.find(c => c.userData.isBody);
         if (body) body.rotation.x = 0;
         for(let i=0; i<4; i++) {
            const arm = mesh.getObjectByName('arm'+i);
            if (arm) arm.rotation.x = (sEnemy.type === 'tank' || sEnemy.type === 'boss_hammer' || sEnemy.type === 'necromancer') ? 0 : -Math.PI / 2;
            const leg = mesh.getObjectByName('leg'+i);
            if (leg) leg.rotation.x = 0;
         }
      }

      const pulsatingBody = mesh.getObjectByName('pulsatingBody');
      if (pulsatingBody) {
         const distToPlayer = Math.hypot(localPlayerState.x - sEnemy.x, localPlayerState.z - sEnemy.z);
         const pulseSpeed = Math.max(5, 30 - distToPlayer * 2);
         const scale = 1.0 + Math.sin(time * pulseSpeed) * 0.15;
         pulsatingBody.scale.set(scale, scale, scale);
      }

      // Group-level scaling/rotation based on type and states
      let overrideColor = null;
      let overrideEmissive = null;
      let overrideOpacity = 1.0;

      if (sEnemy.type === 'boss_hammer' && sEnemy.isEnraged) {
        mesh.scale.set(1.2, 1.2, 1.2);
        overrideColor = 0xff0000;
        overrideEmissive = 0xff0000;
      } else if (sEnemy.type === 'kamikaze' && mesh.userData.isFuseActive) {
        const timeFactor = Date.now() * 0.02;
        const pulse = 1.0 + Math.sin(timeFactor) * 0.15;
        mesh.scale.set(pulse, pulse, pulse);
        const flashColor = Math.floor(timeFactor) % 2 === 0 ? 0xff0000 : 0xffea00;
        overrideColor = flashColor;
        overrideEmissive = flashColor;
      } else if (sEnemy.type === 'boss_swarm' && sEnemy.isBellyOpen) {
        const pulse = 1.0 + Math.sin(Date.now() * 0.015) * 0.08;
        mesh.scale.set(pulse, pulse, pulse);
        overrideColor = 0xff3300;
        overrideEmissive = 0xff3300;
      } else if (sEnemy.type === 'boss_drone' && sEnemy.isLanded) {
        mesh.scale.set(1.0, 1.0, 1.0);
        overrideColor = 0xffea00;
        overrideEmissive = 0x554400;
      } else if (sEnemy.type === 'boss_general') {
        const phase = sEnemy.phase || 1;
        if (phase === 1) {
          const pulseG = sEnemy.isEnraged ? (1.3 + Math.sin(Date.now() * 0.025) * 0.1) : 1.0;
          mesh.scale.set(pulseG, pulseG, pulseG);
          overrideColor = sEnemy.isEnraged ? 0xff3300 : 0xcc8800;
          overrideEmissive = sEnemy.isEnraged ? 0x441100 : 0x331100;
        } else if (phase === 2) {
          const pulseB = 1.0 + Math.sin(Date.now() * 0.015) * 0.08;
          mesh.scale.set(pulseB, pulseB, pulseB);
          overrideColor = 0x0088ff;
          overrideEmissive = 0x002244;
        } else {
          const pulseP = 1.2 + Math.sin(Date.now() * 0.035) * 0.15;
          mesh.scale.set(pulseP, pulseP, pulseP);
          overrideColor = 0xff00ff;
          overrideEmissive = 0x440044;
        }
      } else if (sEnemy.type === 'boss_razlom') {
        mesh.rotation.y += 0.04; // Base group rotation over time
        if (sEnemy.isWarping) {
          const t = Date.now() * 0.03;
          overrideColor = Math.sin(t) > 0 ? 0xffffff : 0x9900ff;
          overrideEmissive = 0x440066;
          overrideOpacity = 0.5 + Math.abs(Math.sin(t)) * 0.5;
        } else {
          overrideColor = 0x9900ff;
          overrideEmissive = 0x330066;
        }
      } else {
        mesh.scale.set(1.0, 1.0, 1.0);
      }

      mesh.children.forEach(child => {
        if (child.material) {
          if (mesh.userData.flashEndTime && Date.now() < mesh.userData.flashEndTime) {
            child.material.color.setHex(0xff5555); // Red/flesh flash instead of white to prevent blue tint
            child.material.emissive.setHex(0xff5555);
          } else {
            let col = overrideColor !== null ? overrideColor : mesh.userData.baseColor;
            let emi = overrideEmissive !== null ? overrideEmissive : mesh.userData.baseEmissive;
            if (child.name === 'shield') {
              col = 0xaaaaaa;
              emi = 0x111111;
            }
            child.material.color.setHex(col);
            child.material.emissive.setHex(emi);
            child.material.opacity = overrideOpacity;
            child.material.transparent = overrideOpacity < 1.0;
          }
        }
      });
    }
  }

  // Handle dead enemies fade-out
  for (const eId in enemiesMeshes) {
    if (!enemiesList[eId]) {
      const mesh = enemiesMeshes[eId];
      if (!mesh.userData.isDying) {
        mesh.userData.isDying = true;
        mesh.userData.deathTime = Date.now();
        if (mesh.userData.isGroup) {
          mesh.children.forEach(child => {
            if (child.material) child.material.transparent = true;
          });
        } else {
          mesh.material.transparent = true;
        }
      }
      
      const elapsed = Date.now() - mesh.userData.deathTime;
      const progress = elapsed / 1000;
      
      // Sink into ground
      mesh.position.y -= progress * 0.05;

      if (progress >= 1.0) {
        scene.remove(mesh);
        if (mesh.userData.isGroup) {
          mesh.children.forEach(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          });
        } else {
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) mesh.material.dispose();
        }
        delete enemiesMeshes[eId];
      } else {
        if (mesh.userData.isGroup) {
          mesh.children.forEach(child => {
            if (child.material) child.material.opacity = 1.0 - progress;
          });
        } else {
          mesh.material.opacity = 1.0 - progress;
        }
        const yVal = mesh.userData.yHeight || 0.4;
        mesh.position.y = yVal - progress * (yVal + 0.1);
      }
    }
  }
}

// Sync Three.js scrap models on ground plane
function syncScrapRender() {
  if (!scene) return;

  for (const sId in scrapList) {
    const sScrap = scrapList[sId];
    
    if (!window.scrapCache) {
      window.scrapCache = {
        wpGeo: new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8),
        wpMat: new THREE.MeshStandardMaterial({ color: 0xff7700, roughness: 0.3, metalness: 0.9, emissive: 0x331100 }),
        bpGeo: new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8),
        bpMat: new THREE.MeshStandardMaterial({ color: 0x00ffff, roughness: 0.5, metalness: 0.2, emissive: 0x003333 }),
        scrapGeo: new THREE.BoxGeometry(0.3, 0.3, 0.3),
        scrapMat: new THREE.MeshStandardMaterial({ color: 0x8a9ba8, roughness: 0.2, metalness: 0.8 })
      };
    }
    
    if (!scrapMeshes[sId]) {
      let geo, mat;
      if (sScrap.type === 'wp') {
        geo = window.scrapCache.wpGeo;
        mat = window.scrapCache.wpMat;
      } else if (sScrap.type === 'blueprint') {
        geo = window.scrapCache.bpGeo;
        mat = window.scrapCache.bpMat;
      } else {
        geo = window.scrapCache.scrapGeo;
        mat = window.scrapCache.scrapMat;
      }
      
      const scrapMesh = new THREE.Mesh(geo, mat);
      if (sScrap.type === 'wp' || sScrap.type === 'blueprint') {
        scrapMesh.rotation.x = Math.PI / 2;
      }
      scrapMesh.position.set(sScrap.x, 0.15, sScrap.z);
      scrapMesh.castShadow = true;
      scene.add(scrapMesh);
      scrapMeshes[sId] = scrapMesh;
    }

    const mesh = scrapMeshes[sId];
    if (mesh) {
      mesh.position.x += (sScrap.x - mesh.position.x) * 0.2;
      mesh.position.z += (sScrap.z - mesh.position.z) * 0.2;

      mesh.rotation.y += 0.03;
      mesh.rotation.x += 0.01;
    }
  }

  // Remove collected/deleted scrap meshes
  for (const sId in scrapMeshes) {
    if (!scrapList[sId]) {
      const mesh = scrapMeshes[sId];
      scene.remove(mesh);
      delete scrapMeshes[sId];
    }
  }
}

// Centering & Zoom calculations
function adjustCamera() {
  if (!scene || !camera) return;

  const localMesh = playersMeshes[myPlayerId];
  const remotePlayerId = Object.keys(playerList).find(id => id !== myPlayerId);
  const remoteMesh = playersMeshes[remotePlayerId];

  let midX = 0;
  let midZ = 0;
  let dist = 0;

  const showRemote = localMesh && remoteMesh && remotePlayerState && !remotePlayerState.disconnected;

  if (showRemote) {
    midX = (localMesh.position.x + remoteMesh.position.x) / 2;
    midZ = (localMesh.position.z + remoteMesh.position.z) / 2;
    dist = Math.hypot(localMesh.position.x - remoteMesh.position.x, localMesh.position.z - remoteMesh.position.z);
  } else if (localMesh) {
    midX = localMesh.position.x;
    midZ = localMesh.position.z;
  }

  // Zoom factors: 12m to 24m spacing
  let zoomFactor = 1.0;
  if (dist > 12) {
    const scale = (dist - 12) / (24 - 12);
    zoomFactor = 1.0 + scale * 0.8;
    if (zoomFactor > 1.8) zoomFactor = 1.8;
  }

  // Warning text for camera split limits
  if (dist > 24) {
    announcementOverlay.classList.remove('hidden');
    announcementTitle.textContent = 'ВЕРНИТЕСЬ К НАПАРНИКУ!';
    announcementTitle.className = 'pulse-text crimson-text';
    announcementSubtitle.textContent = `Дистанция критическая: ${Math.round(dist)}м (Предел 30м)`;
  } else {
    // Prevent hiding custom announcements unless it is partner warnings
    if (announcementTitle.textContent === 'ВЕРНИТЕСЬ К НАПАРНИКУ!') {
      announcementOverlay.classList.add('hidden');
    }
  }

  let baseHeight = 16;
  let baseDepth = 11;

  if (isTouchDevice && window.innerWidth > window.innerHeight) {
    // Zoom in a bit on mobile landscape to compensate for the reduced physical screen height
    baseHeight = 13;
    baseDepth = 9;
  }

  const targetCamPos = new THREE.Vector3(
    midX,
    baseHeight * zoomFactor,
    midZ + (baseDepth * zoomFactor)
  );

  camera.position.x += (targetCamPos.x - camera.position.x) * 0.08;
  camera.position.y += (targetCamPos.y - camera.position.y) * 0.08;
  camera.position.z += (targetCamPos.z - camera.position.z) * 0.08;

  cameraLookAt.x += (midX - cameraLookAt.x) * 0.08;
  cameraLookAt.y += (0 - cameraLookAt.y) * 0.08;
  cameraLookAt.z += (midZ - cameraLookAt.z) * 0.08;

  camera.lookAt(cameraLookAt);
}

// Stage 5 Environmental syncing and custom VFX functions
function syncCovers(coversState) {
  if (!scene) return;
  coversState = coversState || {};
  
  for (const cId in coversState) {
    const c = coversState[cId];
    if (!coversMeshes[cId]) {
      const geo = new THREE.BoxGeometry(1.5, 0.8, 0.6);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x555555,
        roughness: 0.9,
        metalness: 0.1
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(c.x, 0.4, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { id: c.id };
      scene.add(mesh);
      coversMeshes[cId] = mesh;
    }
    
    const mesh = coversMeshes[cId];
    if (mesh) {
      const ratio = c.hp / c.maxHp;
      // Lerp concrete color slightly red/dark when damaged
      mesh.material.color.setRGB(
        0.33 * ratio + 0.26 * (1 - ratio),
        0.33 * ratio + 0.13 * (1 - ratio),
        0.33 * ratio + 0.13 * (1 - ratio)
      );
    }
  }
  
  for (const cId in coversMeshes) {
    if (!coversState[cId]) {
      const mesh = coversMeshes[cId];
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      delete coversMeshes[cId];
    }
  }
}

function syncCrates(cratesState) {
  if (!scene) return;
  cratesState = cratesState || {};
  
  for (const cId in cratesState) {
    const c = cratesState[cId];
    if (!cratesMeshes[cId]) {
      const group = new THREE.Group();
      
      const boxGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x8b5a2b, // wooden warm brown
        roughness: 0.8,
        metalness: 0.1
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.castShadow = true;
      boxMesh.receiveShadow = true;
      group.add(boxMesh);
      
      // Wireframe overlay to look sci-fi premium
      const frameGeo = new THREE.BoxGeometry(0.72, 0.72, 0.72);
      const frameMat = new THREE.MeshBasicMaterial({
        color: 0xffaa00,
        wireframe: true
      });
      const frameMesh = new THREE.Mesh(frameGeo, frameMat);
      group.add(frameMesh);
      
      group.position.set(c.x, 0.35, c.z);
      group.userData = { id: c.id };
      scene.add(group);
      cratesMeshes[cId] = group;
    }
    
    const group = cratesMeshes[cId];
    if (group) {
      const ratio = c.hp / c.maxHp;
      const boxMesh = group.children[0];
      if (boxMesh) {
        boxMesh.scale.set(0.2 + 0.8 * ratio, 0.2 + 0.8 * ratio, 0.2 + 0.8 * ratio);
      }
    }
  }
  
  for (const cId in cratesMeshes) {
    if (!cratesState[cId]) {
      const group = cratesMeshes[cId];
      scene.remove(group);
      group.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      delete cratesMeshes[cId];
    }
  }
}

function syncPuddles(puddlesState) {
  if (!scene) return;
  const activeIds = {};
  
  puddlesState.forEach(p => {
    activeIds[p.id] = true;
    if (!puddleMeshes[p.id]) {
      const geo = new THREE.CircleGeometry(p.radius, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x00ff33,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, 0.01, p.z);
      scene.add(mesh);
      puddleMeshes[p.id] = mesh;
    } else {
      const mesh = puddleMeshes[p.id];
      mesh.position.set(p.x, 0.01, p.z);
    }
  });
  
  for (const pId in puddleMeshes) {
    if (!activeIds[pId]) {
      const mesh = puddleMeshes[pId];
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      delete puddleMeshes[pId];
    }
  }
}

function syncFirePuddles(firePuddlesState) {
  if (!scene) return;
  const activeIds = {};
  
  firePuddlesState.forEach(p => {
    activeIds[p.id] = true;
    if (!firePuddleMeshes[p.id]) {
      const geo = new THREE.CircleGeometry(p.radius, 32);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, 0.015, p.z);
      scene.add(mesh);
      firePuddleMeshes[p.id] = mesh;
    } else {
      const mesh = firePuddleMeshes[p.id];
      mesh.position.set(p.x, 0.015, p.z);
    }
  });
  
  for (const fpId in firePuddleMeshes) {
    if (!activeIds[fpId]) {
      const mesh = firePuddleMeshes[fpId];
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) mesh.material.dispose();
      delete firePuddleMeshes[fpId];
    }
  }
}

function createLightningBolt(p1, p2) {
  if (!scene) return;
  const segments = 6;
  const points = [];
  points.push(p1.clone());
  
  const diff = new THREE.Vector3().subVectors(p2, p1);
  const length = diff.length();
  const dir = diff.clone().normalize();
  
  let perp = new THREE.Vector3(0, 1, 0);
  if (Math.abs(dir.y) > 0.9) {
    perp.set(1, 0, 0);
  }
  const side = new THREE.Vector3().crossVectors(dir, perp).normalize();
  const up = new THREE.Vector3().crossVectors(dir, side).normalize();
  
  for (let i = 1; i < segments; i++) {
    const fraction = i / segments;
    const basePt = new THREE.Vector3().addVectors(p1, diff.clone().multiplyScalar(fraction));
    
    const offsetAmp = 0.25;
    const offsetSide = (Math.random() - 0.5) * offsetAmp;
    const offsetUp = (Math.random() - 0.5) * offsetAmp;
    
    basePt.addScaledVector(side, offsetSide);
    basePt.addScaledVector(up, offsetUp);
    points.push(basePt);
  }
  points.push(p2.clone());
  
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 1.0
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  
  activeVFX.push({
    mesh: line,
    type: 'tesla',
    endTime: Date.now() + 200,
    duration: 200
  });
}

function syncBarrels(barrelsState) {
  if (!scene) return;
  barrelsState = barrelsState || {};
  
  for (const bId in barrelsState) {
    const b = barrelsState[bId];
    if (!barrelsMeshes[bId]) {
      const group = new THREE.Group();
      
      // Cylindrical red barrel body
      const cylinderGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 12);
      const cylinderMat = new THREE.MeshStandardMaterial({
        color: 0xd32f2f, // vibrant red
        roughness: 0.5,
        metalness: 0.7
      });
      const cylinderMesh = new THREE.Mesh(cylinderGeo, cylinderMat);
      cylinderMesh.castShadow = true;
      cylinderMesh.receiveShadow = true;
      cylinderMesh.position.y = 0.45;
      group.add(cylinderMesh);
      
      // Neo-yellow/orange warning rings or hazard stripe wireframe overlay
      const ringGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffa500 // warning orange glow
      });
      const ringMesh1 = new THREE.Mesh(ringGeo, ringMat);
      ringMesh1.position.y = 0.65;
      group.add(ringMesh1);
      
      const ringMesh2 = new THREE.Mesh(ringGeo, ringMat);
      ringMesh2.position.y = 0.25;
      group.add(ringMesh2);
      
      group.position.set(b.x, 0, b.z);
      group.userData = { id: b.id };
      scene.add(group);
      barrelsMeshes[bId] = group;
    }
    
    const group = barrelsMeshes[bId];
    if (group) {
      const ratio = b.hp / b.maxHp;
      const cylinderMesh = group.children[0];
      if (cylinderMesh) {
        cylinderMesh.material.color.setRGB(
          0.83 * ratio + 1.0 * (1 - ratio), // becomes brighter red
          0.18 * ratio + 0.5 * (1 - ratio), // add orange hue
          0.18 * ratio // lose cyan/green
        );
      }
    }
  }
  
  for (const bId in barrelsMeshes) {
    if (!barrelsState[bId]) {
      const group = barrelsMeshes[bId];
      scene.remove(group);
      group.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      delete barrelsMeshes[bId];
    }
  }
}
