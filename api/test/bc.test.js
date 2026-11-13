import { test } from 'node:test';
import assert from 'node:assert/strict';

const { handleBc, bcError } = await import('../src/lib/bc/handler.js');

test('handleBc ukjent ressurs → 404', async () => {
  const r = await handleBc('tull', new URLSearchParams());
  assert.equal(r.status, 404);
});

test('handleBc item-ledger-entries uten itemNumber → 400', async () => {
  const r = await handleBc('item-ledger-entries', new URLSearchParams());
  assert.equal(r.status, 400);
});

test('bcError mapper auth/nettverk/generelt riktig', () => {
  assert.equal(bcError({ status: 401, message: 'x' }, 'ctx').status, 401);
  assert.equal(bcError({ isAuthError: true, message: 'x' }, 'ctx').status, 401);
  assert.equal(bcError({ code: 'ENOTFOUND', message: 'x' }, 'ctx').status, 503);
  assert.equal(bcError({ name: 'AbortError', message: 'x' }, 'ctx').status, 503);
  assert.equal(bcError({ status: 500, message: 'x' }, 'ctx').status, 500);
});
