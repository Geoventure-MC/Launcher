/**
 * Profile / Communauté hub panel.
 * Bundles: player stats, achievements, leaderboard and factions.
 * Stats are tracked locally (IndexedDB 'profile' store); the leaderboard and
 * factions are served by the panel (/utils/leaderboards, /utils/factions) and
 * degrade gracefully to an empty state when unavailable.
 */
'use strict';

import { database, changePanel, t } from '../utils.js';
const pkg = require('../package.json');
const settings_url = localStorage.getItem('geoventure_server_url') || (pkg.user ? `${pkg.settings}/${pkg.user}` : pkg.settings);

// Achievement catalog. `check(ctx)` returns a number in [0,1] (progress);
// >= 1 means unlocked. ctx = { stats, coins, serversPlayed }.
const ACHIEVEMENTS = [
    { id: 'first_steps', icon: '🎮', title: 'Premiers pas', desc: 'Lancer le jeu pour la première fois', check: c => c.stats.launches >= 1 ? 1 : 0 },
    { id: 'regular', icon: '🔥', title: 'Habitué', desc: 'Lancer le jeu 25 fois', check: c => c.stats.launches / 25 },
    { id: 'loyal', icon: '⭐', title: 'Fidèle', desc: 'Lancer le jeu 100 fois', check: c => c.stats.launches / 100 },
    { id: 'hour_1', icon: '⏱️', title: 'Échauffement', desc: 'Jouer 1 heure', check: c => c.stats.totalPlaytime / 3600 },
    { id: 'hour_10', icon: '🕙', title: 'Investi', desc: 'Jouer 10 heures', check: c => c.stats.totalPlaytime / 36000 },
    { id: 'hour_50', icon: '🏆', title: 'Vétéran', desc: 'Jouer 50 heures', check: c => c.stats.totalPlaytime / 180000 },
    { id: 'hour_100', icon: '👑', title: 'Légende', desc: 'Jouer 100 heures', check: c => c.stats.totalPlaytime / 360000 },
    { id: 'explorer', icon: '🧭', title: 'Explorateur', desc: 'Jouer sur 2 serveurs différents', check: c => c.serversPlayed / 2 },
    { id: 'globetrotter', icon: '🌍', title: 'Globe-trotteur', desc: 'Jouer sur les 3 serveurs', check: c => c.serversPlayed / 3 },
    { id: 'rich', icon: '💰', title: 'Fortuné', desc: 'Posséder 1000 GeoCoins', check: c => c.coins / 1000 },
    { id: 'tycoon', icon: '💎', title: 'Magnat', desc: 'Posséder 10 000 GeoCoins', check: c => c.coins / 10000 },
];

class Profile {
    static id = "profile";

    async init(config) {
        this.config = config;
        this.database = await new database().init();
        this.setStaticTexts();
        this.initTabs();
        this.initButtons();
        await this.refresh();
    }

    // Re-pull everything; called on init and whenever the panel is reopened so
    // freshly-tracked playtime / coins are reflected without restarting.
    async refresh() {
        await this.loadHeader();
        await this.renderStats();
        await this.renderAchievements();
        this.loadLeaderboard();
        this.loadFactions();
    }

    base() {
        return settings_url.endsWith('/') ? settings_url : `${settings_url}/`;
    }

    getAzAuthUrl() {
        const baseUrl = this.base();
        if (pkg.env === 'azuriom') return baseUrl;
        const az = this.config && this.config.azauth ? String(this.config.azauth) : baseUrl;
        return az.endsWith('/') ? az : `${az}/`;
    }

    setStaticTexts() {
        document.querySelector('#profile-tab-stats span').textContent = t('profile_stats') || 'Statistiques';
        document.querySelector('#profile-tab-achievements span').textContent = t('profile_achievements') || 'Succès';
        document.querySelector('#profile-tab-leaderboard span').textContent = t('profile_leaderboard') || 'Classement';
        document.querySelector('#profile-tab-factions span').textContent = t('profile_factions') || 'Factions';
        document.getElementById('profile-skin-btn-text').textContent = t('change_skin') || 'Changer de skin';
    }

    initButtons() {
        document.getElementById('profile-back-btn').addEventListener('click', () => changePanel('home'));
        document.getElementById('profile-skin-btn').addEventListener('click', () => {
            changePanel('settings');
            const skinTab = document.getElementById('skin-tab');
            if (skinTab) skinTab.click();
        });
        // Refresh data each time the panel is opened from the home sidebar.
        const homeBtn = document.getElementById('profile-btn');
        if (homeBtn) homeBtn.addEventListener('click', () => this.refresh());
    }

