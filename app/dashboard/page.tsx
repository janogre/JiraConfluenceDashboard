import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, CheckCircle2, AlertCircle } from "lucide-react"

export default function DashboardPage() {
  return (
    <DashboardLayout activeView="unified">
      <div className="p-6 space-y-6">
        {/* Welcome Section */}
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Welcome back!</h2>
          <p className="text-text-subtle mt-1">Here's what's happening with your work</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open Issues</CardTitle>
              <AlertCircle className="h-4 w-4 text-text-subtle" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">12</div>
              <p className="text-xs text-text-subtle">
                3 high priority
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Clock className="h-4 w-4 text-text-subtle" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">5</div>
              <p className="text-xs text-text-subtle">
                2 due this week
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-text-subtle" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">28</div>
              <p className="text-xs text-text-subtle">
                This month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest updates from Jira and Confluence</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-4 pb-4 border-b border-gray-200 last:border-0 last:pb-0">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-status-in-progress text-white text-xs font-semibold">
                  JC
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">JC-123: Implement dashboard layout</p>
                    <Badge variant="in-progress">In Progress</Badge>
                  </div>
                  <p className="text-sm text-text-subtle">
                    Updated 2 hours ago
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 pb-4 border-b border-gray-200 last:border-0 last:pb-0">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-status-todo text-gray-700 text-xs font-semibold">
                  JC
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">JC-124: API integration setup</p>
                    <Badge variant="todo">To Do</Badge>
                    <Badge variant="priority-high">High</Badge>
                  </div>
                  <p className="text-sm text-text-subtle">
                    Created 3 hours ago
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 pb-4 border-b border-gray-200 last:border-0 last:pb-0">
                <div className="flex h-8 w-8 items-center justify-center rounded bg-status-done text-white text-xs font-semibold">
                  JC
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">JC-122: Project setup</p>
                    <Badge variant="done">Done</Badge>
                  </div>
                  <p className="text-sm text-text-subtle">
                    Completed 5 hours ago
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>My Jira Issues</CardTitle>
              <CardDescription>Issues assigned to you</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-subtle">Connect to Jira to see your issues</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Confluence Pages</CardTitle>
              <CardDescription>Pages you've recently viewed</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-text-subtle">Connect to Confluence to see your pages</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
