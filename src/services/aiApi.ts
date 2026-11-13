// Klient mot den frittstående AI Function App-en (Plan 2). Basis-URL og function-key
// injiseres ved build via Vite-miljøvariabler. Ingen Anthropic-nøkkel sendes fra klienten —
// den bor server-side i AI-appen.
const AI_API_BASE = import.meta.env.VITE_AI_API_BASE ?? '';
const AI_FUNCTION_KEY = import.meta.env.VITE_AI_FUNCTION_KEY ?? '';

// POST mot et AI-endepunkt. Returnerer rå Response slik at hvert kallsted beholder
// sin egen svarhåndtering. Legger på x-functions-key og Content-Type.
export function aiFetch(endpoint: string, body: unknown): Promise<Response> {
  return fetch(`${AI_API_BASE}/api/ai/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-functions-key': AI_FUNCTION_KEY,
    },
    body: JSON.stringify(body),
  });
}
