/**
 * @author Luuxis
 * Licensed under CC BY-NC 4.0
 * https://creativecommons.org/licenses/by-nc/4.0/
 *
 * Edited by CentralCorp Team
 */
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const os = require("os");
const pkg = require("../../../../package.json");
let dev = process.env.DEV_TOOL === 'open';
let mainWindow = undefined;

function getWindow() {
    return mainWindow;
}

function destroyWindow() {
    if (!mainWindow) return;
    app.quit();
    mainWindow = undefined;
}

function createWindow() {
    destroyWindow();
    mainWindow = new BrowserWindow({
        title: pkg.productName,
        width: 1280,
        height: 720,
        minWidth: 980,
        minHeight: 552,
        resizable: true,
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
    mainWindow.setMenuBarVisibility(false);
    mainWindow.loadFile(path.join(`${app.getAppPath()}/src/launcher.html`));
    mainWindow.once('ready-to-show', () => {
        if (mainWindow) {
            if (dev) mainWindow.webContents.openDevTools({ mode: 'detach' })
            mainWindow.show()
        }
    });
}

module.exports = {
    getWindow,
    createWindow,
    destroyWindow,
};