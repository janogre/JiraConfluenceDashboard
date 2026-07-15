// Ren videresendingslogikk for Atlassian-proxy. Ingen @azure/functions-import.
export async function forwardToAtlassian({ method, targetUrl, query, bodyText, authHeader }, fetchFn = fetch) {
  const url = new URL(targetUrl);
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
