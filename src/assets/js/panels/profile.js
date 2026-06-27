'use strict';

import { database, changePanel, t } from '../utils.js';
import { getAzAuthUrl } from '../utils/config.js';
import BasePanel from '../utils/BasePanel.js';
import ApiClient from '../utils/ApiClient.js';
import { fetchCatalog, getCounters, evaluateCatalog } from '../utils/achievements.js';

class Profile extends BasePanel {
    static id = "profile";

    async _init(config) {
        this.config = config;
        this.database = await new database().init();
        this.playerName = null;

        document.getElementById('profile-back-btn')?.addEventListener('click', () => changePanel('home'));

        const lbTitle = document.getElementById('profile-leaderboard-title');
        if (lbTitle) lbTitle.textContent = t('profile_leaderboard') || 'Classement joueurs';
        const facTitle = document.getElementById('profile-factions-title');
        if (facTitle) facTitle.textContent = t('profile_factions') || 'Factions';
        const achTitle = document.getElementById('profile-achievements-title');
        if (achTitle) achTitle.textContent = t('profile_achievements') || 'Succès';

        await this.loadPlayerHeader();
        await Promise.allSettled([
            this.loadLeaderboard(),
            this.loadFactions(),
            this.loadAchievements(),
        ]);
    }

    async loadAchievements() {
        const el = document.getElementById('profile-achievements');
        if (!el) return;
        try {
            const catalog = await fetchCatalog();
            if (!catalog.length) {
                el.innerHTML = `<div class="profile-empty">${this._escape(t('profile_no_achievements') || 'Aucun succès disponible pour le moment.')}</div>`;
                this._setAchievementPoints(0);
                return;
            }

            const counters = getCounters();
            const { items, totalPoints, newlyUnlocked } = evaluateCatalog(catalog, counters);

            this._setAchievementPoints(totalPoints);
            el.innerHTML = `<div class="achievements-grid">${items.map(it => this._achievementCard(it)).join('')}</div>`;

            // Wire URL-icon fallbacks (a broken image swaps to the medal glyph).
            el.querySelectorAll('.achievement-icon-img').forEach(img => {
                img.addEventListener('error', () => {
                    const wrap = img.parentElement;
                    if (wrap) wrap.innerHTML = '🏅';
                });
            });

            // Surface any achievement unlocked since the player last looked.
            for (const a of newlyUnlocked) this._showUnlockToast(a);
        } catch (err) {
            console.warn('[Profile] achievements failed:', err);
            el.innerHTML = `<div class="profile-empty">${this._escape(t('profile_achievements_error') || 'Succès indisponibles.')}</div>`;
        }
    }

    _setAchievementPoints(points) {
        const ptsEl = document.getElementById('profile-achievements-points');
        if (ptsEl) ptsEl.textContent = `${points} ${t('profile_achievement_points') || 'pts'}`;
    }

    // Resolve an icon: an http(s) URL → <img> (with onerror fallback wired in
    // loadAchievements); a short emoji/glyph → rendered as-is; otherwise the
    // generic medal.
    _achievementIcon(icon) {
        const raw = String(icon ?? '').trim();
        if (/^https?:\/\//i.test(raw)) {
            return `<img class="achievement-icon-img" src="${this._escape(raw)}" alt="">`;
        }
        if (raw && raw.length <= 4) return this._escape(raw);
        return '🏅';
    }

