import { getApi, getConfluenceBaseUrl } from './api';
import type { ConfluencePage, ConfluenceSpace, ConfluenceTask } from '../types';

interface ConfluenceApiPage {
  id: string;
  title: string;
  type?: string;
  space?: {
    key: string;
    name?: string;
  };
  _links: {
    webui: string;
    base?: string;
  };
  version?: {
    when: string;
    by?: {
      displayName: string;
      accountId?: string;
      username?: string;
      profilePicture?: {
        path: string;
      };
    };
  };
  body?: {
    storage?: {
      value: string;
    };
    excerpt?: {
      value: string;
    };
  };
  excerpt?: string;
  childTypes?: {
    page?: {
      value: boolean;
    };
  };
}

interface ConfluenceApiSpace {
  key: string;
  name: string;
  description?: {
    plain?: {
      value: string;
    };
  };
  _links: {
    webui: string;
    base?: string;
  };
}

function mapPage(apiPage: ConfluenceApiPage, baseUrl: string, fallbackSpaceKey?: string): ConfluencePage {
  const linkedBase = apiPage._links.base || baseUrl;
  const isFolder = apiPage.type === 'folder';
  return {
    id: apiPage.id,
    title: apiPage.title,
    type: (apiPage.type as 'page' | 'blogpost' | 'folder') || 'page',
    spaceKey: apiPage.space?.key || fallbackSpaceKey || '',
    spaceName: apiPage.space?.name,
    url: `${linkedBase}${apiPage._links.webui}`,
    lastModified: apiPage.version?.when || '',
    lastModifiedBy: apiPage.version?.by
      ? {
          id: apiPage.version.by.accountId ?? apiPage.version.by.username,
          displayName: apiPage.version.by.displayName,
          avatarUrl: apiPage.version.by.profilePicture
            ? `${linkedBase}${apiPage.version.by.profilePicture.path}`
            : undefined,
        }
      : undefined,
    excerpt: apiPage.excerpt || apiPage.body?.excerpt?.value,
    // Folders can contain pages or other folders — always treat as expandable
    hasChildren: isFolder ? true : apiPage.childTypes?.page?.value,
  };
}

function mapSpace(apiSpace: ConfluenceApiSpace, baseUrl: string): ConfluenceSpace {
  const linkedBase = apiSpace._links.base || baseUrl;
  return {
    key: apiSpace.key,
    name: apiSpace.name,
    description: apiSpace.description?.plain?.value,
    url: `${linkedBase}${apiSpace._links.webui}`,
  };
}

export async function getSpaces(): Promise<ConfluenceSpace[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();
  const allSpaces: ConfluenceApiSpace[] = [];
  let start = 0;
  const limit = 50;

  while (true) {
    const response = await api.get<{ results: ConfluenceApiSpace[]; size: number }>(
      `${baseUrl}/wiki/rest/api/space`,
      {
        params: { limit, start, expand: 'description.plain' },
      }
    );
    allSpaces.push(...response.data.results);
    if (response.data.results.length < limit) break;
    start += limit;
  }

  return allSpaces.map((space) => mapSpace(space, baseUrl));
}

export async function getSpace(spaceKey: string): Promise<ConfluenceSpace> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();
  const response = await api.get<ConfluenceApiSpace>(
    `${baseUrl}/wiki/rest/api/space/${spaceKey}`,
    {
      params: {
        expand: 'description.plain',
      },
    }
  );
  return mapSpace(response.data, baseUrl);
}

export async function getPages(spaceKey?: string): Promise<ConfluencePage[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();

  const params: Record<string, string | number> = {
    limit: 50,
    expand: 'space,version,body.excerpt',
  };

  if (spaceKey) {
    params.spaceKey = spaceKey;
  }

  const response = await api.get<{ results: ConfluenceApiPage[] }>(
    `${baseUrl}/wiki/rest/api/content`,
    { params }
  );

  return response.data.results.map((page) => mapPage(page, baseUrl));
}

export async function getPage(pageId: string): Promise<ConfluencePage> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();
  const response = await api.get<ConfluenceApiPage>(
    `${baseUrl}/wiki/rest/api/content/${pageId}`,
    {
      params: {
        expand: 'space,version,body.storage,body.excerpt',
      },
    }
  );
  return mapPage(response.data, baseUrl);
}

