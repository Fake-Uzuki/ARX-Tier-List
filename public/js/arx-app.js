/**
 * ARX Clan - Minecraft PvP Tier List Web Application
 * Reference: MCTiers.it Architecture & Standards
 * Logic: Multi-view rendering, live search, 3D skin inspection, sound fx, clan editor
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

  // Web Audio API Synthesizer for rich tactile feedback
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

  function getFallbackAvatar() {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 16 16"><rect width="16" height="16" fill="%232b2b36"/><rect x="4" y="4" width="8" height="8" fill="%23d4af37"/><rect x="5" y="7" width="2" height="1" fill="%230d0d12"/><rect x="9" y="7" width="2" height="1" fill="%230d0d12"/><rect x="6" y="9" width="4" height="1.5" fill="%23855a1d"/></svg>`;
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
        <span>TUTTI</span>
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
              Nessun membro corrisponde a "${searchQuery}" in questo tier.
            </div>
          `;
        } else {
          html += `
            <div style="color: var(--text-muted); font-size: 0.88rem; padding: 0.8rem;">
              Nessun player assegnato attualmente a ${tier.name}.
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
              <div class="player-head-frame">
                <img src="${getAvatarUrl(player.cleanIgn)}" alt="${player.cleanIgn}" loading="lazy" onerror="this.onerror=null; this.src='https://minotar.net/helm/${player.cleanIgn}/64';">
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

    // Attach click handlers to open modal
    container.querySelectorAll('.player-chip-card').forEach(card => {
      card.addEventListener('click', () => {
        const pid = card.getAttribute('data-player-id');
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
              <th>Membro Clan</th>
              <th>Tier</th>
              <th>Ruolo Clan</th>
              <th>Titolo MCTiers</th>
              <th>Specialità</th>
              <th style="text-align: right;">Punti PvP</th>
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
                <img src="${getAvatarUrl(player.cleanIgn)}" alt="${player.cleanIgn}" loading="lazy" onerror="this.onerror=null; this.src='https://minotar.net/helm/${player.cleanIgn}/64';">
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
            <span class="title-badge ${player.title === 'Maestro' ? 'maestro' : ''}">
              ${isRetired ? '👑 Leggenda d\'Onore' : `⚔️ ${player.title}`}
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

    container.querySelectorAll('tr.clickable').forEach(row => {
      row.addEventListener('click', () => {
        const pid = row.getAttribute('data-player-id');
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
              <img src="${getAvatarUrl(tp.cleanIgn)}" style="width: 22px; height: 22px; border-radius: 4px; image-rendering: pixelated;" onerror="this.src='https://minotar.net/helm/${tp.cleanIgn}/32';">
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
        <button class="modal-close-btn" id="modalCloseBtn" aria-label="Chiudi modal">✕</button>
        <div class="modal-grid">
          <div class="modal-skin-view">
            <div class="skin-3d-body-frame">
              <img src="${getBodyUrl(player.cleanIgn)}" alt="${player.cleanIgn} Skin" onerror="this.onerror=null; this.src='${getAvatarUrl(player.cleanIgn)}';">
              <div class="skin-pedestal"></div>
            </div>
            <div style="margin-top: 1.2rem; text-align: center;">
              <span class="clan-badge-tag">${player.clanRole || 'ARX Member'}</span>
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
              ${player.notes || 'Combatiente d\'elite della dinastia ARX con comprovata padronanza meccanica.'}
            </div>

            <div>
              <div style="font-family: var(--font-mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.5rem;">
                Prestazioni Gamemode
              </div>
              <div class="gamemode-tiers-row">
                ${gamemodesHtml}
              </div>
            </div>

            <div style="display: flex; gap: 1.5rem; background: rgba(0,0,0,0.4); padding: 0.8rem 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-rule);">
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Punti Classifica</div>
                <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1.15rem; color: var(--gold-primary);">${player.points}</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Winrate Duelli</div>
                <div style="font-family: var(--font-mono); font-weight: 800; font-size: 1.15rem; color: #34d399;">${player.winRate || '80%'}</div>
              </div>
              <div>
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">Titolo Onorario</div>
                <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main);">${player.title}</div>
              </div>
            </div>

            <div class="modal-actions">
              <button class="btn-primary" id="copyIgnBtn">
                <span>📋</span> Copia IGN
              </button>
              <a href="https://namemc.com/profile/${player.cleanIgn}" target="_blank" rel="noopener noreferrer" class="btn-secondary">
                <span>🌐</span> NameMC Profilo
              </a>
            </div>
          </div>
        </div>
      </div>
    `;

    backdrop.classList.add('open');

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
          showToast(`IGN "${player.cleanIgn}" copiato negli appunti!`);
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
      showToast('Tier List ufficiale ARX copiata in formato testo!');
    }).catch(() => {
      showToast('Copia completata!');
    });
  }

  // Add Member Prompt / Modal
  function promptAddMember() {
    const name = prompt('Inserisci il nome del giocatore (es. "ARX Shadow"):');
    if (!name || name.trim() === '') return;
    
    const cleanIgn = prompt('Inserisci il Minecraft IGN esatto per la skin (senza spazi, es. "Shadow"):') || name.replace(/\s+/g, '');
    const tier = (prompt('Seleziona il Tier (S+, S, A, B, C, D, F, Retired):') || 'B').toUpperCase();
    
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
      title: 'Nuovo Membro',
      status: isRet ? 'Retired' : 'Active',
      clanRole: 'Clan Fighter',
      specialty: 'Competitive PvP',
      winRate: '60%',
      favoriteMode: 'sword',
      modes: { sword: 'HT3', nethpot: 'LT3', diapot: 'HT3', uhc: 'LT3', smp: 'HT3', mace: 'LT3' },
      notes: 'Membro aggiunto alla graduatoria clan ARX.'
    };

    playersList.push(newPlayer);
    renderFilterPills();
    renderActiveView();
    showToast(`Giocatore "${name}" aggiunto a Tier ${chosenTier}!`);
  }

  // Reset to default roster
  function resetRoster() {
    if (confirm('Vuoi ripristinare il roster ufficiale ARX iniziale?')) {
      playersList = JSON.parse(JSON.stringify(window.ARX_TIER_CONFIG.players));
      renderFilterPills();
      renderActiveView();
      showToast('Roster ufficiale ARX ripristinato!');
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
        soundBtn.setAttribute('title', soundEnabled ? 'Audio Attivo' : 'Audio Disattivato');
        showToast(soundEnabled ? 'Effetti sonori attivati' : 'Effetti sonori mutati');
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
    resetRoster: resetRoster
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
