"use client"

import { LayoutDashboard, ListTodo, FileText, Filter } from "lucide-react"
import { cn } from "@/lib/utils"

interface SidebarProps {
  activeView?: "unified" | "jira" | "confluence"
}

export function Sidebar({ activeView = "unified" }: SidebarProps) {
  const navItems = [
    {
      id: "unified",
      label: "Unified View",
      icon: LayoutDashboard,
      href: "/dashboard",
    },
    {
      id: "jira",
      label: "Jira",
      icon: ListTodo,
      href: "/dashboard/jira",
    },
    {
      id: "confluence",
      label: "Confluence",
      icon: FileText,
      href: "/dashboard/confluence",
    },
  ]

  return (
    <aside className="w-64 border-r border-gray-200 bg-surface-raised">
      <div className="flex flex-col h-full">
        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeView === item.id

            return (
              <button
                key={item.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-atlassian-blue text-white"
                    : "text-gray-700 hover:bg-gray-200"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* Filters Section */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="space-y-1 mt-2">
            <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-200">
              <span>Assigned to me</span>
              <span className="text-xs text-text-subtle">12</span>
            </button>
            <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-200">
              <span>Recent activity</span>
            </button>
            <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-200">
              <span>Favorites</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
