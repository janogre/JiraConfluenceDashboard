# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A React-based project management dashboard that integrates with Jira and Confluence APIs. Provides project overview, task management from Jira, Confluence page navigation, a custom Kanban board, and a private todo list.

## Commands

```bash
# Development - starts both proxy server and Vite dev server
npm start

# Run only the Vite dev server (port 5173)
npm run dev

# Run only the proxy server (port 3001)
npm run proxy

# Build for production
npm run build

# Lint
npm run lint

# Preview production build
npm run preview
```

## Architecture

### Proxy Server Pattern
All Atlassian API requests go through a local Express proxy server (`server/proxy.js` on port 3001) to avoid CORS issues. The frontend sends requests to the proxy with `X-Target-URL` header containing the actual Atlassian endpoint.

### State Management
- **Zustand stores** with localStorage persistence for local-only data:
  - `src/store/kanbanStore.ts` - Kanban columns and cards
  - `src/store/todoStore.ts` - Private todo items
- **TanStack Query** for server state (Jira/Confluence API data)

### Data Flow
1. API configuration (credentials) stored in localStorage via `src/services/api.ts`
2. Service layer (`src/services/jiraService.ts`, `src/services/confluenceService.ts`) handles API calls and transforms Atlassian responses to app types
3. Components use TanStack Query hooks for fetching, Zustand hooks for local state

### Key Integrations
- Kanban cards can link to Jira issues (`linkedJiraIssue`)
- Todo items can link to both Kanban cards and Jira issues
- Confluence pages can be searched by Jira issue key to find related documentation

### Type Definitions
All shared types are in `src/types/index.ts` - includes Jira types (Project, Issue, Status, etc.), Confluence types (Page, Space), and local types (KanbanColumn, KanbanCard, TodoItem, ApiConfig).

## Tech Stack
- React 19 with TypeScript
- Vite for bundling
- react-router-dom for routing
- @hello-pangea/dnd for drag-and-drop (Kanban)
- Axios for HTTP requests
- CSS Modules for styling
