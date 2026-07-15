import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test';
process.env.ATLASSIAN_CLIENT_ID = 'cid';
process.env.OAUTH_REDIRECT_URI = 'https://x.no/api/auth/callback';

const {
  buildAuthorizeUrl, resolveAuth, buildAuthStatus, ensureFreshToken, AuthError,
} = await import('../src/lib/atlassianAuth.js');

test('buildAuthorizeUrl inneholder state, client_id, redirect_uri og scope', () => {
  const url = buildAuthorizeUrl('s123');
  assert.match(url, /^https:\/\/auth\.atlassian\.com\/authorize\?/);
  const q = new URL(url).searchParams;
  assert.equal(q.get('state'), 's123');
  assert.equal(q.get('client_id'), 'cid');
  assert.equal(q.get('redirect_uri'), 'https://x.no/api/auth/callback');
  assert.ok(q.get('scope').includes('offline_access'));
});

test('resolveAuth apikey → Basic-header', async () => {
  const r = await resolveAuth({ authMode: 'apikey', apiKeyEmail: 'a@b.no', apiKeyToken: 'tok' });
  assert.equal(r.authHeader, 'Basic ' + Buffer.from('a@b.no:tok').toString('base64'));
  assert.equal(r.refreshed, false);
});

test('resolveAuth oauth med gyldig token → Bearer uten fornyelse', async () => {
  const s = { authMode: 'oauth', accessToken: 'AT', tokenExpiresAt: Date.now() + 100000 };
  const r = await resolveAuth(s);
  assert.equal(r.authHeader, 'Bearer AT');
  assert.equal(r.refreshed, false);
});

test('resolveAuth uten session og uten env → AuthError', async () => {
  delete process.env.ATLASSIAN_EMAIL;
  await assert.rejects(() => resolveAuth(null), (e) => e instanceof AuthError);
});

test('ensureFreshToken fornyer utløpt token via injisert fetch', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ access_token: 'NEW', expires_in: 3600, refresh_token: 'R2' }),
  });
  const s = { authMode: 'oauth', accessToken: 'OLD', refreshToken: 'R1', tokenExpiresAt: Date.now() - 1000 };
  const { session, refreshed } = await ensureFreshToken(s, fakeFetch);
  assert.equal(session.accessToken, 'NEW');
  assert.equal(session.refreshToken, 'R2');
  assert.equal(refreshed, true);
});

test('buildAuthStatus for oauth returnerer status med availableClouds', () => {
  const st = buildAuthStatus({ authMode: 'oauth', accessToken: 'x', cloudId: 'c', cloudName: 'n', availableClouds: [] });
  assert.deepEqual(st, { authenticated: true, authMode: 'oauth', cloudId: 'c', cloudName: 'n', availableClouds: [] });
});

test('buildAuthStatus uten auth returnerer authenticated:false', () => {
  delete process.env.ATLASSIAN_EMAIL;
  assert.deepEqual(buildAuthStatus(null), { authenticated: false });
});
