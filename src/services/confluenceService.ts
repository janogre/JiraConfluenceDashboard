import { getApi, getConfluenceBaseUrl } from './api';
import type { ConfluencePage, ConfluenceSpace } from '../types';

interface ConfluenceApiPage {
  id: string;
  title: string;
  space: {
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

function mapPage(apiPage: ConfluenceApiPage, baseUrl: string): ConfluencePage {
  const linkedBase = apiPage._links.base || baseUrl;
  return {
    id: apiPage.id,
    title: apiPage.title,
    spaceKey: apiPage.space.key,
    spaceName: apiPage.space.name,
    url: `${linkedBase}${apiPage._links.webui}`,
    lastModified: apiPage.version?.when || '',
    lastModifiedBy: apiPage.version?.by
      ? {
          displayName: apiPage.version.by.displayName,
          avatarUrl: apiPage.version.by.profilePicture
            ? `${linkedBase}${apiPage.version.by.profilePicture.path}`
            : undefined,
        }
      : undefined,
    excerpt: apiPage.excerpt || apiPage.body?.excerpt?.value,
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
  const response = await api.get<{ results: ConfluenceApiSpace[] }>(
    `${baseUrl}/wiki/rest/api/space`,
    {
      params: {
        limit: 50,
        expand: 'description.plain',
      },
    }
  );
  return response.data.results.map((space) => mapSpace(space, baseUrl));
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

  const response = await api.get<{ results: ConfluenceApiPage[] }>(
    `${baseUrl}/wiki/rest/api/content/search`,
    {
      params: {
        cql,
        limit: 50,
        expand: 'space,version,body.excerpt',
      },
    }
  );

  return response.data.results.map((page) => mapPage(page, baseUrl));
}

export async function getRecentPages(limit: number = 20): Promise<ConfluencePage[]> {
  const api = getApi();
  const baseUrl = getConfluenceBaseUrl();

  // Use CQL search to get recent pages, sorted by last modified
  const response = await api.get<{ results: ConfluenceApiPage[] }>(
    `${baseUrl}/wiki/rest/api/content/search`,
    {
      params: {
        cql: 'type=page ORDER BY lastModified DESC',
        limit,
        expand: 'space,version,body.excerpt',
      },
    }
  );

  return response.data.results.map((page) => mapPage(page, baseUrl));
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
