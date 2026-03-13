import { getApi, getJiraBaseUrl } from './api';
import type { JiraProject, JiraIssue, JiraIssueLink, JiraSubtask, JiraStatus, JiraComment, JiraWorklog, JiraFilter, JiraUser, JiraSprint } from '../types';

// Atlassian Document Format type
interface AdfDocument {
  type: string;
  version?: number;
  content?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      marks?: Array<{ type: string }>;
    }>;
  }>;
}

interface JiraApiIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string | AdfDocument;
    status: {
      id: string;
      name: string;
      statusCategory: {
        key: string;
      };
    };
    priority?: {
      id: string;
      name: string;
      iconUrl?: string;
    };
    assignee?: {
      displayName: string;
      avatarUrls?: {
        '48x48'?: string;
      };
    };
    reporter?: {
      displayName: string;
      avatarUrls?: {
        '48x48'?: string;
      };
    };
    project: {
      key: string;
    };
    issuetype: {
      id: string;
      name: string;
      iconUrl?: string;
    };
    created: string;
    updated: string;
    duedate?: string;
    resolutiondate?: string;
    labels?: string[];
    subtasks?: Array<{
      id: string;
      key: string;
      fields: {
        summary: string;
        status: {
          name: string;
          statusCategory: { key: string };
        };
        issuetype: { name: string; iconUrl?: string };
      };
    }>;
    startDate?: string;
    customfield_10015?: string; // Startdato i Jira Cloud (alternativt feltnøkkel)
    issuelinks?: Array<{
      id: string;
      type: { name: string; inward: string; outward: string };
      inwardIssue?: {
        key: string;
        fields: {
          summary: string;
          status: { name: string; statusCategory: { key: string } };
          issuetype: { name: string; iconUrl?: string };
        };
      };
      outwardIssue?: {
        key: string;
        fields: {
          summary: string;
          status: { name: string; statusCategory: { key: string } };
          issuetype: { name: string; iconUrl?: string };
        };
      };
    }>;
    parent?: {
      key: string;
      fields: {
        summary: string;
        issuetype?: { name: string; iconUrl?: string };
      };
    };
  };
}

interface JiraApiProject {
  id: string;
  key: string;
  name: string;
  description?: string;
  lead?: {
    displayName: string;
    avatarUrls?: {
      '48x48'?: string;
    };
  };
  avatarUrls?: {
    '48x48'?: string;
  };
}

// Module-level cache for all discovered start date field keys (array, or null if discovery ran but found nothing)
let _startDateFieldKeys: string[] | null | undefined = undefined;

export function resetFieldDiscoveryCache(): void {
  _startDateFieldKeys = undefined;
}

async function discoverStartDateFieldKeys(): Promise<void> {
  if (_startDateFieldKeys !== undefined) return;
  try {
    const api = getApi();
    const baseUrl = getJiraBaseUrl();
    const response = await api.get<Array<{
      id: string;
      name: string;
      schema?: { type?: string; system?: string; custom?: string };
    }>>(`${baseUrl}/rest/api/3/field`);

    const startDateNames = new Set(['start date', 'startdato', 'start dato']);
    const fields = response.data.filter(
      (f) =>
        startDateNames.has(f.name.toLowerCase()) &&
        f.schema?.type === 'date'
    );
    _startDateFieldKeys = fields.length > 0 ? fields.map((f) => f.id) : null;
  } catch {
    _startDateFieldKeys = null;
  }
}

function mapStatusCategory(key: string): 'new' | 'indeterminate' | 'done' {
  switch (key) {
    case 'new':
      return 'new';
    case 'done':
      return 'done';
    default:
      return 'indeterminate';
  }
}

