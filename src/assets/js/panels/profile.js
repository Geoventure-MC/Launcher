'use strict';

import { database, changePanel } from '../utils.js';
import { getAzAuthUrl } from '../utils/config.js';
import BasePanel from '../utils/BasePanel.js';
import ApiClient from '../utils/ApiClient.js';

class Profile extends BasePanel {
    static id = "profile";

    async _init(config) {
        this.config = config;
        this.database = await new database().init();

        document.getElementById('profile-back-btn')?.addEventListener('click', () => changePanel('home'));

        await Promise.allSettled([
            this.loadPlayerHeader(),
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

            const nameEl = document.getElementById('profile-player-name');
            const roleEl = document.getElementById('profile-player-role');
            const headEl = document.getElementById('profile-player-head');
            if (nameEl) nameEl.textContent = account.name || '';
            if (roleEl) roleEl.textContent = account.user_info?.role?.name || '';
            if (headEl && account.name) {
                const azauth = getAzAuthUrl(this.config);
                headEl.style.backgroundImage = `url(${azauth}api/skin-api/avatars/face/${account.name})`;
            }
        } catch (err) {
            console.warn('[Profile] player header failed:', err);
        }
    }

    async loadLeaderboard() {
        const el = document.getElementById('profile-leaderboard');
        if (!el) return;
        try {
            const players = await ApiClient.getLeaderboards();
            if (!Array.isArray(players) || !players.length) {
                el.innerHTML = '<div class="profile-empty">Aucun classement disponible.</div>';
                return;
            }
            el.innerHTML = players.map(p => {
                const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : `#${p.rank}`;
                const coins = p.coins != null ? `<span style="color:#fbbf24;">${p.coins} pts</span>` : '';
                return `<div style="display:flex;justify-content:space-between;padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.03);margin-bottom:4px;">
                    <span>${medal} ${this._escape(p.name)}</span>${coins}</div>`;
            }).join('');
        } catch (err) {
            console.warn('[Profile] leaderboard failed:', err);
            el.innerHTML = '<div class="profile-empty">Classement indisponible.</div>';
        }
    }

    async loadFactions() {
        const el = document.getElementById('profile-factions');
        if (!el) return;
        try {
            const factions = await ApiClient.getFactions();
            if (!Array.isArray(factions) || !factions.length) {
                el.innerHTML = '<div class="profile-empty">Aucune faction pour le moment.</div>';
                return;
            }
            el.innerHTML = factions.map(f => {
                const members = f.members != null ? `${f.members} membres` : '';
                const power = f.power != null ? ` · ⚡ ${f.power}` : '';
                return `<div style="padding:6px 8px;border-radius:6px;background:rgba(255,255,255,0.03);margin-bottom:4px;">
                    <div style="font-weight:600;">${this._escape(f.name)}${f.tag ? ` <span style="color:#9ca3af;">[${this._escape(f.tag)}]</span>` : ''}</div>
                    <div style="font-size:11px;color:#9ca3af;">${members}${power}</div></div>`;
            }).join('');
        } catch (err) {
            console.warn('[Profile] factions failed:', err);
            el.innerHTML = '<div class="profile-empty">Factions indisponibles.</div>';
        }
    }

    _escape(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }
}

export default Profile;
