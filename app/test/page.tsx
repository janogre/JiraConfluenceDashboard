"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

export default function TestPage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)

  const testConnection = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/test")
      const data = await response.json()
      setResults(data)
    } catch (error) {
      console.error("Test failed:", error)
      setResults({ error: "Failed to connect to test endpoint" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-raised p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">API Connection Test</h1>
          <p className="text-text-subtle mt-2">
            Test your Jira and Confluence API credentials
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Test API Connections</CardTitle>
            <CardDescription>
              Click the button below to test your API credentials
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={testConnection} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                "Run Test"
              )}
            </Button>
          </CardContent>
        </Card>

        {results && (
          <>
            {/* Configuration Status */}
            <Card>
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Environment Variables</span>
                  {results.config?.valid ? (
                    <Badge variant="done" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Valid
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Invalid
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-text-subtle">
                  <div>Jira Base URL: {results.config?.jiraBaseUrl}</div>
                  <div>Confluence Base URL: {results.config?.confluenceBaseUrl}</div>
                </div>
              </CardContent>
            </Card>

            {/* Jira Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Jira Connection
                  {results.jira?.connected ? (
                    <Badge variant="done" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Failed
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.jira?.connected ? (
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium">User: </span>
                      {results.jira.user?.displayName}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Email: </span>
                      {results.jira.user?.emailAddress}
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">Account ID: </span>
                      {results.jira.user?.accountId}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-red-600">
                    <span className="font-medium">Error: </span>
                    {results.jira?.error}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Confluence Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Confluence Connection
                  {results.confluence?.connected ? (
                    <Badge variant="done" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3 w-3" />
                      Failed
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.confluence?.connected ? (
                  <div className="space-y-2">
                    <div className="text-sm">
                      <span className="font-medium">User: </span>
                      {results.confluence.user?.displayName || results.confluence.user?.username}
                    </div>
                    <div className="text-sm text-green-600">
                      Successfully connected to Confluence API
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-red-600">
                    <span className="font-medium">Error: </span>
                    {results.confluence?.error}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Setup Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div>
              <h3 className="font-semibold mb-2">1. Configure Environment Variables</h3>
              <p className="text-text-subtle">
                Copy <code className="bg-gray-100 px-1 py-0.5 rounded">.env.example</code> to{" "}
                <code className="bg-gray-100 px-1 py-0.5 rounded">.env.local</code> and fill in your credentials.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">2. Get Jira API Token</h3>
              <p className="text-text-subtle">
                Visit{" "}
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-atlassian-blue hover:underline"
                >
                  Atlassian API Tokens
                </a>{" "}
                to create a new API token.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">3. Get Confluence API Token</h3>
              <p className="text-text-subtle">
                Use the same API token from Jira, or create a separate one if needed.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">4. Restart Development Server</h3>
              <p className="text-text-subtle">
                After updating <code className="bg-gray-100 px-1 py-0.5 rounded">.env.local</code>,
                restart your Next.js development server for changes to take effect.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
