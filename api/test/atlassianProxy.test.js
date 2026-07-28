import { test } from 'node:test';
import assert from 'node:assert/strict';

const { forwardToAtlassian } = await import('../src/lib/atlassianProxy.js');

function fakeResponse({ status = 200, json, text, contentType = 'application/json', location }) {
  return {
    status,
    headers: {
      get: (h) => (h === 'content-type' ? contentType : h === 'location' ? location : null),
    },
    json: async () => json,
    text: async () => text,
  };
}

test('forwardToAtlassian slår sammen query (dropper _) og returnerer JSON', async () => {
  let calledUrl;
  const fetchFn = async (u) => {
    calledUrl = u;
    return fakeResponse({ status: 200, json: { ok: true } });
  };
  const query = new URLSearchParams('maxResults=50&_=123');
  const r = await forwardToAtlassian(
    { method: 'GET', targetUrl: 'https://api.atlassian.com/x', query, bodyText: '', authHeader: 'Bearer T' },
    fetchFn,
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.jsonBody, { ok: true });
  assert.ok(calledUrl.includes('maxResults=50'));
  assert.ok(!calledUrl.includes('_=123'));
});

test('forwardToAtlassian gjør 3xx om til 401 med redirectTo', async () => {
  const fetchFn = async () => fakeResponse({ status: 302, location: 'https://login' });
  const r = await forwardToAtlassian(
    { method: 'GET', targetUrl: 'https://neas.atlassian.net/y', query: new URLSearchParams(), bodyText: '', authHeader: 'Basic z' },
    fetchFn,
  );
  assert.equal(r.status, 401);
  assert.equal(r.jsonBody.redirectTo, 'https://login');
});

test('forwardToAtlassian sender body kun for ikke-GET', async () => {
  let sentBody;
  const fetchFn = async (_u, opts) => {
    sentBody = opts.body;
    return fakeResponse({ status: 201, json: { created: true } });
  };
  await forwardToAtlassian(
    { method: 'POST', targetUrl: 'https://neas.atlassian.net/y', query: new URLSearchParams(), bodyText: '{"a":1}', authHeader: 'Bearer T' },
    fetchFn,
  );
  assert.equal(sentBody, '{"a":1}');
});

test('forwardToAtlassian sender IKKE body for GET', async () => {
  let sentOpts;
  const fetchFn = async (_u, opts) => {
    sentOpts = opts;
    return fakeResponse({ status: 200, json: {} });
  };
  await forwardToAtlassian(
    { method: 'GET', targetUrl: 'https://neas.atlassian.net/y', query: new URLSearchParams(), bodyText: 'skal-ignoreres', authHeader: 'Bearer T' },
    fetchFn,
  );
  assert.equal(sentOpts.body, undefined);
});

test('forwardToAtlassian avviser mål utenfor allowlisten med 400 og fetcher ikke', async () => {
  const disallowed = [
    'http://api.atlassian.com/x',        // ikke https
    'https://169.254.169.254/latest',    // intern/link-local host
    'https://attacker.example/',         // fremmed host
    'https://evil-atlassian.net/x',      // suffiks-bypass-forsøk
    'https://atlassian.net.evil.com/x',  // suffiks-bypass-forsøk
  ];
  for (const targetUrl of disallowed) {
    let called = false;
    const fetchFn = async () => { called = true; return fakeResponse({ status: 200, json: {} }); };
    const r = await forwardToAtlassian(
      { method: 'GET', targetUrl, query: new URLSearchParams(), bodyText: '', authHeader: 'Bearer T' },
      fetchFn,
    );
    assert.equal(r.status, 400, `skulle avvise ${targetUrl}`);
    assert.equal(called, false, `skulle ikke fetche ${targetUrl}`);
  }
});

test('forwardToAtlassian tillater api.atlassian.com og subdomener av atlassian.net', async () => {
  const allowed = ['https://api.atlassian.com/x', 'https://neas.atlassian.net/x', 'https://atlassian.net/x'];
  for (const targetUrl of allowed) {
    let called = false;
    const fetchFn = async () => { called = true; return fakeResponse({ status: 200, json: { ok: true } }); };
    const r = await forwardToAtlassian(
      { method: 'GET', targetUrl, query: new URLSearchParams(), bodyText: '', authHeader: 'Bearer T' },
      fetchFn,
    );
    assert.equal(called, true, `skulle fetche ${targetUrl}`);
    assert.equal(r.status, 200);
  }
});
