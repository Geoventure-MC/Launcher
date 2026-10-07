// Faux panel Geoventure : sert des réponses /utils/*, /data et AZauth réalistes (formes issues du vrai panel),
// avec des modes d'erreur commutables à chaud via POST /__mode {"mode":"..."}.
//   ok        : tout répond normalement
//   html502   : /utils/* et /data répondent 502 + page HTML (nginx)
//   empty     : JSON vide ({} / [])
//   azauthnull: /utils/api avec azauth null
//   down      : connexion coupée (socket détruit)
import http from 'node:http';
import crypto from 'node:crypto';

export const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 8790);
export const SKIN_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVQYV2NkYGD4z0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64');

export function apiConfig(base, over = {}) {
  return {
    maintenance: false, maintenance_message: 'Maintenance en cours.', game_version: '1.20.1', instance: null, theme_color: null,
    client_id: '', verify: true, modde: true, java: false, dataDirectory: 'geoventure-e2e',
    status: { nameServer: 'Geoventure', ip: '127.0.0.1', port: '25999' },
    servers: [
      { id: 'geoventure', server_id: 1000, name: 'Geoventure', ip: '127.0.0.1', port: 25999, type: 'minecraft', icon: null, theme_color: '#4ade80', is_default: true, azauth: base },
      { id: 'elandor', server_id: 1001, name: 'Elandor', ip: '127.0.0.1', port: 25998, type: 'minecraft', icon: null, theme_color: '#a78bfa', is_default: false, azauth: base },
      { id: 'pokeland', server_id: 1002, name: 'Pokeland', ip: '127.0.0.1', port: 25997, type: 'minecraft', icon: null, theme_color: '#fb923c', is_default: false, azauth: base },
    ],
    loader: { type: 'forge', build: '1.20.1-47.4.20', enable: true },
    ram_min: 2, ram_max: 4, online: 'true', game_args: [], money: true, role: true,
    splash: 'Test E2E', splash_author: 'e2e', accent_color: '#FFA500', azauth: base, map_url: '', azuriom_sites: [],
    rpc_activation: false, rpc_id: '', rpc_details: '', rpc_state: '', rpc_large_image: '', rpc_large_text: '', rpc_small_image: '', rpc_small_text: '',
    rpc_button1: '', rpc_button1_url: '', rpc_button2: '', rpc_button2_url: '',
    whitelist_activate: false, alert_activate: false, alert_scroll: false, alert_msg: '', video_activate: false, video_url: '', video_type: 'normal',
    email_verified: false, server_icon: null, role_data: [], ignored: [], whitelist: [], whitelist_roles: [],
    ...over,
  };
}

export const MANIFEST_FILES = [
  { path: 'mods/geocore.jar', content: 'JARDATA-geocore' },
  { path: 'config/geo.toml', content: 'a=1\n' },
];

export const FIXTURES = {
  notifications: [
    { id: 1, type: 'maintenance', message: 'Maintenance samedi 3h', url: 'https://example.test/maint', expiresAt: null, createdAt: 1790000000000 },
    { id: 2, type: 'event', message: 'Tournoi <b>Wonder</b> ce soir', url: null, expiresAt: null, createdAt: 1790000100000 },
  ],
  achievements: [
    { code: 'first_launch', name: 'Premier pas', description: 'Lancer le jeu', icon: 'star', points: 10, rarity: 'common', category: 'Premiers pas', condition_type: 'first_launch', condition_value: 1, secret: false, max_level: 1 },
    { code: 'regular', name: 'Habitué', description: 'Lancer 10 fois le jeu', icon: 'play', points: 20, rarity: 'uncommon', category: 'Premiers pas', condition_type: 'launch_count', condition_value: 10, secret: false, max_level: 3 },
    { code: 'explorer', name: 'Explorateur', description: 'Essayer 3 instances', icon: 'map', points: 30, rarity: 'rare', category: 'Aventure', condition_type: 'instances_tried', condition_value: 3, secret: false, max_level: 1 },
    { code: 'hidden_one', name: '???', description: '', icon: null, points: 50, rarity: 'legendary', category: 'Secrets', condition_type: 'manual', condition_value: null, secret: true, max_level: 1 },
  ],
  leaderboards: [{ name: 'Alice', coins: 12000 }, { name: 'Bob', coins: 8000 }, { name: 'E2EPlayer', coins: 500 }],
  factions: [{ name: 'Les Bâtisseurs', members: 12, power: 340, color: '#3366ff' }],
  seasons: { current: { id: 3, name: 'Saison 3', startsAt: 1790000000000, endsAt: 1795000000000, standings: [{ name: 'Les Bâtisseurs', points: 120 }] }, past: [] },
  statuses: (on) => [
    { id: 'geoventure', server_id: 1000, name: 'Geoventure', ip: '127.0.0.1', port: 25999, online: on, players: on ? 7 : null, max_players: 100, version: '1.20.1', latency: on ? 42 : null, is_default: true, players_sample: on ? ['Alice', 'Bob'] : undefined },
    { id: 'elandor', server_id: 1001, name: 'Elandor', ip: '127.0.0.1', port: 25998, online: false, players: null, max_players: null, version: null, latency: null, is_default: false },
    { id: 'pokeland', server_id: 1002, name: 'Pokeland', ip: '127.0.0.1', port: 25997, online: true, players: 3, max_players: 50, version: '1.20.1', latency: 80, is_default: false },
  ],
  mods: { optionalMods: ['minimap.jar', 'ghost.jar'], mods: { 'minimap.jar': { name: 'Mini-carte', description: 'Une minicarte', icon: null, recommanded: true } } },
  changelog: [], launcherContent: { news_banners: [], shortcuts: [], discover: [] }, scheduledEvents: [],
  history: { points: [], peakHours: [] },
};

