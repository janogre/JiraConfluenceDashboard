import { test } from 'node:test';
import assert from 'node:assert/strict';

const { MODEL, getAnthropicKey, callAnthropic, extractJson, responseText } =
  await import('../src/lib/anthropic.js');

test('getAnthropicKey leser env, ellers null', () => {
  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(getAnthropicKey(), null);
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  assert.equal(getAnthropicKey(), 'sk-test');
});

test('callAnthropic bygger riktig request og returnerer status+data', async () => {
  let calledUrl, calledOpts;
  const fakeFetch = async (url, opts) => {
    calledUrl = url;
    calledOpts = opts;
    return { status: 200, json: async () => ({ content: [{ type: 'text', text: 'hei' }] }) };
  };
  const { status, data } = await callAnthropic(
    'sk-test',
    { max_tokens: 800, system: 'du er hjelpsom', messages: [{ role: 'user', content: 'x' }] },
    fakeFetch,
  );
  assert.equal(status, 200);
  assert.equal(data.content[0].text, 'hei');
  assert.equal(calledUrl, 'https://api.anthropic.com/v1/messages');
  assert.equal(calledOpts.headers['x-api-key'], 'sk-test');
  assert.equal(calledOpts.headers['anthropic-version'], '2023-06-01');
  const sent = JSON.parse(calledOpts.body);
  assert.equal(sent.model, MODEL);
  assert.equal(sent.max_tokens, 800);
  assert.equal(sent.system, 'du er hjelpsom');
  assert.deepEqual(sent.messages, [{ role: 'user', content: 'x' }]);
});

test('callAnthropic utelater system når det ikke er satt', async () => {
  let sent;
  const fakeFetch = async (_u, opts) => {
    sent = JSON.parse(opts.body);
    return { status: 200, json: async () => ({}) };
  };
  await callAnthropic('k', { max_tokens: 100, messages: [] }, fakeFetch);
  assert.equal('system' in sent, false);
});

test('extractJson fjerner ```json-innpakking og parser', () => {
  const r = extractJson('```json\n{"a":1}\n```');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { a: 1 });
});

test('extractJson på ugyldig JSON returnerer ok:false', () => {
  const r = extractJson('ikke json');
  assert.equal(r.ok, false);
  assert.equal(r.raw, 'ikke json');
});

test('responseText henter content[0].text, ellers tom streng', () => {
  assert.equal(responseText({ content: [{ text: 'abc' }] }), 'abc');
  assert.equal(responseText({}), '');
  assert.equal(responseText(null), '');
});
