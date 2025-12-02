import { NextResponse } from "next/server"
import { confluenceClient } from "@/lib/api/confluence-client"
import { validateConfig } from "@/lib/config"

export async function GET() {
  try {
    // Validate configuration
    if (!validateConfig()) {
      return NextResponse.json(
        { error: "Confluence API credentials not configured" },
        { status: 500 }
      )
    }

    const user = await confluenceClient.getCurrentUser()
    return NextResponse.json(user)
  } catch (error) {
    console.error("Error fetching Confluence user:", error)
    return NextResponse.json(
      { error: "Failed to fetch user information" },
      { status: 500 }
    )
  }
}
