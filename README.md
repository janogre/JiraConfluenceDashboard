# Jira & Confluence Dashboard

A user-friendly project management tool that integrates with Jira and Confluence APIs. Features include project overview, task management, Confluence pages, a personal Kanban board, and a private todo list.

## Features

### Project Overview (Dashboard)
- View statistics for projects, issues, pages, and todos
- See recent Jira issues updated in the last 7 days
- Browse recent Confluence pages
- Quick access to active todos

### Jira Integration
- Browse all Jira projects
- View and search issues within projects
- See issue details: status, priority, assignee, reporter, labels
- **My Issues** - View issues assigned to you
- **Watched Issues** - View issues you're watching
- **Favorite Filters** - Run your saved Jira filters
- **Comments** - View comments on issues
- **Time Tracking** - View logged time on issues
- Direct links to open issues in Jira

### Confluence Integration
- Browse Confluence spaces
- Search pages across spaces
- View page excerpts and metadata
- Direct links to open pages in Confluence

### Kanban Board
- Personal Kanban board with drag-and-drop cards
- Customizable columns (default: Backlog, To Do, In Progress, Review, Done)
- Link cards to Jira issues
- Add due dates and labels to cards
- Optional mapping to Jira statuses

### Private Todo List
- Create personal todos with priorities (Low, Medium, High)
- Set due dates for todos
- Link todos to Kanban cards
- Link todos to Jira issues
- Track completion status

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Jira/Confluence Cloud account with API access

### Installation

```bash
# Install dependencies
npm install

# Start both proxy server and frontend (recommended)
npm start
```

**Important**: The app requires a local proxy server to communicate with Atlassian APIs due to CORS restrictions. Use `npm start` to run both the proxy and frontend together.

### Configuration

1. Start the application and navigate to **Settings**
2. Enter your Jira/Confluence credentials:
   - **Jira Base URL**: `https://your-domain.atlassian.net`
   - **Confluence Base URL**: Same as Jira URL for Atlassian Cloud (optional)
   - **Email**: Your Atlassian account email
   - **API Token**: Generated from [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens)

### Getting an API Token

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a name (e.g., "Dashboard App")
4. Copy the token and paste it in the Settings page

## Architecture

The app uses a local proxy server to bypass CORS restrictions when communicating with Atlassian APIs:

```
Browser (localhost:5173)
    ↓
Proxy Server (localhost:3001)
    ↓
Atlassian Cloud APIs
```

The proxy server:
- Runs on port 3001
- Forwards requests to Atlassian with proper authentication
- Adds CORS headers to allow browser requests

## Project Structure

```
├── server/
│   └── proxy.js         # Express proxy server for Atlassian API
├── src/
│   ├── components/
│   │   ├── Layout/      # Main layout with sidebar navigation
│   │   └── common/      # Reusable UI components (Button, Card, Input, etc.)
│   ├── pages/
│   │   ├── Dashboard/   # Main dashboard with overview stats
│   │   ├── Projects/    # Jira projects and issues view
│   │   ├── Confluence/  # Confluence spaces and pages view
│   │   ├── Kanban/      # Personal Kanban board
│   │   ├── Todos/       # Private todo list
│   │   └── Settings/    # API configuration
│   ├── services/
│   │   ├── api.ts       # API configuration and axios setup
│   │   ├── jiraService.ts   # Jira API integration
│   │   └── confluenceService.ts # Confluence API integration
│   ├── store/
│   │   ├── kanbanStore.ts   # Kanban board state (Zustand)
│   │   └── todoStore.ts     # Todo list state (Zustand)
│   ├── types/
│   │   └── index.ts     # TypeScript type definitions
│   └── App.tsx          # Main app with routing
```

## Technology Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **React Router** - Client-side routing
- **TanStack Query** - Data fetching and caching
- **Zustand** - State management
- **@hello-pangea/dnd** - Drag and drop for Kanban
- **Axios** - HTTP client
- **Lucide React** - Icons

## Available Scripts

```bash
# Development (recommended - runs both proxy and frontend)
npm start          # Start proxy server + dev server

# Individual servers
npm run dev        # Start frontend dev server only
npm run proxy      # Start proxy server only

# Building
npm run build      # Build for production

# Linting
npm run lint       # Run ESLint

# Preview
npm run preview    # Preview production build
```

## Data Storage

- **API Configuration**: Stored in localStorage (`jira-confluence-config`)
- **Kanban Board**: Stored in localStorage (`kanban-storage`)
- **Todo List**: Stored in localStorage (`todo-storage`)

All local data persists between sessions.

## API Endpoints Used

### Jira REST API v3
- `GET /rest/api/3/project` - List projects
- `GET /rest/api/3/project/{key}` - Get project details
- `POST /rest/api/3/search/jql` - Search issues (JQL) - *New endpoint, replaces deprecated `/rest/api/3/search`*
- `GET /rest/api/3/issue/{key}` - Get issue details
- `GET /rest/api/3/myself` - Get current user
- `GET /rest/api/3/filter/favourite` - Get favorite filters
- `GET /rest/api/3/filter/{id}` - Get filter details
- `GET /rest/api/3/issue/{key}/comment` - Get issue comments
- `GET /rest/api/3/issue/{key}/worklog` - Get issue worklog
- `POST /rest/api/3/issue/{key}/worklog` - Add worklog entry
- `GET /rest/api/3/project/{key}/statuses` - Get project statuses
- `GET /rest/api/3/issue/{key}/transitions` - Get available transitions
- `POST /rest/api/3/issue/{key}/transitions` - Transition issue

### Confluence REST API
- `GET /wiki/rest/api/space` - List spaces
- `GET /wiki/rest/api/space/{key}` - Get space details
- `GET /wiki/rest/api/content` - List pages
- `GET /wiki/rest/api/content/{id}` - Get page details
- `GET /wiki/rest/api/content/search` - Search pages (CQL)

## JQL Queries Used

The app uses the following JQL queries to fetch issues:

| Query | Description |
|-------|-------------|
| `assignee = currentUser() AND resolution = EMPTY` | My open issues |
| `watcher = currentUser()` | Issues I'm watching |
| `updated >= -7d` | Recently updated issues |
| `project = "KEY"` | Issues in a specific project |

You can also use your own saved filters from Jira, which are displayed in the Dashboard under "Favorite Filters".

## License

Private project - All rights reserved