export async function searchPages(searchText: string, spaceKey?: string): Promise<ConfluencePage[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();

  let cql = `type=page AND (title ~ "${searchText}" OR text ~ "${searchText}")`;
  if (spaceKey) {
    cql += ` AND space = "${spaceKey}"`;
  }

  const response = await api.get<{ results: ConfluenceApiPage[]; _links: { base?: string } }>(
    `${baseUrl}/wiki/rest/api/content/search`,
    {
      params: {
        cql,
        limit: 50,
        expand: 'space,version,body.excerpt',
      },
    }
  );
  const linkedBase = response.data._links?.base || baseUrl;
  return response.data.results.map((page) => mapPage(page, linkedBase));
}

export async function getRecentPages(limit: number = 20, spaceKey?: string): Promise<ConfluencePage[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();

  let cql = 'type=page';
  if (spaceKey) {
    cql += ` AND space = "${spaceKey}"`;
  }
  cql += ' ORDER BY lastModified DESC';

  const response = await api.get<{ results: ConfluenceApiPage[]; _links: { base?: string } }>(
    `${baseUrl}/wiki/rest/api/content/search`,
    {
      params: {
        cql,
        limit,
        expand: 'space,version,body.excerpt',
      },
    }
  );
  const linkedBase = response.data._links?.base || baseUrl;
  return response.data.results.map((page) => mapPage(page, linkedBase));
}

export async function getPagesByAuthor(
  authorId: string,
  spaceKey?: string,
  limit = 30
): Promise<ConfluencePage[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();

  let cql = `type=page AND lastModifier = "${authorId}"`;
  if (spaceKey) {
    cql += ` AND space = "${spaceKey}"`;
  }
  cql += ' ORDER BY lastModified DESC';

  const response = await api.get<{ results: ConfluenceApiPage[]; _links: { base?: string } }>(
    `${baseUrl}/wiki/rest/api/content/search`,
    {
      params: {
        cql,
        limit,
        expand: 'space,version,body.excerpt',
      },
    }
  );
  const linkedBase = response.data._links?.base || baseUrl;
  return response.data.results.map((page) => mapPage(page, linkedBase));
}

export async function getSpaceHomePage(spaceKey: string): Promise<ConfluencePage> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();
  const response = await api.get<{
    key: string;
    name: string;
    _links: { base?: string; webui: string };
    homepage: ConfluenceApiPage;
  }>(`${baseUrl}/wiki/rest/api/space/${spaceKey}`, {
    params: {
      expand: 'homepage,homepage.version,homepage.childTypes.page',
    },
  });
  const { _links, key, name, homepage } = response.data;
  const linkedBase = _links.base || baseUrl;
  if (!homepage.space) {
    homepage.space = { key, name };
  }
  return mapPage(homepage, linkedBase, key);
}

export async function getChildPages(pageId: string): Promise<ConfluencePage[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();
  // Use CQL parent= to get ALL child types (pages, folders, blogposts)
  const response = await api.get<{ results: ConfluenceApiPage[]; _links: { base?: string } }>(
    `${baseUrl}/wiki/rest/api/content/search`,
    {
      params: {
        cql: `parent=${pageId}`,
        limit: 100,
        expand: 'version,space,childTypes.page',
      },
    }
  );
  // Use _links.base from the response (includes /wiki), falling back to baseUrl
  const linkedBase = response.data._links?.base || baseUrl;
  return response.data.results.map((page) => mapPage(page, linkedBase));
}

export async function findPageByTitle(
  title: string,
  spaceKey: string
): Promise<ConfluencePage | null> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();

  const cql = `type=page AND title = "${title}" AND space = "${spaceKey}"`;

  const response = await api.get<{ results: ConfluenceApiPage[]; _links: { base?: string } }>(
    `${baseUrl}/wiki/rest/api/content/search`,
    {
      params: {
        cql,
        limit: 1,
        expand: 'space,version',
      },
    }
  );
  const linkedBase = response.data._links?.base || baseUrl;
  const results = response.data.results;
  return results.length > 0 ? mapPage(results[0], linkedBase) : null;
}

