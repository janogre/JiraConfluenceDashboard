// Anthropic-kall + hjelpere. Ingen @azure/functions-import → testbar direkte.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const MODEL = 'claude-sonnet-4-6';

// Server-side nøkkel. Ingen body-/session-nøkkel (spec §8c).
export function getAnthropicKey() {
  return process.env.ANTHROPIC_API_KEY || null;
}

// Kaller Anthropic Messages API. Returnerer { status, data }.
export async function callAnthropic(apiKey, { max_tokens, system, messages }, fetchFn = fetch) {
  const body = { model: MODEL, max_tokens, messages };
  if (system) body.system = system;
  const resp = await fetchFn(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return { status: resp.status, data };
}

// Trekker ut JSON fra et Anthropic-tekstsvar (fjerner ```-innpakking).
export function extractJson(text) {
  const cleaned = String(text ?? '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    return { ok: false, raw: cleaned };
  }
}

// Henter teksten fra et Anthropic-svar (content[0].text).
export function responseText(data) {
  return data?.content?.[0]?.text ?? '';
}
