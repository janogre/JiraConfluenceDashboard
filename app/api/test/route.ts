import { NextResponse } from "next/server"
import { jiraClient } from "@/lib/api/jira-client"
import { confluenceClient } from "@/lib/api/confluence-client"
import { validateConfig } from "@/lib/config"

/**
 * Test endpoint to verify Jira and Confluence API connections
 */
export async function GET() {
  const results = {
    config: {
      valid: validateConfig(),
      jiraBaseUrl: process.env.JIRA_BASE_URL || "not set",
      confluenceBaseUrl: process.env.CONFLUENCE_BASE_URL || "not set",
    },
    jira: {
      connected: false,
      user: null as any,
      error: null as any,
    },
    confluence: {
      connected: false,
      user: null as any,
      error: null as any,
    },
  }

  // Test Jira connection
  try {
    const jiraUser = await jiraClient.getCurrentUser()
    results.jira.connected = true
    results.jira.user = {
      displayName: jiraUser.displayName,
      emailAddress: jiraUser.emailAddress,
      accountId: jiraUser.accountId,
    }
  } catch (error) {
    results.jira.error = error instanceof Error ? error.message : String(error)
  }

  // Test Confluence connection
  try {
    const confluenceUser = await confluenceClient.getCurrentUser()
    results.confluence.connected = true
    results.confluence.user = confluenceUser
  } catch (error) {
    results.confluence.error = error instanceof Error ? error.message : String(error)
  }

  return NextResponse.json(results, {
    status: results.jira.connected || results.confluence.connected ? 200 : 500,
  })
}
