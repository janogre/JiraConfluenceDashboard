# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A React-based project management dashboard that integrates with Jira and Confluence APIs for NEAS Energi Telekom. Provides dashboard, Jira board/sprint/timeline views, Confluence page browsing, risk analysis, AI digest, team calendar, personal metrics, project wizard with AI document generation, and a private todo list.

## Language Convention

All code comments, commit messages, UI text, and AI prompts are written in **Norwegian bokmål**.

## Commands

```bash
# Development - starts both proxy server and Vite dev server
npm start

# Run only the Vite dev server (port 5173)
npm run dev

# Run only the proxy server (port 3001)
npm run proxy

# Build for production (runs tsc -b first)
npm run build

# Lint
npm run lint

# Preview production build
npm run preview
```

## Architecture

### Proxy Server Pattern
All Atlassian API requests go through a local Express proxy server (`server/proxy.js` on port 3001) to avoid CORS issues. The Axios instance in `src/services/api.ts` intercepts requests: any URL starting with `http` gets its URL moved to the `X-Target-URL` header and the request is rerouted to `/api/atlassian/proxy`. Auth is Basic (email:apiToken, base64-encoded).

### AI Endpoints (proxy server)
The proxy also serves AI endpoints that call Anthropic's API (Claude Sonnet 4.6):
- `POST /api/ai/digest` — daily Jira activity summary
- `POST /api/ai/timeline-report` — project status report from timeline issues
- `POST /api/ai/rewrite-meeting` — rewrite meeting notes to structured minutes
- `POST /api/ai/project-documents` — generate project documents (mandate, needs analysis, risk, etc.)
- `POST /api/ai/suggest-subtasks` — suggest Jira subtasks/tasks for a project

All AI endpoints expect `apiKey` (Anthropic key) in the request body.

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
