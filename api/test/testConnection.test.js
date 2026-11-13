import { test } from 'node:test';
import assert from 'node:assert/strict';

// testConnection.js registrerer en Azure Function ved import (app.http) og krever derfor
// @azure/functions. Når node_modules ikke er installert (rene enhetstester på Node-innebygde
// moduler) hopper vi over disse casene i stedet for å velte hele suiten.
let mod = null;
try {
  mod = await import('../src/functions/testConnection.js');
} catch {
  mod = null;
}
const skip = mod ? false : '@azure/functions ikke tilgjengelig';
const isAllowedAtlassianTarget = mod?.isAllowedAtlassianTarget;

test('godtar HTTPS mot api.atlassian.com (oauth /myself)', { skip }, () => {
  assert.equal(
    isAllowedAtlassianTarget('https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/myself'),
    true,
  );
});

test('godtar HTTPS mot atlassian.net-apex og subdomener', { skip }, () => {
  assert.equal(isAllowedAtlassianTarget('https://neas.atlassian.net/rest/api/3/myself'), true);
  assert.equal(isAllowedAtlassianTarget('https://atlassian.net/'), true);
});

test('avviser interne mål og ikke-HTTPS (SSRF-orakel)', { skip }, () => {
  assert.equal(isAllowedAtlassianTarget('http://169.254.169.254/'), false);
  assert.equal(isAllowedAtlassianTarget('http://neas.atlassian.net/'), false); // krever https
  assert.equal(isAllowedAtlassianTarget('https://localhost/'), false);
  assert.equal(isAllowedAtlassianTarget('https://10.0.0.5/'), false);
  assert.equal(isAllowedAtlassianTarget('file:///etc/passwd'), false);
  assert.equal(isAllowedAtlassianTarget('ikke-en-url'), false);
});

test('avviser suffiks-/prefiks-omgåelser av allowlisten', { skip }, () => {
  assert.equal(isAllowedAtlassianTarget('https://evil-atlassian.net/'), false);
  assert.equal(isAllowedAtlassianTarget('https://atlassian.net.evil.com/'), false);
  assert.equal(isAllowedAtlassianTarget('https://api.atlassian.com.evil.com/'), false);
});

test('avviser userinfo-/vert-triks (bruker hostname, ikke host)', { skip }, () => {
  assert.equal(isAllowedAtlassianTarget('https://api.atlassian.com@evil.com/'), false);
  assert.equal(isAllowedAtlassianTarget('https://neas.atlassian.net@evil.com/'), false);
});
