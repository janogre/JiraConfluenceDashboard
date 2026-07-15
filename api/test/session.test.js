import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'test-hemmelighet-som-er-lang-nok-1234';
const { encrypt, decrypt, sessionCookie, COOKIE_NAME } = await import('../src/lib/session.js');

test('encrypt → decrypt gir tilbake samme objekt', () => {
  const obj = { authMode: 'oauth', accessToken: 'abc', n: 1 };
  assert.deepEqual(decrypt(encrypt(obj)), obj);
});

test('decrypt av tuklet token gir null', () => {
  const token = encrypt({ a: 1 });
  const tampered = (token[0] === 'A' ? 'B' : 'A') + token.slice(1);
  assert.equal(decrypt(tampered), null);
});

test('decrypt av søppel/tomt gir null', () => {
  assert.equal(decrypt('ikke-et-token'), null);
  assert.equal(decrypt(''), null);
  assert.equal(decrypt(null), null);
});

test('sessionCookie har riktig navn og httpOnly', () => {
  const c = sessionCookie({ authMode: 'apikey' });
  assert.equal(c.name, COOKIE_NAME);
  assert.equal(c.httpOnly, true);
  assert.equal(c.sameSite, 'Lax');
});

test('sessionCookie advarer når cookien er over budsjett selv etter trimming', () => {
  const big = {
    authMode: 'oauth',
    accessToken: 'x'.repeat(6000),
    availableClouds: [{ id: '1', name: 'a', url: 'u' }],
  };
  const original = console.warn;
  let warned = false;
  console.warn = () => { warned = true; };
  try {
    const c = sessionCookie(big);
    const stored = decrypt(decodeURIComponent(c.value));
    assert.equal(stored.availableClouds, undefined);
    assert.equal(stored.cloudsTrimmed, true);
    assert.equal(warned, true);
  } finally {
    console.warn = original;
  }
});

test('sessionCookie: trimming bringer en availableClouds-tung cookie under budsjett', () => {
  const manyClouds = Array.from({ length: 200 }, (_, i) => ({
    id: `id-${i}`,
    name: `Sky nummer ${i} med et ganske langt navn`,
    url: `https://sky-${i}.example.com`,
  }));
  const c = sessionCookie({
    authMode: 'oauth',
    accessToken: 'x'.repeat(1200),
    refreshToken: 'y'.repeat(300),
    availableClouds: manyClouds,
  });
  const stored = decrypt(decodeURIComponent(c.value));
  assert.equal(stored.availableClouds, undefined);
  assert.equal(stored.cloudsTrimmed, true);
  assert.ok(c.value.length <= 3900, `cookie skal være under budsjett, var ${c.value.length}`);
});
