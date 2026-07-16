# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A React-based project management dashboard that integrates with Jira and Confluence APIs for NEAS Energi Telekom. Provides dashboard, Jira board/sprint/timeline views, Confluence page browsing, risk analysis, AI digest, team calendar, personal metrics, project wizard with AI document generation, and a private todo list.

## Language Convention

All code comments, commit messages, UI text, and AI prompts are written in **Norwegian bokmål**.

## Commands

```bash
# Development - starter AI-funcen (ai-api på port 7072) og SWA CLI
# (Vite dev server + managed functions i api/, samlet på http://localhost:4280)
npm start

# Run only the Vite dev server (port 5173, uten SWA CLI / functions)
npm run dev

# Run only AI Function App-en lokalt (port 7072)
npm run dev:ai

# Build for production (runs tsc -b first)
npm run build

# Lint
npm run lint

# Preview production build
npm run preview
```

**NB:** Lokal `swa start` (kjørt via `npm start`/`npm run swa`) krever **Node 20 eller 22** — SWA CLI sin innebygde Core Tools avviser Node 24. `api/` og `ai-api/` kan derimot kjøre uavhengig på Node 24 via `func start` i hver katalog.

## Architecture

### Managed Functions (Atlassian-proxy, auth, Business Central)
Backend for Atlassian-integrasjonen, autentisering og Business Central kjører som managed Azure Functions under Static Web Apps-appen sin `/api`-rute (kildekode i `api/`). Axios-instansen i `src/services/api.ts` intercepter requests: enhver URL som starter med `http` får URL-en flyttet til `X-Target-URL`-headeren og rerutes til `/api/atlassian/proxy`. Auth er Basic (email:apiToken, base64-encodet) eller OAuth. OAuth/innlogging bruker en stateless, kryptert cookie-session (AES-256-GCM) — ingen serverside sesjonslagring. Business Central-endepunktene ligger under samme `/api`-rute.

### AI Function App
AI-endepunktene som kaller Anthropics API (Claude Sonnet 4.6) kjører i en egen, frittstående Function App (kildekode i `ai-api/`), adskilt fra SWA-appens managed functions. Frontend kaller den via `VITE_AI_API_BASE` (+ `x-functions-key`):
- `POST /api/ai/digest` — daily Jira activity summary
- `POST /api/ai/timeline-report` — project status report from timeline issues
- `POST /api/ai/rewrite-meeting` — rewrite meeting notes to structured minutes
- `POST /api/ai/project-documents` — generate project documents (mandate, needs analysis, risk, etc.)
- `POST /api/ai/suggest-subtasks` — suggest Jira subtasks/tasks for a project

Anthropic-nøkkelen (`ANTHROPIC_API_KEY`) ligger server-side som app setting på AI Function App-en — den sendes ikke fra klienten lenger.

### Routing
Single-level flat routes under `<Layout />` in `App.tsx`:
`/` (Dashboard), `/confluence`, `/board`, `/todos`, `/settings`, `/risk`, `/digest`, `/calendar`, `/my-metrics`, `/project-wizard`

### State Management
- **Zustand stores** with localStorage persistence for local-only data:
  - `src/store/kanbanStore.ts` - Kanban columns and cards
  - `src/store/todoStore.ts` - Private todo items
  - `src/store/calendarStore.ts` - Calendar data
- **TanStack Query** (5 min staleTime, 1 retry) for server state (Jira/Confluence API data)

### Data Flow
1. API configuration (credentials) stored in localStorage (`jira-confluence-config`) via `src/services/api.ts`
2. Service layer (`src/services/jiraService.ts`, `src/services/confluenceService.ts`) handles API calls and transforms Atlassian responses to app types
3. Components use TanStack Query hooks for fetching, Zustand hooks for local state

### Key Integrations
- Kanban cards can link to Jira issues (`linkedJiraIssue`)
- Todo items can link to both Kanban cards and Jira issues
- Confluence pages can be searched by Jira issue key to find related documentation
- ProjectWizard creates Jira issues + Confluence pages + remote links in one flow

### Type Definitions
All shared types are in `src/types/index.ts` - includes Jira types (Project, Issue, Status, etc.), Confluence types (Page, Space), and local types (KanbanColumn, KanbanCard, TodoItem, ApiConfig).

## Tech Stack
- React 19 with TypeScript
- Vite for bundling
- react-router-dom for routing
- @hello-pangea/dnd for drag-and-drop (Kanban)
- Axios for HTTP requests
- CSS Modules for styling
- lucide-react for icons
- framer-motion for animations
- html2pdf.js for PDF export
