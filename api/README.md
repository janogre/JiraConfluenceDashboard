# api/ — Azure Functions-backend

Managed functions for Atlassian-proxy, OAuth/auth og Business Central.
Erstatter `server/proxy.js` + `server/businessCentral/` i produksjon på Azure SWA.

## Kjøre lokalt

Krever Node 22 eller nyere (func v4 støtter Node 22 og 24) og Azure Functions Core Tools v4 (`func --version` → 4.x).

```bash
cd api
npm install
# fyll inn ekte verdier i local.settings.json (aldri commit denne fila)
func start
```

Endepunktene betjenes på `http://localhost:7071/api/*`.

Får du feil om `AzureWebJobsStorage`: installer og kjør Azurite
(`npm i -g azurite && azurite`) eller sett `"AzureWebJobsStorage": "UseDevelopmentStorage=true"`.

## Teste

```bash
cd api
npm test        # kjører node --test på test/*.test.js
```
