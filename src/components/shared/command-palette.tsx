"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Sparkles,
  ArrowRight,
  Loader2,
  X,
  Zap,
  Clock,
  Briefcase,
  Users,
  CalendarClock,
  UserPlus,
  Activity,
  FileText,
  HandCoins,
  BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { globalSearch } from "@/actions/search";
import { fetchRole } from "@/actions/roles";
import { fetchCandidate } from "@/actions/candidates";
import { fetchInterview } from "@/actions/interviews";
import { fetchOffer } from "@/actions/offers";
import { useAskPanel } from "./ask-ai-panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// =============================================================================
// TYPES
// =============================================================================

type EntityType = "role" | "candidate" | "application" | "interview" | "assessment" | "offer";

interface SearchResult {
  type: EntityType;
  id: string;
  title: string;
  subtitle: string;
  score: number;
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  path: string;
  icon: LucideIcon;
  shortcut?: string;
}

interface AskAISuggestion {
  text: string;
  description: string;
  icon: LucideIcon;
}

interface RecentItem {
  type: EntityType;
  id: string;
  title: string;
  subtitle: string;
  visitedAt: number;
}

interface RoutePattern {
  type: EntityType;
  pattern: RegExp;
  idGroup?: number;
}

// =============================================================================
// CONFIG
// =============================================================================

const routePatterns: RoutePattern[] = [
  { type: "role", pattern: /^\/recruit\/roles\/([a-zA-Z0-9_-]+)$/ },
  { type: "candidate", pattern: /^\/recruit\/candidates\/([a-zA-Z0-9_-]+)$/ },
  { type: "interview", pattern: /^\/recruit\/interviews\/([a-zA-Z0-9_-]+)$/ },
  { type: "offer", pattern: /^\/recruit\/offers\/([a-zA-Z0-9_-]+)$/ },
];

const askAISuggestions: AskAISuggestion[] = [
  {
    text: "What's happening across my pipelines right now?",
    description: "Pipeline status and agent actions",
    icon: Activity,
  },
  {
    text: "Which candidates are best suited for the open roles?",
    description: "AI-powered candidate matching",
    icon: Users,
  },
  {
    text: "Show me what needs my attention today",
    description: "Triage and decisions",
    icon: BarChart3,
  },
];

const quickActions: QuickAction[] = [
  {
    id: "view-today",
    label: "Today",
    description: "Triage & decisions",
    path: "/recruit/today",
    icon: Activity,
    shortcut: "T",
  },
  {
    id: "add-candidate",
    label: "Add new candidate",
    description: "Create a candidate profile",
    path: "/recruit/candidates/new",
    icon: UserPlus,
    shortcut: "C",
  },
  {
    id: "create-role",
    label: "Create role",
    description: "Open a new job requisition",
    path: "/recruit/roles/new",
    icon: Briefcase,
    shortcut: "R",
  },
  {
    id: "view-interviews",
    label: "View interviews",
    description: "See all interviews",
    path: "/recruit/interviews",
    icon: CalendarClock,
  },
  {
    id: "view-offers",
    label: "View offers",
    description: "See all offers",
    path: "/recruit/offers",
    icon: HandCoins,
  },
  {
    id: "ask-ai",
    label: "Ask AI",
    description: "Get AI-powered insights",
    path: "/recruit/ask",
    icon: Sparkles,
    shortcut: "A",
  },
];

// =============================================================================
// HELPERS
// =============================================================================

const RECENTS_KEY_PREFIX = "dilliznt-command-palette-recents";
const MAX_RECENTS = 5;

function getRecentsKey(orgId?: string | null): string {
  return orgId ? `${RECENTS_KEY_PREFIX}-${orgId}` : RECENTS_KEY_PREFIX;
}

function getRecents(orgId?: string | null): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(getRecentsKey(orgId));
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

function addRecent(item: Omit<RecentItem, "visitedAt">, orgId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const key = getRecentsKey(orgId);
    const recents = getRecents(orgId).filter((r) => !(r.type === item.type && r.id === item.id));
    recents.unshift({ ...item, visitedAt: Date.now() });
    localStorage.setItem(key, JSON.stringify(recents.slice(0, MAX_RECENTS)));
  } catch {
    // Ignore storage errors
  }
}

