"use client"

import { Search, Plus, User } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white">
      <div className="flex h-16 items-center px-4 gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-atlassian-blue text-white font-bold">
            JC
          </div>
          <h1 className="text-lg font-semibold text-gray-900">
            Jira Confluence Dashboard
          </h1>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
            <input
              type="text"
              placeholder="Search issues and pages... (Cmd+K)"
              className="w-full rounded-md border border-gray-300 bg-white py-2 pl-10 pr-4 text-sm placeholder:text-text-subtle focus:border-atlassian-blue focus:outline-none focus:ring-1 focus:ring-atlassian-blue"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Create
          </Button>

          <Button size="icon" variant="ghost">
            <User className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  )
}
