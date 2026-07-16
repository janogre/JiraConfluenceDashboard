# ai-api/ — Frittstående AI Function App

AI-endepunkter (Anthropic) for dashboardet. Egen, uavhengig deploybar Azure Function App
på eget origin (230s-tak) — atskilt fra `api/` fordi SWA sitt `/api` har et 45s-tak.
Erstatter AI-endepunktene i `server/proxy.js` i produksjon.

## Kjøre lokalt

Krever Node ≥22 (func v4 støtter 22 og 24) og Azure Functions Core Tools v4.

```bash
cd ai-api
npm install
# fyll inn ekte ANTHROPIC_API_KEY i local.settings.json (aldri commit denne fila)
func start
```

Endepunktene betjenes på `http://localhost:7071/api/ai/*`. Lokalt håndhever ikke `func`
function-keys, så endepunktene er kallbare uten `x-functions-key` under lokal utvikling.

## Teste

```bash
cd ai-api
npm test        # kjører node --test på test/*.test.js
```

## Produksjon

- Deployes som en **egen** Function App (ikke via SWA). CORS settes på Function App-en til
  kun SWA-domenet. `ANTHROPIC_API_KEY` og `APPLICATIONINSIGHTS_CONNECTION_STRING` settes som
  app settings. Alle endepunkter har `authLevel: 'function'` (krever `x-functions-key`).
- Detaljert deploy (CI/CD, CORS, domene) dekkes i Plan 3.