    _achievementCard(it) {
        const a = it.achievement || {};
        const name = this._escape(a.name || a.code || '');
        const desc = this._escape(a.description || '');
        const points = Number(a.points) || 0;
        const cls = it.unlocked ? 'achievement-card unlocked' : 'achievement-card locked';

        // Progress bar for threshold types (target present and > 0).
        let progressHtml = '';
        if (!it.unlocked && it.target && it.target > 0 && it.progress != null) {
            const pct = Math.max(0, Math.min(100, Math.round((it.progress / it.target) * 100)));
            const cur = Number.isInteger(it.progress) ? it.progress : it.progress.toFixed(1);
            progressHtml = `
                <div class="achievement-progress">
                    <div class="achievement-progress-bar"><div class="achievement-progress-fill" style="width:${pct}%"></div></div>
                    <div class="achievement-progress-label">${this._escape(cur)} / ${this._escape(it.target)}</div>
                </div>`;
        }

        const manualNote = it.manual
            ? `<div class="achievement-manual-note">${this._escape(t('profile_achievement_manual') || 'À débloquer sur le site')}</div>`
            : '';

        return `
            <div class="${cls}" title="${desc}">
                <div class="achievement-icon">${this._achievementIcon(a.icon)}</div>
                <div class="achievement-body">
                    <div class="achievement-name">${name}</div>
                    ${desc ? `<div class="achievement-desc">${desc}</div>` : ''}
                    ${progressHtml}
                    ${manualNote}
                </div>
                <div class="achievement-points">${points} ${this._escape(t('profile_achievement_points') || 'pts')}</div>
            </div>`;
    }

