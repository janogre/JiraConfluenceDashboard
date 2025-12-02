# Jira Confluence Dashboard

A modern, unified dashboard for managing Jira issues and Confluence pages. Built with Next.js 15, TypeScript, and Tailwind CSS.

## Features

- 🎯 **Unified Dashboard** - View both Jira issues and Confluence pages in one place
- 🔐 **Secure API Proxy** - All API calls are proxied server-side to protect credentials
- 🎨 **Modern UI** - Built with Shadcn/ui and Tailwind CSS, inspired by Atlassian Design System
- ⚡ **Fast & Responsive** - Next.js 15 with App Router for optimal performance
- 🔍 **Search** - Quick search across both Jira and Confluence
- ✏️ **Edit & Create** - Inline editing for issues and pages (coming soon)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Atlassian account with Jira and Confluence access
- API tokens for Jira and Confluence

### Installation

1. **Clone the repository** (if not already done)
   ```bash
   git clone <your-repo-url>
   cd JiraConfluenceDashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and add your credentials:
   ```env
   JIRA_BASE_URL=https://your-domain.atlassian.net
   JIRA_EMAIL=your-email@example.com
   JIRA_API_TOKEN=your-jira-api-token

   CONFLUENCE_BASE_URL=https://your-domain.atlassian.net/wiki
   CONFLUENCE_EMAIL=your-email@example.com
   CONFLUENCE_API_TOKEN=your-confluence-api-token
   ```

4. **Get API Tokens**

   Visit [Atlassian API Tokens](https://id.atlassian.com/manage-profile/security/api-tokens) to create tokens for Jira and Confluence.

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Test your connection**

   Open [http://localhost:3000/test](http://localhost:3000/test) to verify your API credentials are working.

7. **Access the dashboard**

   Open [http://localhost:3000](http://localhost:3000) to view your dashboard.

## Project Structure

```
JiraConfluenceDashboard/
├── app/                      # Next.js App Router
│   ├── api/                 # API routes (server-side proxies)
│   │   ├── jira/           # Jira API endpoints
│   │   └── confluence/     # Confluence API endpoints
│   ├── dashboard/          # Dashboard pages
│   └── test/               # API test page
├── components/              # React components
│   ├── layout/             # Layout components (Header, Sidebar)
│   └── ui/                 # UI components (Button, Card, Badge)
├── lib/                     # Utility functions and API clients
│   ├── api/                # Jira and Confluence API clients
│   ├── config.ts           # Configuration management
│   └── utils.ts            # Utility functions
└── public/                 # Static assets
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## API Routes

### Jira
- `GET /api/jira/myself` - Get current user information
- `GET /api/jira/search?jql=<query>` - Search issues with JQL

### Confluence
- `GET /api/confluence/myself` - Get current user information
- `GET /api/confluence/content` - Get pages and content

### Testing
- `GET /api/test` - Test API connections

## Development Roadmap

### Phase 1: Foundation ✅
- [x] Next.js 15 setup with TypeScript
- [x] Tailwind CSS and Shadcn/ui configuration
- [x] Base layout (header, sidebar, main area)
- [x] Environment variables structure
- [x] API proxy structure
- [x] API authentication testing

### Phase 2: Jira MVP (In Progress)
- [ ] Display user's Jira issues
- [ ] Issue detail panel
- [ ] Basic filtering
- [ ] Create new issues

### Phase 3: Confluence MVP
- [ ] Display Confluence pages
- [ ] Page viewer
- [ ] Search functionality
- [ ] Create new pages

### Phase 4: Advanced Features
- [ ] Inline editing
- [ ] Rich text editor
- [ ] Drag-and-drop for status changes
- [ ] Advanced search (Cmd+K)
- [ ] Notifications

## Security

- ✅ API credentials are stored server-side only (never exposed to client)
- ✅ All API calls are proxied through Next.js API routes
- ✅ Environment variables are validated on startup
- ✅ `.env.local` is gitignored to prevent credential leaks

## Contributing

See [CLAUDE.MD](./CLAUDE.MD) for detailed development guidelines and architecture documentation.

## License

ISC
