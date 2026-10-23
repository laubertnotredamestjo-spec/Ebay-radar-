'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { median, cleanQuery, simplifyItem } = require('./lib');

// Charge une configuration locale simple, sans dependance externe.
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[match[1]] = val;
  }
}
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const SANDBOX = process.env.EBAY_SANDBOX === 'true';
const API_BASE = SANDBOX ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';
const AUTH_BASE = SANDBOX ? 'https://auth.sandbox.ebay.com' : 'https://auth.ebay.com';
const CLIENT_ID = process.env.EBAY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET || '';
const RUNAME = process.env.EBAY_RUNAME || '';
const configured = Boolean(CLIENT_ID && CLIENT_SECRET);
const loginConfigured = Boolean(configured && RUNAME);
const SCOPE_IDENTITY = 'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly';
const SCOPE_APP = 'https://api.ebay.com/oauth/api_scope';
const sessions = new Map(); // POC : stockage RAM uniquement, pas pour une plateforme multi-utilisateurs.
const searchCache = new Map();
let appToken = { value: '', until: 0 };
const root = path.join(__dirname, 'public');

function makeId() { return crypto.randomBytes(32).toString('hex'); }
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(s => s.trim()).filter(s => s.includes('=')).map(s => {
    const idx = s.indexOf('='); return [s.slice(0, idx), s.slice(idx + 1)];
  }));
}
function session(req, res) {
  const old = cookies(req).ebradar_sid;
  let id = old && /^[a-f0-9]{64}$/.test(old) ? old : '';
  let sess = id ? sessions.get(id) : undefined;
  if (!sess || sess.expires < Date.now()) { id = makeId(); sess = { expires: Date.now() + 24 * 3600 * 1000 }; sessions.set(id, sess); }
  sess.expires = Date.now() + 24 * 3600 * 1000;
  res.setHeader('Set-Cookie', `ebradar_sid=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${BASE_URL.startsWith('https://') ? '; Secure' : ''}`);
  return sess;
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
function go(res, destination) { res.writeHead(302, { Location: destination, 'Cache-Control': 'no-store' }); res.end(); }
function safeError(e) { return e?.friendly || 'Service eBay temporairement indisponible. Réessaie plus tard.'; }
async function ebayToken(body) {
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const resp = await fetch(`${API_BASE}/identity/v1/oauth2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${auth}` },
    body: new URLSearchParams(body), signal: AbortSignal.timeout(12000)
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok || !data.access_token) {
    const err = new Error('eBay OAuth API error');
    err.friendly = `Autorisation eBay refusée (${resp.status}). Vérifie les clés, le RuName et les autorisations.`;
    throw err;
  }
  return data;
}
async function getAppToken() {
  if (appToken.value && appToken.until > Date.now() + 60_000) return appToken.value;
  const data = await ebayToken({ grant_type: 'client_credentials', scope: SCOPE_APP });
  appToken = { value: data.access_token, until: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return appToken.value;
}
async function getUserToken(sess) {
  if (sess.userToken && sess.userTokenUntil > Date.now() + 60_000) return sess.userToken;
  if (!sess.refreshToken) return null;
  const data = await ebayToken({ grant_type: 'refresh_token', refresh_token: sess.refreshToken, scope: SCOPE_IDENTITY });
  sess.userToken = data.access_token;
  sess.userTokenUntil = Date.now() + Number(data.expires_in || 3600) * 1000;
  if (data.refresh_token) sess.refreshToken = data.refresh_token;
  return sess.userToken;
}
async function refreshProfile(sess) {
  const token = await getUserToken(sess);
  if (!token) return null;
  const resp = await fetch(`${API_BASE}/commerce/identity/v1/user/`, {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000)
  });
  if (!resp.ok) { const err = new Error('Identity error'); err.friendly = 'Profil eBay indisponible. Vérifie les droits de ton application.'; throw err; }
  const data = await resp.json();
  sess.username = data.username || data.userId || 'Compte eBay';
  return sess.username;
}
async function searchEbay(query) {
  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached && cached.until > Date.now()) return cached.data;
  const accessToken = await getAppToken();
  const params = new URLSearchParams({ q: query, limit: '30', filter: 'buyingOptions:{FIXED_PRICE}' });
  const response = await fetch(`${API_BASE}/buy/browse/v1/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_FR', 'Accept-Language': 'fr-FR', Accept: 'application/json' },
    signal: AbortSignal.timeout(12000)
  });
  const raw = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = response.status === 403
      ? 'L’API Browse eBay n’est pas autorisée pour cette application. Vérifie ton accès Production auprès d’eBay.'
      : `Impossible de récupérer les annonces eBay (erreur ${response.status}).`;
    const err = new Error('Browse error'); err.friendly = msg; throw err;
  }
  const items = (raw.itemSummaries || []).map(simplifyItem).filter(Boolean).filter(item => item.currency === 'EUR' && item.url.startsWith('https://'));
  const prices = items.map(i => i.price);
  const data = {
    mode: 'live', query, total: Number(raw.total || 0), sampleSize: prices.length,
    medianPrice: median(prices), minPrice: prices.length ? Math.min(...prices) : null,
    updatedAt: new Date().toISOString(), items,
    disclaimer: 'Prix demandés sur des annonces actives, pas volumes de recherches ni prix des ventes réalisées.'
  };
  searchCache.set(key, { data, until: Date.now() + 5 * 60 * 1000 });
  if (searchCache.size > 100) searchCache.delete(searchCache.keys().next().value);
  return data;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // Certaines navigations locales n'envoient pas Origin.
  try { return new URL(origin).origin === new URL(BASE_URL).origin; } catch { return false; }
}
function serveStatic(req, res, url) {
  const route = url.pathname === '/' ? '/index.html' : url.pathname;
  const relative = decodeURIComponent(route);
  if (!/^\/[a-zA-Z0-9/_ .-]+$/.test(relative) || relative.includes('..')) return json(res, 404, { error: 'Fichier introuvable' });
  const file = path.resolve(root, '.' + relative);
  if (!file.startsWith(root + path.sep)) return json(res, 403, { error: 'Accès refusé' });
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: 'Fichier introuvable' });
    const ext = path.extname(file);
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://i.ebayimg.com data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'" });
    res.end(data);
  });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE_URL);
    const sess = session(req, res);
    if (url.pathname === '/api/status' && req.method === 'GET') {
      return json(res, 200, { configured, loginConfigured, connected: Boolean(sess.refreshToken || sess.userToken), username: sess.username || null, sandbox: SANDBOX, market: 'EBAY_FR' });
    }
    if (url.pathname === '/auth/ebay' && req.method === 'GET') {
      if (!loginConfigured) return go(res, '/?notice=config');
      sess.oauthState = makeId(); sess.oauthStartedAt = Date.now();
      const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: RUNAME, response_type: 'code', scope: SCOPE_IDENTITY, state: sess.oauthState, locale: 'fr-FR' });
      return go(res, `${AUTH_BASE}/oauth2/authorize?${params}`);
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      const correct = url.searchParams.get('state') && sess.oauthState && url.searchParams.get('state') === sess.oauthState && (Date.now() - sess.oauthStartedAt) < 10 * 60_000;
      delete sess.oauthState; delete sess.oauthStartedAt;
      if (!correct || url.searchParams.has('error')) return go(res, '/?notice=oauth');
      const code = url.searchParams.get('code');
      if (!code) return go(res, '/?notice=oauth');
      try {
        const data = await ebayToken({ grant_type: 'authorization_code', code, redirect_uri: RUNAME });
        sess.userToken = data.access_token;
        sess.userTokenUntil = Date.now() + Number(data.expires_in || 3600) * 1000;
        sess.refreshToken = data.refresh_token || null;
        try { await refreshProfile(sess); } catch { sess.username = 'Compte eBay'; }
        return go(res, '/?notice=connected');
      } catch { return go(res, '/?notice=oauth'); }
    }
    if (url.pathname === '/api/disconnect' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Origine non autorisée' });
      delete sess.userToken; delete sess.userTokenUntil; delete sess.refreshToken; delete sess.username;
      return json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/search' && req.method === 'GET') {
      if (!configured) return json(res, 503, { error: 'Clés eBay absentes : le tableau de bord est en mode démonstration.' });
      const query = cleanQuery(url.searchParams.get('q'));
      if (query.length < 2) return json(res, 400, { error: 'Indique au moins deux caractères.' });
      try { return json(res, 200, await searchEbay(query)); }
      catch (e) { return json(res, 502, { error: safeError(e) }); }
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return json(res, 404, { error: 'Adresse inconnue' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Méthode non autorisée' });
    return serveStatic(req, res, url);
  } catch (err) {
    console.error('[eBay Radar]', err.message);
    if (!res.headersSent) json(res, 500, { error: 'Erreur serveur' }); else res.end();
  }
});
setInterval(() => { for (const [id, sess] of sessions) if (sess.expires < Date.now()) sessions.delete(id); }, 3600_000).unref();
if (require.main === module) server.listen(PORT, () => console.log(`eBay Radar disponible sur ${BASE_URL} — ${configured ? 'API configurée' : 'DÉMONSTRATION'}`));
module.exports = { server };