// Convert ADF (Atlassian Document Format) to plain text
function adfToText(adf: AdfDocument | string | undefined): string | undefined {
  if (!adf) return undefined;
  if (typeof adf === 'string') return adf;

  if (!adf.content) return undefined;

  const extractText = (content: AdfDocument['content']): string => {
    if (!content) return '';
    return content
      .map((block) => {
        if (block.content) {
          return block.content
            .map((inline) => inline.text || '')
            .join('');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  };

  const text = extractText(adf.content);
  return text || undefined;
}

function mapIssue(apiIssue: JiraApiIssue): JiraIssue {
  return {
    id: apiIssue.id,
    key: apiIssue.key,
    summary: apiIssue.fields.summary,
    description: adfToText(apiIssue.fields.description),
    status: {
      id: apiIssue.fields.status.id,
      name: apiIssue.fields.status.name,
      category: mapStatusCategory(apiIssue.fields.status.statusCategory.key),
    },
    priority: apiIssue.fields.priority
      ? {
          id: apiIssue.fields.priority.id,
          name: apiIssue.fields.priority.name,
          iconUrl: apiIssue.fields.priority.iconUrl,
        }
      : undefined,
    assignee: apiIssue.fields.assignee
      ? {
          displayName: apiIssue.fields.assignee.displayName,
          avatarUrl: apiIssue.fields.assignee.avatarUrls?.['48x48'],
        }
      : undefined,
    reporter: apiIssue.fields.reporter
      ? {
          displayName: apiIssue.fields.reporter.displayName,
          avatarUrl: apiIssue.fields.reporter.avatarUrls?.['48x48'],
        }
      : undefined,
    projectKey: apiIssue.fields.project.key,
    issueType: {
      id: apiIssue.fields.issuetype.id,
      name: apiIssue.fields.issuetype.name,
      iconUrl: apiIssue.fields.issuetype.iconUrl,
    },
    created: apiIssue.fields.created,
    updated: apiIssue.fields.updated,
    dueDate: apiIssue.fields.duedate,
    startDate: (() => {
      const raw = apiIssue.fields as unknown as Record<string, string | undefined>;
      if (apiIssue.fields.startDate) return apiIssue.fields.startDate;
      if (apiIssue.fields.customfield_10015) return apiIssue.fields.customfield_10015;
      for (const key of (_startDateFieldKeys ?? [])) {
        if (raw[key]) return raw[key];
      }
      return undefined;
    })(),
    resolutionDate: apiIssue.fields.resolutiondate,
    labels: apiIssue.fields.labels || [],
    subtasks: apiIssue.fields.subtasks?.map((s): JiraSubtask => ({
      id: s.id,
      key: s.key,
      summary: s.fields.summary,
      status: {
        name: s.fields.status.name,
        category: mapStatusCategory(s.fields.status.statusCategory.key),
      },
      issueType: {
        name: s.fields.issuetype.name,
        iconUrl: s.fields.issuetype.iconUrl,
      },
    })),
    parent: apiIssue.fields.parent ? {
      key: apiIssue.fields.parent.key,
      summary: apiIssue.fields.parent.fields.summary,
      issueType: apiIssue.fields.parent.fields.issuetype,
    } : undefined,
    links: apiIssue.fields.issuelinks?.map((link): JiraIssueLink => ({
      id: link.id,
      type: link.type,
      inwardIssue: link.inwardIssue ? {
        key: link.inwardIssue.key,
        summary: link.inwardIssue.fields.summary,
        status: {
          name: link.inwardIssue.fields.status.name,
          category: mapStatusCategory(link.inwardIssue.fields.status.statusCategory.key),
        },
        issueType: link.inwardIssue.fields.issuetype,
      } : undefined,
      outwardIssue: link.outwardIssue ? {
        key: link.outwardIssue.key,
        summary: link.outwardIssue.fields.summary,
        status: {
          name: link.outwardIssue.fields.status.name,
          category: mapStatusCategory(link.outwardIssue.fields.status.statusCategory.key),
        },
        issueType: link.outwardIssue.fields.issuetype,
      } : undefined,
    })),
  };
}

function mapProject(apiProject: JiraApiProject): JiraProject {
  return {
    id: apiProject.id,
    key: apiProject.key,
    name: apiProject.name,
    description: apiProject.description,
    lead: apiProject.lead
      ? {
          displayName: apiProject.lead.displayName,
          avatarUrl: apiProject.lead.avatarUrls?.['48x48'],
        }
      : undefined,
    avatarUrl: apiProject.avatarUrls?.['48x48'],
  };
}

export async function getProjects(): Promise<JiraProject[]> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<JiraApiProject[]>(`${baseUrl}/rest/api/3/project`);
  return response.data.map(mapProject);
}

export async function getProject(projectKey: string): Promise<JiraProject> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<JiraApiProject>(`${baseUrl}/rest/api/3/project/${projectKey}`);
  return mapProject(response.data);
}

const ISSUE_FIELDS = [
  'summary', 'description', 'status', 'priority', 'assignee', 'reporter',
  'project', 'issuetype', 'created', 'updated', 'duedate', 'resolutiondate',
  'labels', 'subtasks', 'startDate', 'customfield_10015', 'parent', 'issuelinks',
];

function buildIssueFields(): string[] {
  const fields = [...ISSUE_FIELDS];
  for (const key of (_startDateFieldKeys ?? [])) {
    if (!fields.includes(key)) fields.push(key);
  }
  return fields;
}

export async function getIssues(projectKey?: string, jql?: string, fetchAll = false): Promise<JiraIssue[]> {
  await discoverStartDateFieldKeys();
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const fieldsParam = buildIssueFields().join(',');

  let query = jql || '';
  if (projectKey && !jql) {
    query = `project = "${projectKey}" ORDER BY updated DESC`;
  }

  const pageSize = 100;
  const fields = fieldsParam.split(',');

  const fetchPage = (nextPageToken?: string) => {
    const body: Record<string, unknown> = { jql: query, maxResults: pageSize, fields };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    return api.post<{ issues: JiraApiIssue[]; nextPageToken?: string }>(
      `${baseUrl}/rest/api/3/search/jql`,
      body
    );
  };

  if (!fetchAll) {
    const response = await fetchPage();
    return response.data.issues.map(mapIssue);
  }

  // Paginate using cursor-based nextPageToken
  const allIssues: JiraApiIssue[] = [];
  let nextPageToken: string | undefined;

  while (true) {
    const response = await fetchPage(nextPageToken);
    const { issues, nextPageToken: next } = response.data;
    allIssues.push(...issues);
    nextPageToken = next;
    if (!nextPageToken || issues.length === 0) break;
  }

  return allIssues.map(mapIssue);
}

export async function getIssue(issueKey: string): Promise<JiraIssue> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<JiraApiIssue>(
    `${baseUrl}/rest/api/3/issue/${issueKey}`,
    {
      params: {
        fields: 'summary,description,status,priority,assignee,reporter,project,issuetype,created,updated,duedate,resolutiondate,labels',
      },
    }
  );
  return mapIssue(response.data);
}

