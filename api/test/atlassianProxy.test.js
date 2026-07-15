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
    { method: 'GET', targetUrl: 'https://x/y', query: new URLSearchParams(), bodyText: '', authHeader: 'Basic z' },
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
    { method: 'POST', targetUrl: 'https://x/y', query: new URLSearchParams(), bodyText: '{"a":1}', authHeader: 'Bearer T' },
    fetchFn,
  );
  assert.equal(sentBody, '{"a":1}');
});
