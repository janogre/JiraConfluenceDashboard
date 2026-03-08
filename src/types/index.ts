// Jira Types
export interface JiraProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  lead?: {
    displayName: string;
    avatarUrl?: string;
  };
  avatarUrl?: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  description?: string;
  status: {
    id: string;
    name: string;
    category: 'new' | 'indeterminate' | 'done';
  };
  priority?: {
    id: string;
    name: string;
    iconUrl?: string;
  };
  assignee?: {
    displayName: string;
    avatarUrl?: string;
  };
  reporter?: {
    displayName: string;
    avatarUrl?: string;
  };
  projectKey: string;
  issueType: {
    id: string;
    name: string;
    iconUrl?: string;
  };
  created: string;
  updated: string;
  dueDate?: string;
  startDate?: string;
  resolutionDate?: string;
  labels: string[];
  parent?: {
    key: string;
    summary: string;
    issueType?: { name: string; iconUrl?: string };
  };
}

export interface JiraStatus {
  id: string;
  name: string;
  category: 'new' | 'indeterminate' | 'done';
}

export interface JiraComment {
  id: string;
  body: string;
  author: {
    displayName: string;
    avatarUrl?: string;
  };
  created: string;
  updated: string;
}

export interface JiraWorklog {
  id: string;
  author: {
    displayName: string;
    avatarUrl?: string;
  };
  comment?: string;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
}

export interface JiraFilter {
  id: string;
  name: string;
  description?: string;
  jql: string;
  owner: {
    displayName: string;
    avatarUrl?: string;
  };
  favourite: boolean;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
  avatarUrl?: string;
  active: boolean;
}

// Confluence Types
export interface ConfluencePage {
  id: string;
  title: string;
  spaceKey: string;
  spaceName?: string;
  url: string;
  lastModified: string;
  lastModifiedBy?: {
    id?: string;
    displayName: string;
    avatarUrl?: string;
  };
  excerpt?: string;
  linkedIssues?: string[]; // Jira issue keys linked to this page
  hasChildren?: boolean;
  type?: 'page' | 'blogpost' | 'folder';
}

export interface ConfluenceSpace {
  key: string;
  name: string;
  description?: string;
  url: string;
}

// Private Todo Types
export interface TodoItem {
  id: string;
  content: string;
  completed: boolean;
  linkedJiraIssue?: string; // Jira issue key
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

// API Configuration
export interface ApiConfig {
  jiraBaseUrl: string;
  confluenceBaseUrl: string;
  email: string;
  apiToken: string;
}