export async function getProjectStatuses(projectKey: string): Promise<JiraStatus[]> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<Array<{ statuses: Array<{ id: string; name: string; statusCategory: { key: string } }> }>>(
    `${baseUrl}/rest/api/3/project/${projectKey}/statuses`
  );

  const statusMap = new Map<string, JiraStatus>();
  response.data.forEach((issueType) => {
    issueType.statuses.forEach((status) => {
      if (!statusMap.has(status.id)) {
        statusMap.set(status.id, {
          id: status.id,
          name: status.name,
          category: mapStatusCategory(status.statusCategory.key),
        });
      }
    });
  });

  return Array.from(statusMap.values());
}

export async function transitionIssue(issueKey: string, transitionId: string): Promise<void> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  await api.post(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
    transition: { id: transitionId },
  });
}

export async function getTransitions(issueKey: string): Promise<Array<{ id: string; name: string; to: { id: string; name: string; statusCategoryKey: string } }>> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<{
    transitions: Array<{
      id: string;
      name: string;
      to: { id: string; name: string; statusCategory?: { key: string } };
    }>;
  }>(`${baseUrl}/rest/api/3/issue/${issueKey}/transitions`);
  return response.data.transitions.map((t) => ({
    id: t.id,
    name: t.name,
    to: {
      id: t.to.id,
      name: t.to.name,
      statusCategoryKey: t.to.statusCategory?.key ?? 'indeterminate',
    },
  }));
}

export async function assignIssue(issueKey: string, accountId: string | null): Promise<void> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  await api.put(`${baseUrl}/rest/api/3/issue/${issueKey}/assignee`, {
    accountId,
  });
}

export async function searchIssues(searchText: string): Promise<JiraIssue[]> {
  // Escape special characters in search text for JQL
  const escapedText = searchText.replace(/"/g, '\\"');
  const jql = `summary ~ "${escapedText}" OR description ~ "${escapedText}" ORDER BY updated DESC`;
  return getIssues(undefined, jql);
}

// Get current user
export async function getCurrentUser(): Promise<JiraUser> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<{
    accountId: string;
    displayName: string;
    emailAddress?: string;
    avatarUrls?: { '48x48'?: string };
    active: boolean;
  }>(`${baseUrl}/rest/api/3/myself`);

  return {
    accountId: response.data.accountId,
    displayName: response.data.displayName,
    emailAddress: response.data.emailAddress,
    avatarUrl: response.data.avatarUrls?.['48x48'],
    active: response.data.active,
  };
}

// Get child issues of a parent issue
export async function getChildIssues(parentKey: string): Promise<JiraIssue[]> {
  return getIssues(undefined, `parent = "${parentKey}" ORDER BY key ASC`);
}

// Get issues assigned to current user
export async function getMyIssues(): Promise<JiraIssue[]> {
  return getIssues(undefined, 'assignee = currentUser() AND resolution = EMPTY ORDER BY updated DESC');
}

// Get issues the user is watching
export async function getWatchedIssues(): Promise<JiraIssue[]> {
  return getIssues(undefined, 'watcher = currentUser() ORDER BY updated DESC');
}

// Get user's favorite/starred filters
export async function getFavoriteFilters(): Promise<JiraFilter[]> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<Array<{
    id: string;
    name: string;
    description?: string;
    jql: string;
    owner: {
      displayName: string;
      avatarUrls?: { '48x48'?: string };
    };
    favourite: boolean;
  }>>(`${baseUrl}/rest/api/3/filter/favourite`);

  return response.data.map((filter) => ({
    id: filter.id,
    name: filter.name,
    description: filter.description,
    jql: filter.jql,
    owner: {
      displayName: filter.owner.displayName,
      avatarUrl: filter.owner.avatarUrls?.['48x48'],
    },
    favourite: filter.favourite,
  }));
}

