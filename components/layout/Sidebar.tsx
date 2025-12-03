"use client"

import { LayoutDashboard, ListTodo, FileText, Filter, Activity, Star, User as UserIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
  activeView?: "unified" | "jira" | "confluence"
}

export function Sidebar({ activeView = "unified" }: SidebarProps) {
  const navItems = [
    {
      id: "unified",
      label: "UNIFIED",
      sublabel: "All_Systems",
      icon: LayoutDashboard,
      href: "/dashboard",
      color: "primary",
    },
    {
      id: "jira",
      label: "JIRA",
      sublabel: "Task_Mgmt",
      icon: ListTodo,
      href: "/dashboard/jira",
      color: "accent",
    },
    {
      id: "confluence",
      label: "CONFLUENCE",
      sublabel: "Knowledge_Base",
      icon: FileText,
      href: "/dashboard/confluence",
      color: "destructive",
    },
  ]

  const filters = [
    { icon: UserIcon, label: "ASSIGNED_TO_ME", count: 12 },
    { icon: Activity, label: "RECENT_ACTIVITY", count: 5 },
    { icon: Star, label: "FAVORITES", count: 8 },
  ]

  return (
    <aside className="w-72 border-r-2 border-border bg-secondary/30 backdrop-blur-sm">
      <div className="flex flex-col h-full">
        {/* Navigation Section */}
        <div className="p-4">
          <div className="mb-4 font-mono text-xs text-muted-foreground tracking-widest border-l-2 border-primary pl-3">
            NAVIGATION
          </div>

          <nav className="space-y-2">
            {navItems.map((item, index) => {
              const Icon = item.icon
              const isActive = activeView === item.id

              return (
                <button
                  key={item.id}
                  className={cn(
                    "group relative w-full overflow-hidden border-2 transition-all duration-300",
                    isActive
                      ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(0,240,255,0.3)]"
                      : "bg-card border-border hover:border-primary/50 hover:bg-card/80"
                  )}
                >
                  {/* Diagonal accent */}
                  {isActive && (
                    <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-br from-primary/20 to-transparent transform skew-x-[-10deg]"></div>
                  )}

                  <div className="relative flex items-center gap-3 px-4 py-3">
                    <div className={cn(
                      "flex h-10 w-10 items-center justify-center border-2 transition-all",
                      isActive
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-secondary border-border text-foreground group-hover:border-primary/50"
                    )}>
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 text-left">
                      <div className={cn(
                        "font-black text-sm tracking-tight transition-colors",
                        isActive ? "text-primary" : "text-foreground group-hover:text-primary"
                      )}>
                        {item.label}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {item.sublabel}
                      </div>
                    </div>

                    {isActive && (
                      <div className="h-2 w-2 bg-primary rounded-full animate-pulse"></div>
                    )}
                  </div>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Filters Section */}
        <div className="flex-1 border-t-2 border-border p-4">
          <div className="mb-4 font-mono text-xs text-muted-foreground tracking-widest border-l-2 border-accent pl-3">
            QUICK_FILTERS
          </div>

          <div className="space-y-2">
            {filters.map((filter, index) => {
              const Icon = filter.icon
              return (
                <button
                  key={filter.label}
                  className="group w-full flex items-center justify-between px-4 py-2.5 bg-card border border-border hover:border-accent/50 hover:bg-card/80 transition-all font-mono text-xs"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
                    <span className="text-foreground group-hover:text-accent transition-colors">
                      {filter.label}
                    </span>
                  </div>
                  {filter.count && (
                    <div className="px-2 py-0.5 bg-accent/20 border border-accent text-accent font-bold">
                      {filter.count}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* System Status */}
        <div className="border-t-2 border-border bg-card/50 p-4">
          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="flex gap-1">
              <div className="h-2 w-2 bg-primary rounded-full animate-pulse"></div>
              <div className="h-2 w-2 bg-accent rounded-full animate-pulse delay-75"></div>
              <div className="h-2 w-2 bg-destructive rounded-full animate-pulse delay-150"></div>
            </div>
            <div className="text-muted-foreground">
              SYS_OK
            </div>
            <div className="ml-auto text-primary">
              v1.0.0
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