    initTabs() {
        const tabs = document.querySelectorAll('.profile-tab');
        const panels = document.querySelectorAll('.profile-panel');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(x => x.classList.remove('active'));
                panels.forEach(x => x.classList.remove('active'));
                tab.classList.add('active');
                const target = document.querySelector(`.profile-panel[data-panel="${tab.dataset.tab}"]`);
                if (target) target.classList.add('active');
            });
        });
    }

    async getAccount() {
        const sel = await this.database.get('1234', 'accounts-selected');
        if (!sel?.value?.selected) return null;
        const rec = await this.database.get(sel.value.selected, 'accounts');
        return rec?.value || null;
    }

    async getStats() {
        const rec = await this.database.get('stats', 'profile');
        return rec?.value || { uuid: 'stats', totalPlaytime: 0, launches: 0, perServer: {}, firstLaunch: null, lastPlayed: null };
    }

    async loadHeader() {
        const account = await this.getAccount();
        if (!account) return;

        document.getElementById('profile-name').textContent = account.name;

        const roleEl = document.getElementById('profile-role');
        if (this.config.role && account.user_info?.role?.name) {
            roleEl.textContent = account.user_info.role.name;
        } else {
            roleEl.style.display = 'none';
        }

        const coinsEl = document.getElementById('profile-coins');
        const coins = Number(account.user_info?.monnaie ?? 0);
        if (this.config.money) {
            coinsEl.innerHTML = `<i class="fas fa-coins"></i> ${coins.toLocaleString('fr-FR')} ${this.config.money_name || 'GeoCoins'}`;
        } else {
            coinsEl.style.display = 'none';
        }

        const skin = document.getElementById('profile-skin-render');
        if (skin) skin.src = `${this.getAzAuthUrl()}skin3d/3d-api/skin-api/${account.name}`;
    }

    formatPlaytime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return `${Math.floor(seconds)}s`;
    }

    async renderStats() {
        const stats = await this.getStats();
        const account = await this.getAccount();
        const coins = Number(account?.user_info?.monnaie ?? 0);

        const cards = [
            { icon: 'fa-clock', label: t('stat_playtime') || 'Temps de jeu', value: this.formatPlaytime(stats.totalPlaytime || 0) },
            { icon: 'fa-rocket', label: t('stat_launches') || 'Parties lancées', value: (stats.launches || 0).toLocaleString('fr-FR') },
            { icon: 'fa-coins', label: this.config.money_name || 'GeoCoins', value: coins.toLocaleString('fr-FR') },
            { icon: 'fa-calendar-day', label: t('stat_last_played') || 'Dernière partie', value: stats.lastPlayed ? new Date(stats.lastPlayed).toLocaleDateString('fr-FR') : '—' },
        ];

        document.getElementById('stats-grid').innerHTML = cards.map(c => `
            <div class="stat-card">
                <i class="fas ${c.icon}"></i>
                <div class="stat-value">${c.value}</div>
                <div class="stat-label">${c.label}</div>
            </div>`).join('');

        // Per-server breakdown using the configured servers list.
        const servers = pkg.servers || [];
        const per = stats.perServer || {};
        const total = Object.values(per).reduce((a, b) => a + b, 0) || 1;
        const rows = servers.map(s => {
            const secs = per[s.id] || 0;
            const pct = Math.round((secs / total) * 100);
            return `
                <div class="server-stat-row">
                    <span class="server-stat-dot" style="background:${s.color}"></span>
                    <span class="server-stat-name">${s.name}</span>
                    <div class="server-stat-bar"><div class="server-stat-fill" style="width:${pct}%;background:${s.color}"></div></div>
                    <span class="server-stat-time">${this.formatPlaytime(secs)}</span>
                </div>`;
        }).join('');
        document.getElementById('stats-servers').innerHTML = rows
            ? `<div class="profile-section-title">${t('stat_by_server') || 'Temps par serveur'}</div>${rows}`
            : '';
    }

    async renderAchievements() {
        const stats = await this.getStats();
        const account = await this.getAccount();
        const coins = Number(account?.user_info?.monnaie ?? 0);
        const serversPlayed = Object.values(stats.perServer || {}).filter(v => v > 0).length;
        const ctx = { stats, coins, serversPlayed };

        let unlocked = 0;
        const html = ACHIEVEMENTS.map(a => {
            const progress = Math.max(0, Math.min(1, a.check(ctx) || 0));
            const done = progress >= 1;
            if (done) unlocked++;
            return `
                <div class="ach-card ${done ? 'unlocked' : 'locked'}">
                    <div class="ach-icon">${done ? a.icon : '🔒'}</div>
                    <div class="ach-body">
                        <div class="ach-title">${a.title}</div>
                        <div class="ach-desc">${a.desc}</div>
                        ${done ? '' : `<div class="ach-progress"><div class="ach-progress-fill" style="width:${Math.round(progress * 100)}%"></div></div>`}
                    </div>
                    ${done ? '<i class="fas fa-check ach-check"></i>' : ''}
                </div>`;
        }).join('');

        document.getElementById('ach-summary').innerHTML =
            `<span class="ach-count">${unlocked}/${ACHIEVEMENTS.length}</span> ${t('ach_unlocked') || 'succès débloqués'}`;
        document.getElementById('ach-grid').innerHTML = html;
    }

    async loadLeaderboard() {
        const stateEl = document.getElementById('lb-state');
        const listEl = document.getElementById('lb-list');
        stateEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('loading') || 'Chargement...'}`;
        listEl.innerHTML = '';

        try {
            const res = await fetch(`${this.base()}utils/leaderboards`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const players = Array.isArray(data) ? data : (data.players || []);
            if (!players.length) {
                stateEl.innerHTML = `<i class="fas fa-ranking-star"></i> ${t('lb_empty') || 'Classement bientôt disponible.'}`;
                return;
            }
            stateEl.innerHTML = '';
            listEl.innerHTML = players.slice(0, 50).map((p, i) => {
                const rank = p.rank ?? (i + 1);
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                const value = p.coins != null
                    ? `${Number(p.coins).toLocaleString('fr-FR')} ${this.config.money_name || 'GC'}`
                    : (p.playtime != null ? this.formatPlaytime(p.playtime) : (p.value ?? ''));
                return `
                    <div class="lb-row ${rank <= 3 ? 'lb-top' : ''}">
                        <span class="lb-rank">${medal}</span>
                        <img class="lb-avatar" src="${this.getAzAuthUrl()}api/skin-api/avatars/face/${this._esc(p.name)}" onerror="this.style.visibility='hidden'">
                        <span class="lb-name">${this._esc(p.name)}</span>
                        <span class="lb-value">${this._esc(value)}</span>
                    </div>`;
            }).join('');
        } catch (e) {
            stateEl.innerHTML = `<i class="fas fa-ranking-star"></i> ${t('lb_empty') || 'Classement bientôt disponible.'}`;
        }
    }

    async loadFactions() {
        const stateEl = document.getElementById('fac-state');
        const listEl = document.getElementById('fac-list');
        stateEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${t('loading') || 'Chargement...'}`;
        listEl.innerHTML = '';

        try {
            const res = await fetch(`${this.base()}utils/factions`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
                signal: AbortSignal.timeout(6000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const factions = Array.isArray(data) ? data : (data.factions || []);
            if (!factions.length) {
                stateEl.innerHTML = `<i class="fas fa-shield-halved"></i> ${t('fac_empty') || 'Aucune faction pour le moment.'}`;
                return;
            }
            stateEl.innerHTML = '';
            listEl.innerHTML = factions.slice(0, 50).map((f, i) => {
                const color = this._factionColor(f.color);
                const members = f.members != null ? f.members : (f.totalMembers ?? '?');
                const online = f.online != null ? f.online : (f.onlineMembers ?? 0);
                return `
                    <div class="fac-card" style="--fac-color:${color}">
                        <div class="fac-rank">#${i + 1}</div>
                        <div class="fac-main">
                            <div class="fac-name">${this._esc(f.name || '?')} ${f.tag ? `<span class="fac-tag">[${this._esc(f.tag)}]</span>` : ''}</div>
                            <div class="fac-meta">
                                <span><i class="fas fa-users"></i> ${members} ${t('fac_members') || 'membres'}</span>
                                <span class="fac-online"><i class="fas fa-circle"></i> ${online} ${t('fac_online') || 'en ligne'}</span>
                                ${f.power != null ? `<span><i class="fas fa-bolt"></i> ${Number(f.power).toLocaleString('fr-FR')}</span>` : ''}
                                ${f.bank != null ? `<span><i class="fas fa-coins"></i> ${Number(f.bank).toLocaleString('fr-FR')}</span>` : ''}
                            </div>
                        </div>
                    </div>`;
            }).join('');
        } catch (e) {
            stateEl.innerHTML = `<i class="fas fa-shield-halved"></i> ${t('fac_empty') || 'Aucune faction pour le moment.'}`;
        }
    }

    _factionColor(color) {
        if (color == null) return '#4488ff';
        if (typeof color === 'string') return color;
        // Integer ARGB (as in the GeoFactions bridge) → #RRGGBB.
        const rgb = (color & 0xFFFFFF).toString(16).padStart(6, '0');
        return `#${rgb}`;
    }

    _esc(str) {
        return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

export default Profile;
