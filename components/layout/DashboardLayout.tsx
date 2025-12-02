"use client"

import { ReactNode } from "react"
import { Header } from "./Header"
import { Sidebar } from "./Sidebar"

interface DashboardLayoutProps {
  children: ReactNode
  activeView?: "unified" | "jira" | "confluence"
}

export function DashboardLayout({ children, activeView }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar activeView={activeView} />
        <main className="flex-1 overflow-y-auto bg-white">
          {children}
        </main>
      </div>
    </div>
  )
}