    _showUnlockToast(a) {
        const stack = document.getElementById('achievement-toast-stack');
        if (!stack || !a) return;
        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.innerHTML = `
            <div class="achievement-toast-icon">${this._achievementIcon(a.icon)}</div>
            <div class="achievement-toast-body">
                <div class="achievement-toast-title">${this._escape(t('profile_achievement_unlocked') || 'Succès débloqué !')}</div>
                <div class="achievement-toast-name">${this._escape(a.name || a.code || '')}</div>
            </div>`;
        toast.querySelector('.achievement-icon-img')?.addEventListener('error', (e) => {
            const wrap = e.target.parentElement;
            if (wrap) wrap.innerHTML = '🏅';
        });
        stack.appendChild(toast);
        // Trigger the enter transition then auto-dismiss.
        requestAnimationFrame(() => toast.classList.add('visible'));
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 400);
        }, 5000);
    }

    async loadPlayerHeader() {
        try {
            const selected = (await this.database.get('1234', 'accounts-selected'))?.value?.selected;
            if (!selected) return;
            const account = (await this.database.get(selected, 'accounts'))?.value;
            if (!account) return;

            this.playerName = account.name || null;

            const nameEl = document.getElementById('profile-player-name');
            const roleEl = document.getElementById('profile-player-role');
            const headEl = document.getElementById('profile-player-head');
            const statsEl = document.getElementById('profile-stats');

            if (nameEl) nameEl.textContent = account.name || '';
            if (roleEl) {
                const role = account.user_info?.role?.name;
                roleEl.textContent = role ? `${t('grade') || 'Grade'} : ${role}` : '';
            }
            if (headEl && account.name) {
                const azauth = getAzAuthUrl(this.config);
                headEl.style.backgroundImage = `url(${azauth}api/skin-api/avatars/face/${account.name})`;
            }

            // GeoCoins balance, if the account carries it (user_info.monnaie / money).
            if (statsEl) {
                statsEl.innerHTML = '';
                const coins = account.user_info?.monnaie ?? account.user_info?.money;
                if (coins != null) {
                    statsEl.appendChild(this._statBadge('💰', `${coins} GeoCoins`, '#fbbf24'));
                }
            }
        } catch (err) {
            console.warn('[Profile] player header failed:', err);
        }
    }

    _statBadge(icon, label, color) {
        const div = document.createElement('div');
        div.className = 'profile-stat-badge';
        if (color) div.style.color = color;
        div.innerHTML = `<span>${icon}</span><span>${this._escape(label)}</span>`;
        return div;
    }

    async loadLeaderboard() {
        const el = document.getElementById('profile-leaderboard');
        if (!el) return;

        // Initial load (no ETag yet); subsequent refreshes are handled by the
        // live poller, which sends If-None-Match.
        try {
            const result = await ApiClient.getLeaderboardsConditional(this._lbEtag);
            this._lbEtag = result.etag || this._lbEtag;
            if (!result.notModified) {
                this._renderLeaderboard(result.data);
            }
            this._lbLastUpdate = Date.now();
            this._updateLiveLabel();
        } catch (err) {
            console.warn('[Profile] leaderboard failed:', err);
            if (!this._lbRendered) {
                el.innerHTML = `<div class="profile-empty">${this._escape(t('profile_leaderboard_error') || 'Classement indisponible.')}</div>`;
            }
        }

        this._startLiveLeaderboard();
    }

    // Render (or smoothly diff-update) the leaderboard rows. Rows whose rank
    // changed since the last render briefly glow.
    _renderLeaderboard(players) {
        const el = document.getElementById('profile-leaderboard');
        if (!el) return;

        if (!Array.isArray(players) || !players.length) {
            el.innerHTML = `<div class="profile-empty">${this._escape(t('profile_no_leaderboard') || 'Aucun classement disponible.')}</div>`;
            this._lbRendered = false;
            return;
        }

        // Find the current player's rank to surface it in the header (once).
        const me = this.playerName
            ? players.find(p => String(p.name).toLowerCase() === String(this.playerName).toLowerCase())
            : null;
        if (me && !this._lbMeBadgeDone) {
            this._lbMeBadgeDone = true;
            const statsEl = document.getElementById('profile-stats');
            if (statsEl) statsEl.appendChild(this._statBadge('🏆', `${t('profile_rank') || 'Rang'} #${me.rank}`, '#4ade80'));
        }

        const prevRanks = this._lbPrevRanks || {};
        const newRanks = {};

        // Build the live header (indicator + "updated Xs ago").
        const header = `<div class="leaderboard-live-head">
            <span class="leaderboard-live"><span class="leaderboard-live-dot"></span>${this._escape(t('profile_live') || 'Live')}</span>
            <span class="leaderboard-updated" id="leaderboard-updated"></span>
        </div>`;

        const rows = players.map(p => {
            const key = String(p.name);
            newRanks[key] = p.rank;
            const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`;
            const coins = p.coins != null ? `<span class="profile-coins">${this._escape(p.coins)} pts</span>` : '';
            const isMe = me && p.name === me.name;
            let cls = isMe ? 'profile-row profile-row-me' : 'profile-row';
            // Glow a row whose rank changed (and only after a first render, so
            // the initial paint doesn't light up everything).
            if (this._lbRendered && prevRanks[key] != null && prevRanks[key] !== p.rank) {
                cls += ' profile-row-changed';
            }
            return `<div class="${cls}" data-player="${this._escape(key)}"><span>${medal} ${this._escape(p.name)}</span>${coins}</div>`;
        }).join('');

        el.innerHTML = header + rows;
        this._lbPrevRanks = newRanks;
        this._lbRendered = true;

        // Clear the transient glow class so it can retrigger next change.
        el.querySelectorAll('.profile-row-changed').forEach(row => {
            setTimeout(() => row.classList.remove('profile-row-changed'), 1600);
        });

        this._updateLiveLabel();
    }

    _updateLiveLabel() {
        const el = document.getElementById('leaderboard-updated');
        if (!el || !this._lbLastUpdate) return;
        const secs = Math.max(0, Math.round((Date.now() - this._lbLastUpdate) / 1000));
        const tmpl = t('profile_updated_ago') || 'mis à jour il y a {s}s';
        el.textContent = tmpl.replace('{s}', secs);
    }

    // Poll the leaderboard every 30s while the profile panel is visible, and a
    // 1s ticker keeps the "updated Xs ago" label fresh. Both are cleared when
    // the panel leaves (see _watchVisibility / _stopLiveLeaderboard).
    _startLiveLeaderboard() {
        this._stopLiveLeaderboard();
        this._watchVisibility();
        if (!this._panelActive()) return;

        this._lbPollTimer = setInterval(() => this._pollLeaderboard(), 30000);
        this._lbTickTimer = setInterval(() => this._updateLiveLabel(), 1000);
    }

    _stopLiveLeaderboard() {
        if (this._lbPollTimer) { clearInterval(this._lbPollTimer); this._lbPollTimer = null; }
        if (this._lbTickTimer) { clearInterval(this._lbTickTimer); this._lbTickTimer = null; }
    }

    _panelActive() {
        const panel = document.querySelector('.panel.profile');
        return !!(panel && panel.classList.contains('active'));
    }

    // Watch the panel's active class so we stop polling when the user leaves
    // (changePanel toggles `.active`) and resume when they come back.
    _watchVisibility() {
        if (this._visibilityObserver) return;
        const panel = document.querySelector('.panel.profile');
        if (!panel) return;
        this._visibilityObserver = new MutationObserver(() => {
            if (this._panelActive()) {
                if (!this._lbPollTimer) {
                    this._lbPollTimer = setInterval(() => this._pollLeaderboard(), 30000);
                    this._lbTickTimer = setInterval(() => this._updateLiveLabel(), 1000);
                    this._pollLeaderboard();
                }
            } else {
                this._stopLiveLeaderboard();
            }
        });
        this._visibilityObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
    }

    async _pollLeaderboard() {
        if (!this._panelActive()) { this._stopLiveLeaderboard(); return; }
        try {
            const result = await ApiClient.getLeaderboardsConditional(this._lbEtag);
            this._lbEtag = result.etag || this._lbEtag;
            this._lbLastUpdate = Date.now();
            if (result.notModified) {
                // Nothing changed server-side — just refresh the age label.
                this._updateLiveLabel();
                return;
            }
            this._renderLeaderboard(result.data);
        } catch (err) {
            console.warn('[Profile] live leaderboard poll failed:', err);
        }
    }

    _destroy() {
        this._stopLiveLeaderboard();
        if (this._visibilityObserver) {
            this._visibilityObserver.disconnect();
            this._visibilityObserver = null;
        }
    }

    async loadFactions() {
        const el = document.getElementById('profile-factions');
        if (!el) return;
        try {
            const factions = await ApiClient.getFactions();
            if (!Array.isArray(factions) || !factions.length) {
                el.innerHTML = `<div class="profile-empty">${this._escape(t('profile_no_factions') || 'Aucune faction pour le moment.')}</div>`;
                return;
            }

            // Detect the player's own faction (if its member list mentions them).
            const myFaction = this.playerName
                ? factions.find(f => Array.isArray(f.members_list)
                    && f.members_list.some(m => String(m).toLowerCase() === String(this.playerName).toLowerCase()))
                : null;
            if (myFaction) {
                const statsEl = document.getElementById('profile-stats');
                if (statsEl) statsEl.appendChild(this._statBadge('🏰', myFaction.name, '#a78bfa'));
            }

            el.innerHTML = factions.map(f => {
                const members = f.members != null ? `${this._escape(f.members)} ${t('profile_members') || 'membres'}` : '';
                const power = f.power != null ? ` · ⚡ ${this._escape(f.power)}` : '';
                const isMine = myFaction && f.name === myFaction.name;
                const cls = isMine ? 'profile-faction-row profile-faction-me' : 'profile-faction-row';
                const youTag = isMine ? ` <span class="profile-faction-you">(${t('profile_you') || 'vous'})</span>` : '';
                return `<div class="${cls}">
                    <div class="profile-faction-name">${this._escape(f.name)}${f.tag ? ` <span class="profile-faction-tag">[${this._escape(f.tag)}]</span>` : ''}${youTag}</div>
                    <div class="profile-faction-meta">${members}${power}</div></div>`;
            }).join('');
        } catch (err) {
            console.warn('[Profile] factions failed:', err);
            el.innerHTML = `<div class="profile-empty">${this._escape(t('profile_factions_error') || 'Factions indisponibles.')}</div>`;
        }
    }

    _escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }
}

export default Profile;
