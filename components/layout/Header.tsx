"use client"

import { Search, Plus, User, Terminal, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b-2 border-primary/20 bg-card/95 backdrop-blur-sm scanline">
      <div className="flex h-20 items-center px-6 gap-6">
        {/* Logo with glitch effect */}
        <div className="flex items-center gap-3 group">
          <div className="relative flex h-12 w-12 items-center justify-center bg-primary text-primary-foreground font-mono font-bold text-xl border-2 border-primary transition-all group-hover:shadow-[0_0_20px_rgba(0,240,255,0.5)]">
            <Terminal className="h-6 w-6" />
            <div className="absolute inset-0 bg-primary/20 animate-pulse"></div>
          </div>
          <div>
            <h1 className="text-xl font-black text-primary neon-glow tracking-tight leading-tight">
              COMMAND
            </h1>
            <div className="text-xs font-mono text-muted-foreground tracking-widest">
              JIRA_CONFLUENCE
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-secondary/50 border border-border font-mono text-xs">
          <div className="h-2 w-2 bg-primary rounded-full animate-pulse"></div>
          <span className="text-muted-foreground">SYSTEM_ONLINE</span>
        </div>

        {/* Search with cyberpunk styling */}
        <div className="flex-1 max-w-xl">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary transition-all group-focus-within:text-primary group-focus-within:scale-110" />
            <input
              type="text"
              placeholder="SEARCH_QUERY... [CMD+K]"
              className="w-full bg-secondary border-2 border-border py-3 pl-12 pr-4 text-sm font-mono placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-0 transition-all focus:shadow-[0_0_15px_rgba(0,240,255,0.3)]"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-1">
              <kbd className="px-2 py-0.5 bg-muted border border-border text-xs font-mono text-muted-foreground">
                ⌘K
              </kbd>
            </div>
          </div>
        </div>

        {/* Actions with neon accents */}
        <div className="flex items-center gap-3">
          <Button
            size="default"
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-mono font-bold border-2 border-primary hover:shadow-[0_0_20px_rgba(0,240,255,0.5)] transition-all"
          >
            <Plus className="h-4 w-4" />
            CREATE
          </Button>

          <Button
            size="icon"
            variant="outline"
            className="border-2 border-border hover:border-accent hover:bg-accent/10 transition-all relative group"
          >
            <User className="h-5 w-5 text-foreground group-hover:text-accent transition-colors" />
            <Zap className="absolute -top-1 -right-1 h-3 w-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
          </Button>
        </div>
      </div>

      {/* Accent line */}
      <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"></div>
    </header>
  )
}
