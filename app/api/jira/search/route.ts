import { NextRequest, NextResponse } from "next/server"
import { jiraClient } from "@/lib/api/jira-client"
import { validateConfig } from "@/lib/config"

export async function GET(request: NextRequest) {
  try {
    // Validate configuration
    if (!validateConfig()) {
      return NextResponse.json(
        { error: "Jira API credentials not configured" },
        { status: 500 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const jql = searchParams.get("jql") || "assignee = currentUser() ORDER BY updated DESC"
    const startAt = parseInt(searchParams.get("startAt") || "0")
    const maxResults = parseInt(searchParams.get("maxResults") || "50")

    const results = await jiraClient.searchIssues(jql, {
      startAt,
      maxResults,
      fields: ["summary", "status", "priority", "assignee", "updated", "created"],
    })

    return NextResponse.json(results)
  } catch (error) {
    console.error("Error searching Jira issues:", error)
    return NextResponse.json(
      { error: "Failed to search issues" },
      { status: 500 }
    )
  }
}
