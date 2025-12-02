# CLAUDE.MD - Jira Confluence Dashboard

## Project Overview

This is a dashboard application that integrates with Jira and Confluence to provide unified visibility and reporting capabilities.

## Project Purpose

A comprehensive dashboard for managing and visualizing Jira issues and Confluence content in a unified interface, enabling teams to track work, documentation, and metrics efficiently.

## Project Structure

```
JiraConfluenceDashboard/
├── src/                    # Source code
│   ├── components/        # React/UI components
│   ├── services/          # API integration services
│   ├── utils/             # Utility functions
│   └── types/             # TypeScript type definitions
├── tests/                 # Test files
├── public/                # Static assets
└── docs/                  # Documentation
```

## Tech Stack

### Frontend
- Framework: [To be determined - React/Vue/Angular]
- Language: TypeScript/JavaScript
- State Management: [To be determined]
- UI Library: [To be determined]

### Backend
- Runtime: [To be determined - Node.js/Python/etc.]
- API Integration: Jira REST API, Confluence REST API

### Development Tools
- Package Manager: npm/yarn/pnpm
- Testing: Jest/Vitest/Mocha
- Linting: ESLint
- Formatting: Prettier

## Key Features

### Jira Integration
- Issue tracking and visualization
- Sprint/board views
- Custom JQL queries
- Real-time updates
- Issue creation and editing

### Confluence Integration
- Page browsing and search
- Content display and rendering
- Page linking and references
- Recent updates tracking

### Dashboard Capabilities
- Customizable widgets
- Metrics and analytics
- Team performance tracking
- Custom reports
- Data export functionality

## Development Guidelines

### Code Style
- Use TypeScript for type safety
- Follow consistent naming conventions
- Write self-documenting code
- Keep functions small and focused
- Use meaningful variable names

### API Integration Best Practices
- Implement proper error handling
- Use environment variables for credentials
- Implement rate limiting and retry logic
- Cache responses where appropriate
- Handle authentication securely

### Security Considerations
- Never commit API keys or credentials
- Use environment variables for sensitive data
- Implement proper CORS policies
- Validate and sanitize all inputs
- Use HTTPS for API calls

## Environment Variables

Required environment variables (store in `.env` file):

```
JIRA_BASE_URL=
JIRA_USERNAME=
JIRA_API_TOKEN=
CONFLUENCE_BASE_URL=
CONFLUENCE_USERNAME=
CONFLUENCE_API_TOKEN=
```

## Common Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

## API Integration Notes

### Jira API
- Base URL: `https://your-domain.atlassian.net/rest/api/3/`
- Authentication: Basic Auth (email + API token)
- Rate Limits: Be aware of Atlassian API rate limits
- Documentation: https://developer.atlassian.com/cloud/jira/platform/rest/v3/

### Confluence API
- Base URL: `https://your-domain.atlassian.net/wiki/rest/api/`
- Authentication: Basic Auth (email + API token)
- Rate Limits: Be aware of Atlassian API rate limits
- Documentation: https://developer.atlassian.com/cloud/confluence/rest/v1/

## Common Tasks

### Adding a New Feature
1. Create a feature branch: `git checkout -b feature/feature-name`
2. Implement the feature with tests
3. Update documentation
4. Submit pull request

### Working with Jira API
- Use the `/rest/api/3/search` endpoint for JQL queries
- Implement pagination for large result sets
- Cache frequently accessed data
- Handle API errors gracefully

### Working with Confluence API
- Use `/rest/api/content` for page operations
- Implement proper content rendering
- Handle macros and attachments
- Support version history

## Testing Strategy

### Unit Tests
- Test individual components and functions
- Mock external API calls
- Aim for high code coverage

### Integration Tests
- Test API integrations with mock servers
- Test data flow between components
- Verify error handling

### E2E Tests
- Test critical user flows
- Test with real-like data
- Verify UI interactions

## Deployment

### Prerequisites
- Set up environment variables
- Configure API access
- Set up hosting platform

### Build Process
1. Run tests: `npm test`
2. Build application: `npm run build`
3. Deploy to hosting platform
4. Verify deployment

## Troubleshooting

### Common Issues

**API Authentication Failures**
- Verify API tokens are valid
- Check username/email is correct
- Ensure proper base URL format

**Rate Limiting**
- Implement exponential backoff
- Cache responses when possible
- Consider request batching

**CORS Issues**
- Configure proxy in development
- Set up proper CORS headers in production
- Use backend proxy if needed

## Resources

- [Jira REST API Documentation](https://developer.atlassian.com/cloud/jira/platform/rest/v3/)
- [Confluence REST API Documentation](https://developer.atlassian.com/cloud/confluence/rest/v1/)
- [Atlassian Developer Community](https://community.developer.atlassian.com/)

## Notes for Claude

### When Working on This Project
1. Always check for existing API integration patterns before implementing new ones
2. Follow the established error handling patterns
3. Update tests when modifying features
4. Consider rate limiting when adding new API calls
5. Document complex business logic
6. Keep security best practices in mind

### Common Patterns
- API calls should go through service layer
- Use TypeScript interfaces for API responses
- Implement loading and error states for all async operations
- Use environment variables for configuration

### Before Making Changes
1. Read relevant existing code
2. Understand the data flow
3. Check for existing similar implementations
4. Consider backward compatibility
5. Update tests and documentation

## Project Status

Status: **Initial Setup**

This project is in the initial setup phase. Key next steps:
- [ ] Choose and set up frontend framework
- [ ] Set up project structure
- [ ] Implement Jira API integration
- [ ] Implement Confluence API integration
- [ ] Create basic dashboard UI
- [ ] Set up testing framework
- [ ] Configure CI/CD pipeline
