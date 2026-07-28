// Ren videresendingslogikk for Atlassian-proxy. Ingen @azure/functions-import.

// Kun Atlassian-vertene proxyen faktisk trenger — hindrer SSRF og credential-lekkasje via X-Target-URL:
//  - api.atlassian.com: OAuth-modus (getJiraBaseUrl/getConfluenceBaseUrl → /ex/jira|confluence/<cloudId>)
//  - <site>.atlassian.net: apikey-modus (site-base-URL, f.eks. neas.atlassian.net)
const ALLOWED_HOSTS = new Set(['api.atlassian.com']);
const ALLOWED_APEX = 'atlassian.net';

// Kun https og en vert på allowlisten. Suffiks-sjekken krever eksakt apex eller ekte subdomene
// (punktgrense), slik at 'evil-atlassian.net' og 'atlassian.net.evil.com' blir avvist.
function isAllowedAtlassianTarget(url) {
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  return host === ALLOWED_APEX || host.endsWith(`.${ALLOWED_APEX}`);
}

export async function forwardToAtlassian({ method, targetUrl, query, bodyText, authHeader }, fetchFn = fetch) {
  const url = new URL(targetUrl);

  // Valider mål-verten FØR Authorization-headeren settes på og FØR fetch, ellers kan en angriper
  // peke X-Target-URL mot interne verter (SSRF) eller sin egen host (credential-lekkasje).
  if (!isAllowedAtlassianTarget(url)) {
    return { status: 400, jsonBody: { error: 'Ugyldig mål-URL', message: 'X-Target-URL må peke på en tillatt Atlassian-vert over https.' } };
  }

  for (const [key, value] of query.entries()) {
    if (key !== '_') url.searchParams.set(key, value);
  }

  const options = {
    method,
    headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
    redirect: 'manual',
  };
  if (method !== 'GET' && method !== 'HEAD' && bodyText) {
    options.body = bodyText;
  }

  const response = await fetchFn(url.toString(), options);

  if (response.status >= 300 && response.status < 400) {
    return {
      status: 401,
      jsonBody: {
        error: 'Autentiserings-omdirigering oppdaget',
        message: 'Atlassian omdirigerer forespørselen. API-token kan være ugyldig.',
        redirectTo: response.headers.get('location'),
      },
    };
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return { status: response.status, jsonBody: await response.json() };
  }
  return { status: response.status, body: await response.text() };
}
