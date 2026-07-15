let cache = { token: null, expiresAt: 0 };

function assertEnvVars() {
  const missing = ['BC_TENANT_ID', 'BC_CLIENT_ID', 'BC_CLIENT_SECRET'].filter(
    (k) => !process.env[k]
  );
  if (missing.length) {
    throw new Error(`[BC auth] Mangler miljøvariabler: ${missing.join(', ')}`);
  }
}

export async function getBcToken() {
  assertEnvVars();

  if (cache.token && Date.now() < cache.expiresAt) {
    console.log('[BC auth] Cache-treff – gjenbruker token');
    return cache.token;
  }

  console.log('[BC auth] Henter nytt token fra Entra ID');
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.BC_CLIENT_ID,
    client_secret: process.env.BC_CLIENT_SECRET,
    scope: 'https://api.businesscentral.dynamics.com/.default',
  });

  const resp = await fetch(
    `https://login.microsoftonline.com/${process.env.BC_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error('[BC auth] Token-henting feilet:', resp.status, text);
    const err = new Error(`BC token-henting feilet (${resp.status})`);
    err.status = resp.status;
    err.isAuthError = true;
    throw err;
  }

  const data = await resp.json();
  cache.token = data.access_token;
  cache.expiresAt = Date.now() + (data.expires_in - 60) * 1000;
  console.log(`[BC auth] Nytt token cachet, gyldig i ${data.expires_in}s`);
  return cache.token;
}

export function invalidateBcTokenCache() {
  cache = { token: null, expiresAt: 0 };
  console.log('[BC auth] Cache invalidert');
}