// Actual shape returned by /wiki/rest/api/inlinetasks/search
interface ConfluenceApiTaskRaw {
  globalId: number;
  id: number;
  contentId: number;       // page ID – no title/URL in the task response
  status: 'complete' | 'incomplete';
  body: string;            // Confluence storage-format HTML
  creator?: string;        // raw accountId string
  assignee?: string;       // raw accountId string
  createDate: number;
  dueDate?: number;
}

function cleanTaskBody(body: string): string {
  return body
    .replace(/<ac:link>[\s\S]*?<\/ac:link>/g, '')   // strip user-mention markup
    .replace(/<time[^>]*\/?>/g, '')                  // strip <time> tags
    .replace(/<\/time>/g, '')
    .replace(/<[^>]+>/g, '')                         // strip remaining HTML tags
    .replace(/\s+/g, ' ')
    .trim();
}

export async function getInlineTasks(
  spaceKey?: string,
  status: 'complete' | 'incomplete' = 'incomplete',
  limit = 50
): Promise<ConfluenceTask[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();

  const params: Record<string, string | number> = { status, limit };
  if (spaceKey) params.spaceKey = spaceKey;

  const response = await api.get<{ results: ConfluenceApiTaskRaw[] }>(
    `${baseUrl}/wiki/rest/api/inlinetasks/search`,
    { params }
  );
  const rawTasks = response.data.results;
  if (rawTasks.length === 0) return [];

  // Collect unique accountIds and contentIds
  const accountIds = new Set<string>();
  const contentIds = new Set<string>();
  rawTasks.forEach((t) => {
    if (t.assignee) accountIds.add(t.assignee);
    if (t.creator) accountIds.add(t.creator);
    contentIds.add(String(t.contentId));
  });

  // Fetch users and page info in parallel
  const [usersMap, pagesMap] = await Promise.all([
    // One request per unique user (typically very few)
    (async () => {
      const map = new Map<string, { displayName: string; accountId: string }>();
      await Promise.all([...accountIds].map(async (accountId) => {
        try {
          const res = await api.get<{ accountId: string; displayName: string }>(
            `${baseUrl}/wiki/rest/api/user`,
            { params: { accountId } }
          );
          if (res.data.displayName) {
            map.set(accountId, { displayName: res.data.displayName, accountId });
          }
        } catch { /* skip unknown user */ }
      }));
      return map;
    })(),
    // One CQL batch call for all pages
    (async () => {
      const map = new Map<string, { title: string; url: string; spaceKey: string }>();
      try {
        const cql = `id in (${[...contentIds].join(',')})`;
        const res = await api.get<{ results: ConfluenceApiPage[]; _links: { base?: string } }>(
          `${baseUrl}/wiki/rest/api/content/search`,
          { params: { cql, limit: contentIds.size, expand: 'space' } }
        );
        const linkedBase = res.data._links?.base || baseUrl;
        res.data.results.forEach((page) => {
          map.set(page.id, {
            title: page.title,
            url: `${linkedBase}${page._links.webui}`,
            spaceKey: page.space?.key || '',
          });
        });
      } catch { /* pages stay empty */ }
      return map;
    })(),
  ]);

  return rawTasks.map((t) => {
    const page = pagesMap.get(String(t.contentId));
    return {
      globalId: t.globalId,
      id: t.id,
      pageId: String(t.contentId),
      pageTitle: page?.title ?? String(t.contentId),
      pageUrl: page?.url ?? '',
      spaceKey: page?.spaceKey ?? '',
      body: cleanTaskBody(t.body),
      status: t.status,
      createdDate: t.createDate,
      dueDate: t.dueDate,
      creator: t.creator ? usersMap.get(t.creator) : undefined,
      assignee: t.assignee ? usersMap.get(t.assignee) : undefined,
    };
  });
}

export async function getPagesLinkedToIssue(issueKey: string): Promise<ConfluencePage[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();

  // Search for pages that mention the issue key
  const cql = `type=page AND text ~ "${issueKey}"`;

  const response = await api.get<{ results: ConfluenceApiPage[] }>(
    `${baseUrl}/wiki/rest/api/content/search`,
    {
      params: {
        cql,
        limit: 20,
        expand: 'space,version,body.excerpt',
      },
    }
  );

  return response.data.results.map((page) => ({
    ...mapPage(page, baseUrl),
    linkedIssues: [issueKey],
  }));
}
