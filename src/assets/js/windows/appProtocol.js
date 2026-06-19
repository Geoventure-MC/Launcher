/**
 * Custom privileged `app://` protocol for the renderer.
 *
 * WHY: loading the renderer from `file://` gives the page an *opaque* origin.
 * An opaque origin can't be the subject of a real Content-Security-Policy
 * (a previous CSP attempt over file:// broke the app — infinite splash).
 * Serving the exact same files from a custom, registered-as-privileged scheme
 * gives a *stable* origin (`app://bundle`) against which `'self'` is meaningful,
 * so `script-src 'self' app:` actually allows our bundled (now same-origin)
 * scripts.
 *
 * This module does NOT touch nodeIntegration/contextIsolation (those stay as
 * they were — the renderer uses require()/fs/__dirname everywhere). Only the
 * *transport* of the HTML/CSS/static assets changes from file:// to app://.
 *
 * The bundle root is resolved relative to this file so it works both in dev
 * (`<repo>/src/...`) and in the packaged/obfuscated build (`<asar>/app/...`),
 * where build.js copies `src/*` -> `app/*`. This file lives at
 * `<root>/assets/js/windows/appProtocol.js`, so `../../..` === the HTML root.
 */
"use strict";

const { protocol, net } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const SCHEME = "app";
// Single host we serve from: app://bundle/<path>
const HOST = "bundle";

// Root that contains index.html / launcher.html / assets/ (and panels/).
// Resolved from this module's location so dev (src/) and prod (app/) both work.
const BUNDLE_ROOT = path.resolve(__dirname, "..", "..", "..");

/**
 * Content-Security-Policy applied to every app:// document.
 *
 * - script-src 'self' app:  -> our scripts are now same-origin, so they load.
 * - style-src ... 'unsafe-inline' -> the renderer sets many inline styles
 *   (element.style.*, style="" attributes injected via innerHTML).
 * - img-src adds https:/data:/blob: -> remote skins/avatars, data URIs and
 *   URL.createObjectURL(file) previews.
 * - frame-src: youtube embeds AND the Azuriom/panel 3D skin renderer iframe
 *   (settings.html #skinRender2 loads `${websiteUrl}skin3d/...`). The panel
 *   domain is arbitrary/configurable, hence the broad `https:` allowance.
 * - connect-src * -> the launcher fetches arbitrary panel/azuriom/github URLs.
 */
const CSP = [
    "default-src 'self' app:",
    "script-src 'self' app:",
    "style-src 'self' 'unsafe-inline' app:",
    "img-src 'self' app: https: data: blob:",
    "font-src 'self' app: data:",
    "media-src 'self' app: https: blob:",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https:",
    "connect-src *",
].join("; ");

/**
 * Must be called BEFORE app `ready`.
 * Registers `app://` as a standard, secure, fetch/stream/CORS-capable scheme.
 */
function registerPrivileged() {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: SCHEME,
            privileges: {
                standard: true,
                secure: true,
                supportFetchAPI: true,
                stream: true,
                corsEnabled: true,
            },
        },
    ]);
}

/**
 * Must be called AFTER app `ready`.
 * Serves files under BUNDLE_ROOT for app://bundle/<path>, with path-traversal
 * protection, and injects the CSP header on every response.
 */
function registerHandler() {
    protocol.handle(SCHEME, async (request) => {
        try {
            const url = new URL(request.url);

            // Only the `bundle` host is served.
            if (url.host !== HOST) {
                return new Response("Not found", { status: 404 });
            }

            // Decode and normalise the requested path.
            let relPath = decodeURIComponent(url.pathname);
            if (relPath === "/" || relPath === "") relPath = "/index.html";

            // Resolve against the bundle root and guard against traversal.
            const absPath = path.resolve(BUNDLE_ROOT, "." + relPath);
            const rootWithSep = BUNDLE_ROOT.endsWith(path.sep)
                ? BUNDLE_ROOT
                : BUNDLE_ROOT + path.sep;
            if (absPath !== BUNDLE_ROOT && !absPath.startsWith(rootWithSep)) {
                return new Response("Forbidden", { status: 403 });
            }

            // net.fetch reads the file (works inside asar too) and infers the
            // Content-Type from the extension.
            const response = await net.fetch(pathToFileURL(absPath).toString());

            // Re-wrap so we can attach our own headers (incl. the CSP).
            const headers = new Headers(response.headers);
            headers.set("Content-Security-Policy", CSP);

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers,
            });
        } catch (err) {
            console.error("[app://] handler error:", err);
            return new Response("Internal error", { status: 500 });
        }
    });
}

module.exports = {
    SCHEME,
    HOST,
    BUNDLE_ROOT,
    CSP,
    registerPrivileged,
    registerHandler,
    // Convenience: build an app:// URL for a bundle-relative path.
    url: (p) => `${SCHEME}://${HOST}/${String(p).replace(/^\/+/, "")}`,
};
