/**
 * @author Luuxis
 * Licensed under CC BY-NC 4.0
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Edited by CentralCorp Team
 */
"use strict";
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const os = require("os");
let dev = process.env.DEV_TOOL === 'open';
let updateWindow = undefined;

function getWindow() {
    return updateWindow;
}

function destroyWindow() {
    if (!updateWindow) return;
    updateWindow.close();
    updateWindow = undefined;
}

function createWindow() {
    destroyWindow();
    updateWindow = new BrowserWindow({
        title: "Mise à jour",
        width: 400,
        height: 500,
        resizable: false,
        icon: `./src/assets/images/icon.${os.platform() === "win32" ? "ico" : "png"}`,
        frame: false,
        show: false,
        // nodeIntegration reste nécessaire : tout le rendu utilise require()/ipcRenderer. Les défenses sont
        // ailleurs : garde de navigation (utils/window-guard.js), CSP dans le HTML, aucun Node dans les
        // iframes (skin 3D, YouTube), pas de <webview>, pas de navigation par glisser-déposer.
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true,
            nodeIntegrationInSubFrames: false,
            nodeIntegrationInWorker: false,
            webviewTag: false,
            navigateOnDragDrop: false,
            spellcheck: false
        },
    });
    Menu.setApplicationMenu(null);
    updateWindow.setMenuBarVisibility(false);
    updateWindow.loadFile(path.join(`${app.getAppPath()}/src/index.html`));
    updateWindow.once('ready-to-show', () => {
        if (updateWindow) {
            if (dev) updateWindow.webContents.openDevTools({ mode: 'detach' })
            updateWindow.show();
        }
    });
}

module.exports = {
    getWindow,
    createWindow,
    destroyWindow,
};