export async function startMock(port = MOCK_PORT) {
  let mode = 'ok';
  const defaultManifest = MANIFEST_FILES.map(f => ({ path: f.path, size: Buffer.byteLength(f.content), hash: crypto.createHash('sha1').update(f.content).digest('hex'), url: `http://127.0.0.1:${port}/storage/data/${f.path}` }));
  let manifest = defaultManifest;
  const hits = [];
  let base = `http://127.0.0.1:${port}/`;
  const json = (res, code, body, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...extra }); res.end(JSON.stringify(body)); };

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, base);
    const p = u.pathname;
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (p !== '/__mode' && p !== '/__hits') hits.push({ method: req.method, path: p, query: u.search, body });
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); return res.end(); }
      if (p === '/__mode') { mode = JSON.parse(body).mode; return json(res, 200, { mode }); }
      if (p === '/__hits') return json(res, 200, hits);

      const panelPath = p.startsWith('/utils/') || p === '/data' || p === '/api-schema.json';
      if (panelPath && mode === 'down') return req.socket.destroy();
      if (panelPath && mode === 'html502') {
        res.writeHead(502, { 'content-type': 'text/html' });
        return res.end('<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx</center></body></html>');
      }
      const E = mode === 'empty';
      switch (p) {
        case '/utils/api': return E ? json(res, 200, {}) : json(res, 200, apiConfig(base, mode === 'azauthnull' ? { azauth: null, servers: apiConfig(base).servers.map(s => ({ ...s, azauth: null })) } : {}));
        case '/utils/notifications': return json(res, 200, E ? [] : FIXTURES.notifications);
        case '/utils/servers-status': return json(res, 200, E ? [] : FIXTURES.statuses(true));
        case '/utils/achievements': return json(res, 200, E ? [] : FIXTURES.achievements);
        case '/utils/achievements/progress': return json(res, 200, { unlocked: [], progress: {} });
        case '/utils/leaderboards': return json(res, 200, E ? [] : FIXTURES.leaderboards);
        case '/utils/factions': return json(res, 200, E ? [] : FIXTURES.factions);
        case '/utils/seasons': return json(res, 200, E ? { current: null, past: [] } : FIXTURES.seasons);
        case '/utils/mods': return json(res, 200, E ? { optionalMods: [], mods: [] } : FIXTURES.mods);
        case '/utils/changelog': return json(res, 200, FIXTURES.changelog);
        case '/utils/launcher-content': return json(res, 200, FIXTURES.launcherContent);
        case '/utils/scheduled-events': return json(res, 200, FIXTURES.scheduledEvents);
        case '/utils/servers-history': return json(res, 200, FIXTURES.history);
        case '/utils/collecte': return json(res, 200, { active: false, state: 'idle', title: '', tier: 0, total: 0, goal: 0, bossAt: 0, bossLabel: '', top: [], countries: [] });
        case '/utils/wonder': return json(res, 200, { current: null, past: [] });
        case '/utils/telemetry': return json(res, 200, { ok: true });
        case '/api-schema.json': return json(res, 200, { schemaVersion: '1.0.0' });
        case '/data': return json(res, 200, E ? [] : manifest);
        case '/api/rss': res.writeHead(200, { 'content-type': 'application/rss+xml' }); return res.end('<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>t</title><item><title>Actu E2E</title><content:encoded><![CDATA[<p>Contenu de l\'actu</p>]]></content:encoded><dc:creator>e2e</dc:creator><pubDate>Mon, 05 Oct 2026 10:00:00 +0000</pubDate></item></channel></rss>');
        case '/api/auth/verify':
        case '/api/auth/authenticate':
          return json(res, 200, { status: 'success', access_token: 'tok-e2e', uuid: '11111111-2222-3333-4444-555555555555', username: 'E2EPlayer', id: 7, banned: false, money: 500, role: { name: 'Joueur', color: '#fff' }, email_verified: true });
        case '/api/skin-api/skins/update': return json(res, 200, { status: 'success' });
      }
      if (p.startsWith('/api/skin-api/skins/')) return json(res, 200, { url: `${base}skin.png` });
      if (p.startsWith('/api/skin-api/avatars/') || p === '/skin.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(SKIN_PNG); }
      if (p.startsWith('/skin3d/')) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body style="background:#223">skin3d</body></html>'); }
      if (p.startsWith('/storage/data/')) { const f = MANIFEST_FILES.find(m => p.endsWith(m.path)); if (f) { res.writeHead(200); return res.end(f.content); } }
      res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>404</h1>');
    });
  });
  await new Promise(r => server.listen(port, '127.0.0.1', r));
  return {
    url: base, setMode: m => { mode = m; }, hits, clearHits: () => { hits.length = 0; },
    setManifest: m => { manifest = m ?? defaultManifest; },
    close: () => new Promise(r => { server.closeAllConnections?.(); server.close(r); }),
  };
}
