/**
 * BasePanel — lifecycle wrapper with error boundary for all launcher panels.
 * Subclasses override _init(config, news) instead of init().
 */
export default class BasePanel {
    static id = 'base';

    async init(config, news) {
        try {
            await this._init(config, news);
        } catch (err) {
            console.error(`[${this.constructor.name}] Panel init failed:`, err);
            this._showPanelError(err);
        }
    }

    async _init(config, news) {
        // Override in subclass
    }

    destroy() {
        try {
            this._destroy();
        } catch (err) {
            console.error(`[${this.constructor.name}] Panel destroy failed:`, err);
        }
    }

    _destroy() {
        // Override in subclass if cleanup needed
    }

    _showPanelError(err) {
        const panelEl = document.querySelector(`.${this.constructor.id}`);
        if (!panelEl) return;
        const msg = document.createElement('div');
        msg.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#f87171;text-align:center;font-size:14px;z-index:9999;';
        msg.textContent = `Erreur d'initialisation — rechargez l'application. (${err?.message || 'unknown'})`;
        panelEl.appendChild(msg);
    }
}
