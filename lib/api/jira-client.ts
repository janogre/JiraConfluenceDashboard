import { config } from "@/lib/config"

/**
 * Jira API Client
 * Handles all interactions with the Jira REST API
 */

export class JiraClient {
  private baseUrl: string
  private auth: string

  constructor() {
    this.baseUrl = config.jira.baseUrl
    // Create base64 encoded auth string: email:apiToken
    this.auth = Buffer.from(
      `${config.jira.email}:${config.jira.apiToken}`
    ).toString("base64")
  }

  /**
   * Make a request to the Jira API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/rest/api/3/${endpoint}`

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
        `Jira API error: ${response.status} ${response.statusText} - ${error}`
      )
    }

    return response.json()
  }

  /**
   * Get current user information
   */
  async getCurrentUser() {
    return this.request("myself")
  }

  /**
   * Search for issues using JQL
   */
  async searchIssues(jql: string, options?: {
    startAt?: number
    maxResults?: number
    fields?: string[]
  }) {
    const params = new URLSearchParams({
      jql,
      startAt: options?.startAt?.toString() || "0",
      maxResults: options?.maxResults?.toString() || "50",
    })

    if (options?.fields) {
      params.append("fields", options.fields.join(","))
    }

    return this.request(`search?${params.toString()}`)
  }

  /**
   * Get a specific issue by key or ID
   */
  async getIssue(issueIdOrKey: string) {
    return this.request(`issue/${issueIdOrKey}`)
  }

  /**
   * Create a new issue
   */
  async createIssue(issueData: any) {
    return this.request("issue", {
      method: "POST",
      body: JSON.stringify(issueData),
    })
  }

  /**
   * Update an issue
   */
  async updateIssue(issueIdOrKey: string, updateData: any) {
    return this.request(`issue/${issueIdOrKey}`, {
      method: "PUT",
      body: JSON.stringify(updateData),
    })
  }

  /**
   * Get comments for an issue
   */
  async getComments(issueIdOrKey: string) {
    return this.request(`issue/${issueIdOrKey}/comment`)
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueIdOrKey: string, body: string) {
    return this.request(`issue/${issueIdOrKey}/comment`, {
      method: "POST",
      body: JSON.stringify({ body }),
    })
  }

  /**
   * Get all projects
   */
  async getProjects() {
    return this.request("project")
  }
}

// Export a singleton instance
export const jiraClient = new JiraClient()
