import { NextResponse } from "next/server"
import { jiraClient } from "@/lib/api/jira-client"
import { validateConfig } from "@/lib/config"

export async function GET() {
  try {
    // Validate configuration
    if (!validateConfig()) {
      return NextResponse.json(
        { error: "Jira API credentials not configured" },
        { status: 500 }
      )
    }

    const user = await jiraClient.getCurrentUser()
    return NextResponse.json(user)
  } catch (error) {
    console.error("Error fetching Jira user:", error)
    return NextResponse.json(
      { error: "Failed to fetch user information" },
      { status: 500 }
    )
  }
}
