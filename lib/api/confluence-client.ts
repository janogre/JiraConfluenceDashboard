import { config } from "@/lib/config"

/**
 * Confluence API Client
 * Handles all interactions with the Confluence REST API
 */

export class ConfluenceClient {
  private baseUrl: string
  private auth: string

  constructor() {
    this.baseUrl = config.confluence.baseUrl
    // Create base64 encoded auth string: email:apiToken
    this.auth = Buffer.from(
      `${config.confluence.email}:${config.confluence.apiToken}`
    ).toString("base64")
  }

  /**
   * Make a request to the Confluence API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/rest/api/${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Basic ${this.auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(
        `Confluence API error: ${response.status} ${response.statusText} - ${error}`
      )
    }

    return response.json()
  }

  /**
   * Get current user information
   */
  async getCurrentUser() {
    return this.request("user/current")
  }

  /**
   * Get all spaces
   */
  async getSpaces(options?: { limit?: number; start?: number }) {
    const params = new URLSearchParams({
      limit: options?.limit?.toString() || "25",
      start: options?.start?.toString() || "0",
    })

    return this.request(`space?${params.toString()}`)
  }

  /**
   * Get content (pages) from a space
   */
  async getContent(options?: {
    spaceKey?: string
    type?: string
    limit?: number
    start?: number
  }) {
    const params = new URLSearchParams({
      limit: options?.limit?.toString() || "25",
      start: options?.start?.toString() || "0",
    })

    if (options?.spaceKey) {
      params.append("spaceKey", options.spaceKey)
    }
    if (options?.type) {
      params.append("type", options.type)
    }

    return this.request(`content?${params.toString()}`)
  }

  /**
   * Get a specific page by ID
   */
  async getPage(pageId: string, expand?: string[]) {
    const params = expand ? `?expand=${expand.join(",")}` : ""
    return this.request(`content/${pageId}${params}`)
  }

  /**
   * Create a new page
   */
  async createPage(pageData: {
    type: string
    title: string
    space: { key: string }
    body: { storage: { value: string; representation: string } }
    ancestors?: Array<{ id: string }>
  }) {
    return this.request("content", {
      method: "POST",
      body: JSON.stringify(pageData),
    })
  }

  /**
   * Update a page
   */
  async updatePage(pageId: string, updateData: any) {
    return this.request(`content/${pageId}`, {
      method: "PUT",
      body: JSON.stringify(updateData),
    })
  }

  /**
   * Search for content
   */
  async search(cql: string, options?: {
    limit?: number
    start?: number
  }) {
    const params = new URLSearchParams({
      cql,
      limit: options?.limit?.toString() || "25",
      start: options?.start?.toString() || "0",
    })

    return this.request(`content/search?${params.toString()}`)
  }
}

// Export a singleton instance
export const confluenceClient = new ConfluenceClient()
