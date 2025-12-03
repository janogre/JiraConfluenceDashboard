import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, CheckCircle2, AlertCircle, Activity, TrendingUp, Zap, Database, Code } from "lucide-react"

export default function DashboardPage() {
  return (
    <DashboardLayout activeView="unified">
      <div className="p-8 space-y-8">
        {/* Hero Welcome Section with Glitch */}
        <div className="relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
          <div className="pl-6 fade-in-up stagger-1">
            <h2 className="text-5xl font-black text-primary mb-2 tracking-tight">
              COMMAND CENTER
            </h2>
            <p className="font-mono text-sm text-muted-foreground tracking-wide">
              SYSTEM_STATUS &gt; ALL_OPERATIONS_NOMINAL
            </p>
          </div>
        </div>

        {/* Stats Grid with Diagonal Accents */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="group relative overflow-hidden border-2 border-destructive hover:shadow-[0_0_25px_rgba(255,51,102,0.3)] transition-all hover-lift fade-in-up stagger-2">
            <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-br from-destructive/10 to-transparent transform skew-x-[-15deg]"></div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-mono text-xs tracking-widest text-muted-foreground">OPEN_ISSUES</CardTitle>
              <AlertCircle className="h-5 w-5 text-destructive" />
            </CardHeader>
            <CardContent className="relative">
              <div className="text-5xl font-black text-destructive mb-2">12</div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <div className="px-2 py-0.5 bg-destructive/20 border border-destructive text-destructive font-bold">
                  3 HIGH
                </div>
                <div className="text-muted-foreground">PRIORITY</div>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-2 border-accent hover:shadow-[0_0_25px_rgba(255,165,0,0.3)] transition-all hover-lift fade-in-up stagger-3">
            <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-br from-accent/10 to-transparent transform skew-x-[-15deg]"></div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-mono text-xs tracking-widest text-muted-foreground">IN_PROGRESS</CardTitle>
              <Clock className="h-5 w-5 text-accent" />
            </CardHeader>
            <CardContent className="relative">
              <div className="text-5xl font-black text-accent mb-2">5</div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <Activity className="h-3 w-3 text-accent" />
                <div className="text-muted-foreground">2_DUE_THIS_WEEK</div>
              </div>
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-2 border-primary hover:shadow-[0_0_25px_rgba(0,240,255,0.3)] transition-all hover-lift fade-in-up stagger-4">
            <div className="absolute top-0 right-0 w-32 h-full bg-gradient-to-br from-primary/10 to-transparent transform skew-x-[-15deg]"></div>
            <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="font-mono text-xs tracking-widest text-muted-foreground">COMPLETED</CardTitle>
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </CardHeader>
            <CardContent className="relative">
              <div className="text-5xl font-black text-primary mb-2">28</div>
              <div className="flex items-center gap-2 font-mono text-xs">
                <TrendingUp className="h-3 w-3 text-primary" />
                <div className="text-muted-foreground">THIS_MONTH</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed with Stagger Animation */}
        <Card className="border-2 border-border overflow-hidden fade-in-up stagger-5">
          <CardHeader className="bg-secondary/30 border-b-2 border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black text-primary">RECENT_ACTIVITY</CardTitle>
                <CardDescription className="font-mono text-xs">LATEST_SYSTEM_UPDATES</CardDescription>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary font-mono text-xs text-primary">
                <div className="h-2 w-2 bg-primary rounded-full animate-pulse"></div>
                LIVE
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {[
                { id: "JC-123", title: "Implement dashboard layout", status: "IN_PROGRESS", priority: "HIGH", time: "2h", color: "primary" },
                { id: "JC-124", title: "API integration setup", status: "TODO", priority: "CRITICAL", time: "3h", color: "accent" },
                { id: "JC-122", title: "Project setup complete", status: "DONE", priority: "NORMAL", time: "5h", color: "destructive" }
              ].map((item, index) => (
                <div
                  key={item.id}
                  className="group relative flex items-start gap-4 p-4 border-2 border-border hover:border-primary/50 transition-all hover:bg-secondary/30"
                >
                  {/* Diagonal accent line */}
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-primary via-accent to-destructive opacity-50"></div>

                  <div className="flex h-12 w-12 items-center justify-center border-2 border-border bg-secondary font-mono font-bold text-xs group-hover:border-primary transition-all">
                    <Code className="h-5 w-5" />
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-mono text-xs text-primary font-bold">{item.id}</div>
                        <div className="text-sm font-semibold text-foreground mt-1">{item.title}</div>
                      </div>
                      <div className="flex gap-2">
                        <Badge
                          variant="outline"
                          className="border-primary text-primary font-mono text-xs"
                        >
                          {item.status}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="border-accent text-accent font-mono text-xs"
                        >
                          {item.priority}
                        </Badge>
                      </div>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">
                      UPDATED_{item.time}_AGO
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Access Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="group relative border-2 border-accent/30 hover:border-accent overflow-hidden transition-all hover-lift">
            <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent"></div>
            <CardHeader className="border-b-2 border-border">
              <div className="flex items-center gap-3">
                <Database className="h-6 w-6 text-accent" />
                <div>
                  <CardTitle className="font-black text-lg">JIRA_ISSUES</CardTitle>
                  <CardDescription className="font-mono text-xs">ASSIGNED_TASKS</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 p-4 border-2 border-dashed border-border bg-secondary/20 font-mono text-sm text-muted-foreground">
                <Zap className="h-5 w-5 text-accent" />
                CONNECT_TO_JIRA_API
              </div>
            </CardContent>
          </Card>

          <Card className="group relative border-2 border-destructive/30 hover:border-destructive overflow-hidden transition-all hover-lift">
            <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-destructive to-transparent"></div>
            <CardHeader className="border-b-2 border-border">
              <div className="flex items-center gap-3">
                <Database className="h-6 w-6 text-destructive" />
                <div>
                  <CardTitle className="font-black text-lg">CONFLUENCE_PAGES</CardTitle>
                  <CardDescription className="font-mono text-xs">KNOWLEDGE_BASE</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center gap-3 p-4 border-2 border-dashed border-border bg-secondary/20 font-mono text-sm text-muted-foreground">
                <Zap className="h-5 w-5 text-destructive" />
                CONNECT_TO_CONFLUENCE_API
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
