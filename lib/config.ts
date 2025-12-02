/**
 * Application configuration
 * Reads environment variables and provides type-safe access
 */

export const config = {
  jira: {
    baseUrl: process.env.JIRA_BASE_URL || "",
    email: process.env.JIRA_EMAIL || "",
    apiToken: process.env.JIRA_API_TOKEN || "",
  },
  confluence: {
    baseUrl: process.env.CONFLUENCE_BASE_URL || "",
    email: process.env.CONFLUENCE_EMAIL || "",
    apiToken: process.env.CONFLUENCE_API_TOKEN || "",
  },
  nodeEnv: process.env.NODE_ENV || "development",
}

/**
 * Validates that all required environment variables are set
 */
export function validateConfig() {
  const required = [
    "JIRA_BASE_URL",
    "JIRA_EMAIL",
    "JIRA_API_TOKEN",
    "CONFLUENCE_BASE_URL",
    "CONFLUENCE_EMAIL",
    "CONFLUENCE_API_TOKEN",
  ]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    console.warn(
      `⚠️  Missing environment variables: ${missing.join(", ")}\n` +
        `   Please copy .env.example to .env.local and fill in your credentials.`
    )
    return false
  }

  return true
}
