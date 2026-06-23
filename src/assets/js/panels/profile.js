'use strict';

import { database, changePanel, t } from '../utils.js';
import { getAzAuthUrl } from '../utils/config.js';
import BasePanel from '../utils/BasePanel.js';
import ApiClient from '../utils/ApiClient.js';

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

        await this.loadPlayerHeader();
        await Promise.allSettled([
            this.loadLeaderboard(),
            this.loadFactions(),
        ]);
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
        try {
            const players = await ApiClient.getLeaderboards();
            if (!Array.isArray(players) || !players.length) {
                el.innerHTML = `<div class="profile-empty">${this._escape(t('profile_no_leaderboard') || 'Aucun classement disponible.')}</div>`;
                return;
            }


            // Find the current player's rank to surface it in the header.
            const me = this.playerName
                ? players.find(p => String(p.name).toLowerCase() === String(this.playerName).toLowerCase())
                : null;
            if (me) {
                const statsEl = document.getElementById('profile-stats');
                if (statsEl) statsEl.appendChild(this._statBadge('🏆', `${t('profile_rank') || 'Rang'} #${me.rank}`, '#4ade80'));
            }

            el.innerHTML = players.map(p => {
                const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`;
                const coins = p.coins != null ? `<span class="profile-coins">${this._escape(p.coins)} pts</span>` : '';
                const isMe = me && p.name === me.name;
                const cls = isMe ? 'profile-row profile-row-me' : 'profile-row';
                return `<div class="${cls}"><span>${medal} ${this._escape(p.name)}</span>${coins}</div>`;
            }).join('');
        } catch (err) {
            console.warn('[Profile] leaderboard failed:', err);
            el.innerHTML = `<div class="profile-empty">${this._escape(t('profile_leaderboard_error') || 'Classement indisponible.')}</div>`;
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
