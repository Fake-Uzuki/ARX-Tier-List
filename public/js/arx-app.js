/**
 * ARX Clan - Minecraft PvP Tier List Web Application
 * Reference: MCTiers.it Architecture & Standards
 * Features: Multi-view rendering, live search, 3D/custom skin rendering from skin PNGs, sound fx, clan editor
 */

(function () {
  'use strict';

  // State
  let currentView = 'tierlist'; // 'tierlist' | 'leaderboard' | 'gamemodes'
  let activeFilter = 'ALL';
  let searchQuery = '';
  let soundEnabled = true;
  let activeModalPlayer = null;

  // Local copy of players that can be manipulated in the simulator/editor
  let playersList = JSON.parse(JSON.stringify(window.ARX_TIER_CONFIG.players));

  // ==========================================================================
  // MINECRAFT SKIN FORMAT CANVAS RENDERER
  // Loads standard 64x64 / 64x32 Minecraft skin PNGs and renders head & body
  // ==========================================================================
  const MinecraftSkinRenderer = {
    headCache: {},
    bodyCache: {},
    imgCache: {},

    loadSkinImage(src, callback) {
      if (this.imgCache[src]) {
        return callback(this.imgCache[src]);
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.imgCache[src] = img;
        callback(img);
      };
      img.onerror = () => {
        callback(null);
      };
      img.src = src;
    },

    // Extracts 2D head avatar (face + hat/helmet overlay) from skin PNG
    renderHead(skinSrc, targetCanvas, size = 64) {
      if (!targetCanvas) return;
      this.loadSkinImage(skinSrc, (img) => {
        if (!img) return;
        targetCanvas.width = size;
        targetCanvas.height = size;
        const ctx = targetCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, size, size);

        // Base face: sx=8, sy=8, sw=8, sh=8
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size);
        // Hat / Hair overlay: sx=40, sy=8, sw=8, sh=8
        ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size);
      });
    },

    // Renders full front Minecraft character model from skin PNG
    renderFullBody(skinSrc, targetCanvas, width = 160, height = 240) {
      if (!targetCanvas) return;
      this.loadSkinImage(skinSrc, (img) => {
        if (!img) return;
        targetCanvas.width = width;
        targetCanvas.height = height;
        const ctx = targetCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, width, height);

        // Minecraft character is 16 units wide x 32 units tall
        const u = Math.floor(Math.min(width / 16, height / 32));
        const offsetX = Math.floor((width - 16 * u) / 2);
        const offsetY = Math.floor((height - 32 * u) / 2);

        // 1. Head (base + hat)
        ctx.drawImage(img, 8, 8, 8, 8, offsetX + 4 * u, offsetY + 0, 8 * u, 8 * u);
        ctx.drawImage(img, 40, 8, 8, 8, offsetX + 4 * u, offsetY + 0, 8 * u, 8 * u);

        // 2. Torso (base + jacket)
        ctx.drawImage(img, 20, 20, 8, 12, offsetX + 4 * u, offsetY + 8 * u, 8 * u, 12 * u);
        ctx.drawImage(img, 20, 36, 8, 12, offsetX + 4 * u, offsetY + 8 * u, 8 * u, 12 * u);

        // 3. Right Arm (Viewer Left) (base + sleeve)
        ctx.drawImage(img, 44, 20, 4, 12, offsetX + 0, offsetY + 8 * u, 4 * u, 12 * u);
        ctx.drawImage(img, 44, 36, 4, 12, offsetX + 0, offsetY + 8 * u, 4 * u, 12 * u);

        // 4. Left Arm (Viewer Right) (base + sleeve)
        if (img.height >= 64) {
          ctx.drawImage(img, 36, 52, 4, 12, offsetX + 12 * u, offsetY + 8 * u, 4 * u, 12 * u);
          ctx.drawImage(img, 52, 52, 4, 12, offsetX + 12 * u, offsetY + 8 * u, 4 * u, 12 * u);
        } else {
          // Mirror right arm for legacy skins
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(img, 44, 20, 4, 12, -(offsetX + 16 * u), offsetY + 8 * u, 4 * u, 12 * u);
          ctx.restore();
        }

        // 5. Right Leg (Viewer Left) (base + pants)
        ctx.drawImage(img, 4, 20, 4, 12, offsetX + 4 * u, offsetY + 20 * u, 4 * u, 12 * u);
        ctx.drawImage(img, 4, 36, 4, 12, offsetX + 4 * u, offsetY + 20 * u, 4 * u, 12 * u);

        // 6. Left Leg (Viewer Right) (base + pants)
        if (img.height >= 64) {
          ctx.drawImage(img, 20, 52, 4, 12, offsetX + 8 * u, offsetY + 20 * u, 4 * u, 12 * u);
          ctx.drawImage(img, 4, 52, 4, 12, offsetX + 8 * u, offsetY + 20 * u, 4 * u, 12 * u);
        } else {
          // Mirror right leg for legacy skins
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(img, 4, 20, 4, 12, -(offsetX + 12 * u), offsetY + 20 * u, 4 * u, 12 * u);
          ctx.restore();
        }
      });
    }
  };

  // Web Audio API Synthesizer
  const AudioEngine = {
    ctx: null,
    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      }
    },
    playClick() {
      if (!soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
      } catch (e) {}
    },
    playRoyalChime() {
      if (!soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.06);
          gain.gain.setValueAtTime(0.06, now + i * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.35);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now + i * 0.06);
          osc.stop(now + i * 0.06 + 0.35);
        });
      } catch (e) {}
    },
    playSuccess() {
      if (!soundEnabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, this.ctx.currentTime);
        osc.frequency.setValueAtTime(880, this.ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
      } catch (e) {}
    }
  };

  // Helper: Minecraft skin & avatar URLs
  function getAvatarUrl(cleanIgn) {
    return `https://mc-heads.net/avatar/${cleanIgn}/64`;
  }

  function getBodyUrl(cleanIgn) {
    return `https://mc-heads.net/body/${cleanIgn}/240`;
  }

  // Toast notification
  function showToast(msg) {
    const toast = document.getElementById('toastNotice');
    if (!toast) return;
    toast.innerHTML = `<span>👑</span> <span>${msg}</span>`;
    toast.classList.add('show');
    AudioEngine.playSuccess();
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // Render Stats
  function renderStats() {
    const activeCount = playersList.filter(p => p.status === 'Active').length;
    const retiredCount = playersList.filter(p => p.status === 'Retired').length;
    const sTierCount = playersList.filter(p => p.tier === 'S').length;

    const activeEl = document.getElementById('statActive');
    const retiredEl = document.getElementById('statRetired');
    const sTierEl = document.getElementById('statSTier');

    if (activeEl) activeEl.textContent = activeCount;
    if (retiredEl) retiredEl.textContent = retiredCount;
    if (sTierEl) sTierEl.textContent = sTierCount;
  }

  // Filter Pills Render
  function renderFilterPills() {
    const container = document.getElementById('tierFilterPills');
    if (!container) return;

    const tiers = window.ARX_TIER_CONFIG.tiers;
    let html = `
      <button class="pill-filter-btn ${activeFilter === 'ALL' ? 'active' : ''}" data-filter="ALL">
        <span>ALL</span>
        <span class="pill-count">${playersList.length}</span>
      </button>
    `;

    tiers.forEach(tier => {
      let count = 0;
      if (tier.id === 'S_PLUS') {
        count = playersList.filter(p => p.tier === 'S+').length;
      } else if (tier.id === 'RETIRED') {
        count = playersList.filter(p => p.tier === 'RETIRED' || p.status === 'Retired').length;
      } else {
        count = playersList.filter(p => p.tier === tier.name).length;
      }

      html += `
        <button class="pill-filter-btn ${activeFilter === tier.id ? 'active' : ''}" data-filter="${tier.id}">
          <span>${tier.symbol} ${tier.name}</span>
          <span class="pill-count">${count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.pill-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        AudioEngine.playClick();
        activeFilter = btn.getAttribute('data-filter');
        renderFilterPills();
        renderActiveView();
      });
    });
  }

  // Render Classic MCTiers Tier Rows
  function renderTierlistView() {
    const container = document.getElementById('mainContentArea');
    if (!container) return;

    const tiers = window.ARX_TIER_CONFIG.tiers;
    let html = `<div class="tier-rows-wrapper">`;

    tiers.forEach(tier => {
      // Check filter
      if (activeFilter !== 'ALL' && activeFilter !== tier.id) {
        return;
      }

      // Filter players for this tier
      let tierPlayers = [];
      if (tier.id === 'S_PLUS') {
        tierPlayers = playersList.filter(p => p.tier === 'S+');
      } else if (tier.id === 'RETIRED') {
        tierPlayers = playersList.filter(p => p.tier === 'RETIRED' || p.status === 'Retired');
      } else {
        tierPlayers = playersList.filter(p => p.tier === tier.name && p.status !== 'Retired');
      }

      // Filter by search query if present
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        tierPlayers = tierPlayers.filter(p => 
          p.name.toLowerCase().includes(q) ||
          p.cleanIgn.toLowerCase().includes(q) ||
          (p.clanRole && p.clanRole.toLowerCase().includes(q)) ||
          (p.title && p.title.toLowerCase().includes(q))
        );
      }

      const isRetired = tier.id === 'RETIRED';

      html += `
        <div class="tier-row ${isRetired ? 'retired' : ''}" style="--tier-color: ${tier.color}; --tier-bg: ${tier.bgGradient}; --tier-glow: ${tier.glow};">
          <div class="tier-badge-plate">
            <span class="tier-symbol">${tier.symbol}</span>
            <span class="tier-name">${tier.name}</span>
            <span class="tier-sublabel">${tier.label}</span>
            <span class="tier-count-tag">${tierPlayers.length} ${tierPlayers.length === 1 ? 'Player' : 'Players'}</span>
          </div>
          <div class="tier-players-rack" data-tier-id="${tier.id}">
      `;

      if (tierPlayers.length === 0) {
        if (tier.id === 'S_PLUS') {
          html += `
            <div class="vacant-roster-box">
              <span class="vacant-icon">👑</span>
              <div>
                <div class="vacant-title">Vacant Throne — No Winner Yet</div>
                <div class="vacant-sub">${tier.vacantMessage}</div>
              </div>
            </div>
          `;
        } else if (searchQuery.trim() !== '') {
          html += `
            <div style="color: var(--text-muted); font-size: 0.88rem; padding: 0.8rem;">
              No clan member matches "${searchQuery}" in this tier.
            </div>
          `;
        } else {
          html += `
            <div style="color: var(--text-muted); font-size: 0.88rem; padding: 0.8rem;">
              No player currently assigned to ${tier.name}.
            </div>
          `;
        }
      } else {
        tierPlayers.forEach(player => {
          const isArxPrefixed = player.name.startsWith('ARX ');
          const displayName = isArxPrefixed ? player.name.replace('ARX ', '') : player.name;
          const plateClass = player.status === 'Retired' ? 'retired-hatch' : (player.subTier.startsWith('HT') ? 'ht' : 'lt');

          html += `
            <div class="player-chip-card" data-player-id="${player.id}" style="--player-tier-color: ${tier.color};">
              <div class="player-head-frame" data-skin-target="${player.id}">
                ${
                  player.customSkin 
                    ? `<canvas class="custom-head-canvas" width="42" height="42" style="width:100%;height:100%;image-rendering:pixelated;"></canvas>`
                    : `<img src="${getAvatarUrl(player.cleanIgn)}" alt="${player.cleanIgn}" loading="lazy" onerror="this.onerror=null; this.src='https://minotar.net/helm/${player.cleanIgn}/64';">`
                }
              </div>
              <div class="player-meta">
                <div class="player-name-row">
                  ${isArxPrefixed ? '<span class="clan-prefix">ARX</span>' : ''}
                  <span class="player-ign">${displayName}</span>
                </div>
                <div class="player-sub-row">
                  <span class="mctiers-plate ${plateClass}">
                    ${player.status === 'Retired' ? `(S) VET` : player.subTier}
                  </span>
                  <span class="player-pts">${player.points} pts</span>
                </div>
              </div>
            </div>
          `;
        });
      }

      html += `
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Render custom skins on canvases
    container.querySelectorAll('.player-chip-card').forEach(card => {
      const pid = card.getAttribute('data-player-id');
      const player = playersList.find(p => p.id === pid);
      if (player && player.customSkin) {
        const canvas = card.querySelector('.custom-head-canvas');
        if (canvas) {
          MinecraftSkinRenderer.renderHead(player.customSkin, canvas, 42);
        }
      }

      card.addEventListener('click', () => {
        openPlayerModal(pid);
      });
    });
  }

  // Render MCTiers Ranked Leaderboard Table
  function renderLeaderboardView() {
    const container = document.getElementById('mainContentArea');
    if (!container) return;

    // Sort players: Active first by points desc, then Retired by points desc
    let sorted = [...playersList].sort((a, b) => {
      if (a.status === 'Active' && b.status === 'Retired') return -1;
      if (a.status === 'Retired' && b.status === 'Active') return 1;
      return b.points - a.points;
    });

    // Search query filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      sorted = sorted.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.cleanIgn.toLowerCase().includes(q) ||
        (p.clanRole && p.clanRole.toLowerCase().includes(q))
      );
    }

    let html = `
      <div class="leaderboard-table-container">
        <table class="leaderboard-table">
          <thead>
            <tr>
              <th class="rank-col">#</th>
              <th>Clan Member</th>
              <th>Tier</th>
              <th>Clan Role</th>
              <th>Combat Title</th>
              <th>Specialty</th>
              <th style="text-align: right;">PvP Points</th>
            </tr>
          </thead>
          <tbody>
    `;

    sorted.forEach((player, idx) => {
      const tierObj = window.ARX_TIER_CONFIG.tiers.find(t => t.name === player.tier) || window.ARX_TIER_CONFIG.tiers[1];
      const isRetired = player.status === 'Retired';

      let rankDisplay = idx + 1;
      let rankPillClass = '';
      if (!isRetired) {
        if (rankDisplay === 1) rankPillClass = 'gold';
        else if (rankDisplay === 2) rankPillClass = 'silver';
        else if (rankDisplay === 3) rankPillClass = 'bronze';
      } else {
        rankDisplay = '🫡';
      }

      const plateClass = isRetired ? 'retired-hatch' : (player.subTier.startsWith('HT') ? 'ht' : 'lt');

      html += `
        <tr class="clickable" data-player-id="${player.id}">
          <td class="rank-col">
            <span class="rank-pill ${rankPillClass}">${rankDisplay}</span>
          </td>
          <td>
            <div class="player-profile-cell">
              <div class="player-head-frame">
                ${
                  player.customSkin
                    ? `<canvas class="custom-head-canvas" width="42" height="42" style="width:100%;height:100%;image-rendering:pixelated;"></canvas>`
                    : `<img src="${getAvatarUrl(player.cleanIgn)}" alt="${player.cleanIgn}" loading="lazy" onerror="this.onerror=null; this.src='https://minotar.net/helm/${player.cleanIgn}/64';">`
                }
              </div>
              <div>
                <div style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
                  ${player.name}
                </div>
                <div style="font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-muted);">
                  ${player.cleanIgn}
                </div>
              </div>
            </div>
          </td>
          <td>
            <span class="mctiers-plate ${plateClass}" style="--player-tier-color: ${tierObj.color};">
              ${isRetired ? '(S) VET' : player.subTier}
            </span>
          </td>
          <td>
            <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 600;">
              ${player.clanRole || 'Fighter'}
            </span>
          </td>
          <td>
            <span class="title-badge ${player.title === 'Grandmaster' ? 'maestro' : ''}">
              ${isRetired ? '👑 Honorary Legend' : `⚔️ ${player.title}`}
            </span>
          </td>
          <td>
            <span style="font-size: 0.82rem; color: var(--text-muted);">
              ${player.specialty || 'General PvP'}
            </span>
          </td>
          <td>
            <span class="points-num">${player.points}</span>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;

    // Render custom skins
    container.querySelectorAll('tr.clickable').forEach(row => {
      const pid = row.getAttribute('data-player-id');
      const player = playersList.find(p => p.id === pid);
      if (player && player.customSkin) {
        const canvas = row.querySelector('.custom-head-canvas');
        if (canvas) {
          MinecraftSkinRenderer.renderHead(player.customSkin, canvas, 42);
        }
      }

      row.addEventListener('click', () => {
        openPlayerModal(pid);
      });
    });
  }

  // Render Gamemodes Showcase View
  function renderGamemodesView() {
    const container = document.getElementById('mainContentArea');
    if (!container) return;

    const modes = window.ARX_TIER_CONFIG.gamemodes.filter(m => m.id !== 'all');

    let html = `<div class="modes-cards-grid">`;

    modes.forEach(mode => {
      // Find top specialists in this gamemode
      const topPlayers = [...playersList]
        .filter(p => p.modes && p.modes[mode.id])
        .sort((a, b) => {
          const rankScore = (t) => t.includes('1') ? 100 : (t.includes('2') ? 80 : (t.includes('3') ? 60 : 40));
          return rankScore(b.modes[mode.id]) - rankScore(a.modes[mode.id]);
        })
        .slice(0, 3);

      html += `
        <div class="mode-card">
          <div class="mode-header">
            <div class="mode-icon-box">${mode.icon}</div>
            <div>
              <div class="mode-name">${mode.name}</div>
              <div class="mode-desc">${mode.desc}</div>
            </div>
          </div>
          <div class="top-specialists-list">
            <div style="font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.2rem;">
              Top Fighters
            </div>
      `;

      topPlayers.forEach((tp, i) => {
        const tierBadge = tp.modes[mode.id];
        html += `
          <div class="specialist-item" onclick="window.ARX_APP.openModal('${tp.id}')" style="cursor: pointer;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-family: var(--font-mono); font-weight: 700; font-size: 0.8rem; color: var(--gold-primary);">#${i+1}</span>
              ${
                tp.customSkin
                  ? `<canvas class="mode-head-canvas" width="22" height="22" style="width:22px;height:22px;border-radius:4px;image-rendering:pixelated;"></canvas>`
                  : `<img src="${getAvatarUrl(tp.cleanIgn)}" style="width: 22px; height: 22px; border-radius: 4px; image-rendering: pixelated;" onerror="this.src='https://minotar.net/helm/${tp.cleanIgn}/32';">`
              }
              <span style="font-size: 0.88rem; font-weight: 600; color: var(--text-main);">${tp.name}</span>
            </div>
            <span class="mctiers-plate ${tierBadge.startsWith('HT') ? 'ht' : 'lt'}" style="--player-tier-color: var(--gold-primary); font-size: 0.68rem;">
              ${tierBadge}
            </span>
          </div>
        `;
      });

      html += `
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Render heads for custom skins in gamemodes view
    container.querySelectorAll('.specialist-item').forEach(item => {
      const pid = item.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
      const player = playersList.find(p => p.id === pid);
      if (player && player.customSkin) {
        const canvas = item.querySelector('.mode-head-canvas');
        if (canvas) {
          MinecraftSkinRenderer.renderHead(player.customSkin, canvas, 22);
        }
      }
    });
  }

  // Active View Dispatcher
  function renderActiveView() {
    if (currentView === 'tierlist') {
      renderTierlistView();
    } else if (currentView === 'leaderboard') {
      renderLeaderboardView();
    } else if (currentView === 'gamemodes') {
      renderGamemodesView();
    }
    renderStats();
  }

  // Player Inspection Modal
  function openPlayerModal(playerId) {
    const player = playersList.find(p => p.id === playerId);
    if (!player) return;

    activeModalPlayer = player;
    AudioEngine.playRoyalChime();

    const backdrop = document.getElementById('playerModalBackdrop');
    const container = document.getElementById('playerModalContent');
    if (!backdrop || !container) return;

    const isRetired = player.status === 'Retired';
    const tierConfig = window.ARX_TIER_CONFIG.tiers.find(t => t.name === (isRetired ? 'Retired' : player.tier)) || window.ARX_TIER_CONFIG.tiers[1];

    let gamemodesHtml = '';
    if (player.modes) {
      Object.entries(player.modes).forEach(([gmKey, gmTier]) => {
        const gmObj = window.ARX_TIER_CONFIG.gamemodes.find(m => m.id === gmKey);
        gamemodesHtml += `
          <div class="gm-item">
            <span class="gm-label">${gmObj ? gmObj.name : gmKey}</span>
            <span class="gm-tier-val">${gmTier}</span>
          </div>
        `;
      });
    }

    container.innerHTML = `
      <div class="player-modal-card">
        <button class="modal-close-btn" id="modalCloseBtn" aria-label="Close modal">✕</button>
        <div class="modal-grid">
          <div class="modal-skin-view">
            <div class="skin-3d-body-frame">
              ${
                player.customSkin
                  ? `<canvas id="modalBodyCanvas" width="160" height="240" style="max-width:100%;max-height:100%;image-rendering:pixelated;filter:drop-shadow(0 15px 25px rgba(0,0,0,0.8));"></canvas>`
                  : `<img src="${getBodyUrl(player.cleanIgn)}" alt="${player.cleanIgn} Skin" onerror="this.onerror=null; this.src='${getAvatarUrl(player.cleanIgn)}';">`
              }
              <div class="skin-pedestal"></div>
            </div>
            <div style="margin-top: 1.2rem; text-align: center; display: flex; flex-direction: column; gap: 0.4rem; align-items: center;">
              <span class="clan-badge-tag">${player.clanRole || 'ARX Member'}</span>
              ${player.customSkin ? `<span style="font-family:var(--font-mono); font-size:0.68rem; color:var(--gold-primary); background:rgba(245,197,66,0.12); padding:0.15rem 0.5rem; border-radius:4px; border:1px solid rgba(245,197,66,0.3);">Custom Skin Format</span>` : ''}
            </div>
          </div>
          <div class="modal-details">
            <div class="modal-player-header">
              <div>
                <h3 class="modal-ign">${player.name}</h3>
                <div style="font-family: var(--font-mono); font-size: 0.85rem; color: var(--text-muted); margin-top: 0.2rem;">
                  IGN: <strong style="color: var(--gold-primary);">${player.cleanIgn}</strong>
                </div>
              </div>
              <div class="modal-tier-badge" style="background: ${tierConfig.bgGradient}; border-color: ${tierConfig.color}; color: ${tierConfig.color};">
                ${isRetired ? '🫡 RETIRED (S)' : `${tierConfig.symbol} Tier ${player.tier} (${player.subTier})`}
              </div>
            </div>

            <div class="player-notes-box">
              <div style="font-weight: 700; color: var(--gold-primary); margin-bottom: 0.2rem;">MCTiers Combat Profile:</div>
              ${player.notes || 'Elite warrior of the ARX dynasty with proven mechanics and tactical prowess.'}
            </div>

            <div>
              <div style="font-family: var(--font-mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.5rem;">
                Gamemode Mastery
              </div>
              <div class="gamemode-tiers-row">
                ${gamemodesHtml}
              </div>
            </div>

            <div style="display: flex; gap: 1.5rem; background: rgba(0,0,0,0.4); padding: 0.8rem 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-rule);">
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Rank Points</div>
                <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1.15rem; color: var(--gold-primary);">${player.points}</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Duel Winrate</div>
                <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1.15rem; color: #34d399;">${player.winRate || '80%'}</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Honorary Title</div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${player.title}</div>
              </div>
            </div>

            <div class="modal-actions">
              <button class="btn-primary" id="copyIgnBtn">
                <span>📋</span> Copy IGN
              </button>
              ${
                player.customSkin
                  ? `<a href="${player.customSkin}" download="${player.cleanIgn}_skin.png" class="btn-secondary"><span>💾</span> Download Skin</a>`
                  : `<a href="https://namemc.com/profile/${player.cleanIgn}" target="_blank" rel="noopener noreferrer" class="btn-secondary"><span>🌐</span> NameMC Profile</a>`
              }
            </div>
          </div>
        </div>
      </div>
    `;

    backdrop.classList.add('open');

    // Render body canvas if custom skin
    if (player.customSkin) {
      const modalCanvas = document.getElementById('modalBodyCanvas');
      if (modalCanvas) {
        MinecraftSkinRenderer.renderFullBody(player.customSkin, modalCanvas, 160, 240);
      }
    }

    // Close listener
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closePlayerModal);
    }

    // Copy IGN listener
    const copyBtn = document.getElementById('copyIgnBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(player.cleanIgn).then(() => {
          showToast(`IGN "${player.cleanIgn}" copied to clipboard!`);
        }).catch(() => {
          showToast(`IGN: ${player.cleanIgn}`);
        });
      });
    }
  }

  function closePlayerModal() {
    const backdrop = document.getElementById('playerModalBackdrop');
    if (backdrop) backdrop.classList.remove('open');
    activeModalPlayer = null;
  }

  // Export Tierlist in Clan Format
  function exportTierlistText() {
    let text = `ARX TIERLIST 🏆\n`;
    
    // S+
    text += `S+ 👑\nNo winner yet\n\n`;

    // S
    text += `S 🔰\n`;
    playersList.filter(p => p.tier === 'S' && p.status !== 'Retired').forEach(p => {
      text += `${p.name}\n`;
    });
    text += `\n`;

    // A
    text += `A ⚜️\n`;
    playersList.filter(p => p.tier === 'A' && p.status !== 'Retired').forEach(p => {
      text += `${p.name}\n`;
    });
    text += `\n`;

    // B
    text += `B 🔱\n`;
    playersList.filter(p => p.tier === 'B' && p.status !== 'Retired').forEach(p => {
      text += `${p.name}\n`;
    });
    text += `\n`;

    // C
    text += `C 🎭\n`;
    playersList.filter(p => p.tier === 'C' && p.status !== 'Retired').forEach(p => {
      text += `${p.name}\n`;
    });
    text += `\n`;

    // D
    text += `D ☃️\n`;
    playersList.filter(p => p.tier === 'D' && p.status !== 'Retired').forEach(p => {
      text += `${p.name}\n`;
    });
    text += `\n`;

    // F
    text += `F ⛄\n`;
    playersList.filter(p => p.tier === 'F' && p.status !== 'Retired').forEach(p => {
      text += `${p.name}\n`;
    });
    text += `\n`;

    // Retired
    text += `Retired 🫡\n`;
    playersList.filter(p => p.status === 'Retired' || p.tier === 'RETIRED').forEach(p => {
      text += `${p.name} (S)\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
      showToast('Official ARX Tier List copied to clipboard!');
    }).catch(() => {
      showToast('Copied to clipboard!');
    });
  }

  // Add Member Prompt / Modal
  function promptAddMember() {
    const name = prompt('Enter player name (e.g. "ARX Shadow"):');
    if (!name || name.trim() === '') return;
    
    const cleanIgn = prompt('Enter exact Minecraft IGN for skin (e.g. "Shadow"):') || name.replace(/\s+/g, '');
    const tier = (prompt('Select Tier (S+, S, A, B, C, D, F, Retired):') || 'B').toUpperCase();
    
    const validTiers = ['S+', 'S', 'A', 'B', 'C', 'D', 'F', 'RETIRED'];
    const chosenTier = validTiers.includes(tier) ? tier : 'B';
    const isRet = chosenTier === 'RETIRED';

    const newPlayer = {
      id: 'player-' + Date.now(),
      name: name.trim(),
      cleanIgn: cleanIgn.trim(),
      tier: isRet ? 'RETIRED' : chosenTier,
      subTier: isRet ? 'HT1' : 'HT3',
      rank: playersList.length + 1,
      points: chosenTier === 'S' ? 220 : (chosenTier === 'A' ? 170 : 120),
      title: 'Recruit',
      status: isRet ? 'Retired' : 'Active',
      clanRole: 'Clan Fighter',
      specialty: 'Competitive PvP',
      winRate: '60%',
      favoriteMode: 'sword',
      modes: { sword: 'HT3', nethpot: 'LT3', diapot: 'HT3', uhc: 'LT3', smp: 'HT3', mace: 'LT3' },
      notes: 'New member inducted into ARX competitive roster.'
    };

    playersList.push(newPlayer);
    renderFilterPills();
    renderActiveView();
    showToast(`Player "${name}" added to Tier ${chosenTier}!`);
  }

  // Reset to default roster
  function resetRoster() {
    if (confirm('Do you want to reset to the official ARX roster?')) {
      playersList = JSON.parse(JSON.stringify(window.ARX_TIER_CONFIG.players));
      renderFilterPills();
      renderActiveView();
      showToast('Official ARX roster restored!');
    }
  }

  // Initialize DOM Event Listeners
  function init() {
    // Render initial views
    renderStats();
    renderFilterPills();
    renderActiveView();

    // View tab buttons
    document.querySelectorAll('.view-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        AudioEngine.playClick();
        document.querySelectorAll('.view-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.getAttribute('data-view');
        renderActiveView();
      });
    });

    // Nav links
    document.querySelectorAll('.nav-link-btn').forEach(link => {
      link.addEventListener('click', (e) => {
        const view = link.getAttribute('data-view');
        if (view) {
          e.preventDefault();
          AudioEngine.playClick();
          document.querySelectorAll('.nav-link-btn').forEach(l => l.classList.remove('active'));
          link.classList.add('active');

          const tabBtn = document.querySelector(`.view-tab-btn[data-view="${view}"]`);
          if (tabBtn) tabBtn.click();
        }
      });
    });

    // Search input
    const searchInput = document.getElementById('globalSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderActiveView();
      });
    }

    // Sound toggle button
    const soundBtn = document.getElementById('soundToggleBtn');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        soundBtn.innerHTML = soundEnabled ? '🔊' : '🔇';
        soundBtn.setAttribute('title', soundEnabled ? 'Sound Effects Enabled' : 'Sound Effects Muted');
        showToast(soundEnabled ? 'Sound effects enabled' : 'Sound effects muted');
      });
    }

    // Modal backdrop click to close
    const backdrop = document.getElementById('playerModalBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          closePlayerModal();
        }
      });
    }

    // Editor Floating Action Buttons
    const exportBtn = document.getElementById('exportTierlistBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportTierlistText);

    const addMemberBtn = document.getElementById('addMemberBtn');
    if (addMemberBtn) addMemberBtn.addEventListener('click', promptAddMember);

    const resetRosterBtn = document.getElementById('resetRosterBtn');
    if (resetRosterBtn) resetRosterBtn.addEventListener('click', resetRoster);

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        if (searchInput) searchInput.focus();
      }
      if (e.key === 'Escape') {
        closePlayerModal();
      }
    });

    // Scroll effect for header
    window.addEventListener('scroll', () => {
      const header = document.querySelector('.arx-header');
      if (header) {
        if (window.scrollY > 30) {
          header.classList.add('scrolled');
        } else {
          header.classList.remove('scrolled');
        }
      }
    });
  }

  // Expose global methods
  window.ARX_APP = {
    openModal: openPlayerModal,
    exportText: exportTierlistText,
    addMember: promptAddMember,
    resetRoster: resetRoster,
    skinRenderer: MinecraftSkinRenderer
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