// Get comments for an issue
export async function getIssueComments(issueKey: string): Promise<JiraComment[]> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<{
    comments: Array<{
      id: string;
      body: string | { type: string; content: Array<{ type: string; content?: Array<{ text?: string }> }> };
      author: {
        displayName: string;
        avatarUrls?: { '48x48'?: string };
      };
      created: string;
      updated: string;
    }>;
  }>(`${baseUrl}/rest/api/3/issue/${issueKey}/comment`);

  return response.data.comments.map((comment) => ({
    id: comment.id,
    body: typeof comment.body === 'string'
      ? comment.body
      : extractTextFromAdf(comment.body),
    author: {
      displayName: comment.author.displayName,
      avatarUrl: comment.author.avatarUrls?.['48x48'],
    },
    created: comment.created,
    updated: comment.updated,
  }));
}

// Helper to extract text from Atlassian Document Format (ADF)
function extractTextFromAdf(adf: { type: string; content?: Array<{ type: string; content?: Array<{ text?: string }> }> }): string {
  if (!adf.content) return '';

  return adf.content
    .map((block) => {
      if (block.content) {
        return block.content
          .map((inline) => inline.text || '')
          .join('');
      }
      return '';
    })
    .join('\n');
}

// Get worklog for an issue
export async function getIssueWorklog(issueKey: string): Promise<JiraWorklog[]> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const response = await api.get<{
    worklogs: Array<{
      id: string;
      author: {
        displayName: string;
        avatarUrls?: { '48x48'?: string };
      };
      comment?: string | { type: string; content: Array<{ type: string; content?: Array<{ text?: string }> }> };
      started: string;
      timeSpent: string;
      timeSpentSeconds: number;
    }>;
  }>(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog`);

  return response.data.worklogs.map((worklog) => ({
    id: worklog.id,
    author: {
      displayName: worklog.author.displayName,
      avatarUrl: worklog.author.avatarUrls?.['48x48'],
    },
    comment: worklog.comment
      ? (typeof worklog.comment === 'string' ? worklog.comment : extractTextFromAdf(worklog.comment))
      : undefined,
    started: worklog.started,
    timeSpent: worklog.timeSpent,
    timeSpentSeconds: worklog.timeSpentSeconds,
  }));
}

// Add worklog to an issue
export async function addWorklog(
  issueKey: string,
  timeSpent: string,
  started: string,
  comment?: string
): Promise<void> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  await api.post(`${baseUrl}/rest/api/3/issue/${issueKey}/worklog`, {
    timeSpent,
    started,
    comment: comment ? {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
    } : undefined,
  });
}

// Get sprints for a project (via its Scrum board)
export async function getSprints(projectKey: string): Promise<JiraSprint[]> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const boardsResponse = await api.get<{
    values: Array<{ id: number; name: string; type: string }>;
  }>(`${baseUrl}/rest/agile/1.0/board`, { params: { projectKeyOrId: projectKey } });

  const board =
    boardsResponse.data.values.find((b) => b.type === 'scrum') ??
    boardsResponse.data.values[0];
  if (!board) return [];

  const sprintsResponse = await api.get<{
    values: Array<{
      id: number;
      name: string;
      state: string;
      startDate?: string;
      endDate?: string;
      goal?: string;
    }>;
  }>(`${baseUrl}/rest/agile/1.0/board/${board.id}/sprint`, { params: { maxResults: 50 } });

  return sprintsResponse.data.values.map((s) => ({
    id: s.id,
    name: s.name,
    state: s.state as 'active' | 'closed' | 'future',
    startDate: s.startDate,
    endDate: s.endDate,
    goal: s.goal,
  }));
}

// Get issues for a specific sprint
export async function getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
  await discoverStartDateFieldKeys();
  const api = getApi();
  const baseUrl = getJiraBaseUrl();
  const fieldsParam = buildIssueFields().join(',');
  const response = await api.get<{ issues: JiraApiIssue[] }>(
    `${baseUrl}/rest/agile/1.0/sprint/${sprintId}/issue`,
    { params: { fields: fieldsParam, maxResults: 500 } }
  );
  return response.data.issues.map(mapIssue);
}

// Run a filter by ID
export async function runFilter(filterId: string): Promise<JiraIssue[]> {
  const api = getApi();
  const baseUrl = getJiraBaseUrl();

  // First get the filter to get its JQL
  const filterResponse = await api.get<{ jql: string }>(`${baseUrl}/rest/api/3/filter/${filterId}`);

  // Then run the JQL
  return getIssues(undefined, filterResponse.data.jql);
}