function getResultRoute(type: EntityType, id: string): string {
  const routes: Record<EntityType, string> = {
    role: "/recruit/roles",
    candidate: "/recruit/candidates",
    application: "/recruit/roles",
    interview: "/recruit/interviews",
    assessment: "/recruit/assessments",
    offer: "/recruit/offers",
  };
  return `${routes[type]}/${id}`;
}

function getTypeColor(type: EntityType): string {
  const colors: Record<EntityType, string> = {
    role: "bg-blue-500 text-white",
    candidate: "bg-teal-500 text-white",
    application: "bg-purple-500 text-white",
    interview: "bg-amber-500 text-white",
    assessment: "bg-indigo-500 text-white",
    offer: "bg-green-500 text-white",
  };
  return colors[type];
}

function getTypeLabel(type: EntityType): string {
  const labels: Record<EntityType, string> = {
    role: "Role",
    candidate: "Candidate",
    application: "Application",
    interview: "Interview",
    assessment: "Assessment",
    offer: "Offer",
  };
  return labels[type];
}

function getInitials(title: string): string {
  return title
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// =============================================================================
// COMPONENT
// =============================================================================

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  orgId?: string | null;
}

export function CommandPalette({ open, onClose, orgId }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const { openPanel } = useAskPanel();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modKey, setModKey] = useState("⌘");

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load recents on open
  useEffect(() => {
    if (open) {
      setRecents(getRecents(orgId));
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, orgId]);

  // Detect platform for keyboard shortcuts
  useEffect(() => {
    setModKey(navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl+");
  }, []);

  // Track route visits
  useEffect(() => {
    for (const { type, pattern, idGroup = 1 } of routePatterns) {
      const match = pathname.match(pattern);
      if (match?.[idGroup]) {
        const id = match[idGroup];
        fetchEntityDetails(type, id).then((entity) => {
          if (entity) {
            addRecent({ type, id, title: entity.title, subtitle: entity.subtitle }, orgId);
            setRecents(getRecents(orgId));
          }
        });
        break;
      }
    }
  }, [pathname, orgId]);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim() || query.length < 2) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const searchResults = await globalSearch(query, 10);
        setResults(
          searchResults.map((r) => ({
            type: r.entityType as EntityType,
            id: r.id,
            title: r.title,
            subtitle: r.subtitle || "",
            score: r.score,
          }))
        );
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query]);

  // Fetch entity details for recents tracking
  async function fetchEntityDetails(type: EntityType, id: string): Promise<{ title: string; subtitle: string } | null> {
    try {
      if (type === "role") {
        const role = await fetchRole(id);
        if (role) return { title: role.title || "Untitled Role", subtitle: role.department || "" };
      } else if (type === "candidate") {
        const candidate = await fetchCandidate(id);
        if (candidate) return { title: candidate.name || "Unknown", subtitle: candidate.email || "" };
      } else if (type === "interview") {
        const interview = await fetchInterview(id);
        if (interview) return { title: `Interview ${interview.id.slice(0, 8)}`, subtitle: interview.status || "" };
      } else if (type === "offer") {
        const offer = await fetchOffer(id);
        if (offer) return { title: `Offer ${offer.id.slice(0, 8)}`, subtitle: offer.status || "" };
      }
    } catch {
      // Ignore errors
    }
    return null;
  }

  const handleResultSelect = useCallback(
    (result: SearchResult) => {
      addRecent({ type: result.type, id: result.id, title: result.title, subtitle: result.subtitle }, orgId);
      router.push(getResultRoute(result.type, result.id));
      onClose();
    },
    [router, onClose, orgId]
  );

  const handleAskAI = useCallback(
    (text?: string) => {
      openPanel(text ? { entity: "", view: "list", initialMessage: text } : undefined);
      onClose();
    },
    [openPanel, onClose]
  );

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (action.id === "ask-ai") {
        handleAskAI();
      } else {
        router.push(action.path);
        onClose();
      }
    },
    [router, onClose, handleAskAI]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Quick action shortcuts
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const action = quickActions.find((a) => a.shortcut?.toLowerCase() === e.key.toLowerCase());
        if (action) {
          e.preventDefault();
          handleQuickAction(action);
          return;
        }
      }

      // Navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => prev + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Handle selection based on current state
        if (results.length > 0) {
          const idx = selectedIndex % results.length;
          handleResultSelect(results[idx]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, results, selectedIndex, onClose, handleResultSelect, handleQuickAction]);

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  const showResults = hasQuery && results.length > 0;
  const showNoResults = hasQuery && !isSearching && results.length === 0 && query.length >= 2;
  const showIdle = !hasQuery;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          {isSearching ? (
            <Loader2 className="h-4 w-4 shrink-0 text-muted-foreground animate-spin" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search roles, candidates, or ask AI anything..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          />
          <kbd className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {/* Idle State: Recents, AI Suggestions, Quick Actions */}
          {showIdle && (
            <>
              {/* Recents */}
              {recents.length > 0 && (
                <div className="mb-2">
                  <div className="flex items-center gap-2 px-4 py-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Recent
                    </span>
                  </div>
                  {recents.map((item) => (
                    <Button
                      key={`${item.type}-${item.id}`}
                      variant="ghost"
                      onClick={() => handleResultSelect({ ...item, score: 1 })}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-secondary/80 transition-colors text-left"
                    >
                      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium", getTypeColor(item.type))}>
                        {getInitials(item.title)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{item.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>
                      </div>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", getTypeColor(item.type).replace("text-white", "text-white/90 bg-opacity-80"))}>
                        {getTypeLabel(item.type)}
                      </span>
                    </Button>
                  ))}
                </div>
              )}

              {/* AI Suggestions */}
              <div className="mb-2">
                <div className="flex items-center gap-2 px-4 py-1.5">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
                    Ask AI
                  </span>
                </div>
                <div className="px-4 grid grid-cols-1 gap-2">
                  {askAISuggestions.map((suggestion, idx) => (
                    <Button
                      key={idx}
                      variant="unstyled"
                      onClick={() => handleAskAI(suggestion.text)}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5 text-left hover:bg-secondary/60 transition-colors"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                        <suggestion.icon className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">{suggestion.text}</p>
                        <p className="text-[10px] text-muted-foreground">{suggestion.description}</p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <div className="flex items-center gap-2 px-4 py-1.5">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Quick Actions
                  </span>
                </div>
                {quickActions.map((action) => (
                  <Button
                    key={action.id}
                    variant="ghost"
                    onClick={() => handleQuickAction(action)}
                    className="w-full flex items-center gap-3 px-4 py-2 hover:bg-secondary/80 transition-colors text-left"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <action.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{action.label}</p>
                      <p className="text-[11px] text-muted-foreground">{action.description}</p>
                    </div>
                    {action.shortcut && (
                      <kbd className="rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {modKey}{action.shortcut}
                      </kbd>
                    )}
                  </Button>
                ))}
              </div>
            </>
          )}

          {/* Search Results */}
          {showResults && (
            <>
              {results.map((result, idx) => (
                <Button
                  key={`${result.type}-${result.id}`}
                  variant="ghost"
                  onClick={() => handleResultSelect(result)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    selectedIndex % results.length === idx ? "bg-primary/10" : "hover:bg-secondary/80"
                  )}
                >
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium", getTypeColor(result.type))}>
                    {getInitials(result.title)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", getTypeColor(result.type).replace("text-white", "text-white/90"))}>
                        {getTypeLabel(result.type)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                  </div>
                  <span className="text-xs font-medium text-primary tabular-nums">
                    {Math.round(result.score * 100)}%
                  </span>
                </Button>
              ))}
            </>
          )}

          {/* No Results */}
          {showNoResults && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">No results for &ldquo;{query}&rdquo;</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a different search or ask AI</p>
            </div>
          )}

          {/* AI Fallback on search */}
          {hasQuery && query.length >= 2 && (
            <div className="border-t border-border px-4 py-3 mt-1">
              <Button
                variant="unstyled"
                onClick={() => handleAskAI(query)}
                className="flex w-full items-center gap-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/20 px-3 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Ask AI: &ldquo;{query}&rdquo;</p>
                  <p className="text-[11px] text-muted-foreground">Get an answer based on your hiring data</p>
                </div>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
