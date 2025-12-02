import { NextRequest, NextResponse } from "next/server"
import { confluenceClient } from "@/lib/api/confluence-client"
import { validateConfig } from "@/lib/config"

export async function GET(request: NextRequest) {
  try {
    // Validate configuration
    if (!validateConfig()) {
      return NextResponse.json(
        { error: "Confluence API credentials not configured" },
        { status: 500 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const spaceKey = searchParams.get("spaceKey") || undefined
    const type = searchParams.get("type") || "page"
    const start = parseInt(searchParams.get("start") || "0")
    const limit = parseInt(searchParams.get("limit") || "25")

    const content = await confluenceClient.getContent({
      spaceKey,
      type,
      start,
      limit,
    })

    return NextResponse.json(content)
  } catch (error) {
    console.error("Error fetching Confluence content:", error)
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    )
  }
}
