"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  memo,
} from "react";
import { Send, Sparkles, X, Loader2, Bell, GitBranch, Zap, BarChart3, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ENTITY_LABELS, getSuggestions } from "./entity-ask-config";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Memoized markdown renderer using Streamdown
const MessageContent = memo(({ content, className }: { content: string; className?: string }) => (
  <Streamdown
    className={cn(
      "prose prose-sm prose-neutral dark:prose-invert max-w-none",
      "prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1",
      "prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs",
      className
    )}
    plugins={{ code }}
  >
    {content}
  </Streamdown>
));

interface AskPanelHandover {
  action: "approved" | "dismissed" | "ask";
  operation?: string | null;
  summary?: string | null;
  reasoning?: string | null;
  entityLabel?: string | null;
  agentSlug?: string | null;
  confidence?: number | null;
  params?: Record<string, unknown> | null;
}

interface AskPanelConfig {
  entity: string;
  id?: string;
  view: "list" | "detail";
  initialMessage?: string;
  handover?: AskPanelHandover;
  /** Pre-loaded serialized data from the page */
  data?: Record<string, unknown>;
}

interface AskPanelContextValue {
  open: boolean;
  config: AskPanelConfig | null;
  openPanel: (config?: AskPanelConfig) => void;
  closePanel: () => void;
}

const AskPanelContext = createContext<AskPanelContextValue>({
  open: false,
  config: null,
  openPanel: () => {},
  closePanel: () => {},
});

export function useAskPanel() {
  return useContext(AskPanelContext);
}

const globalSuggestions = [
  { text: "What needs my attention today?", icon: <Bell className="h-3.5 w-3.5" /> },
  { text: "Where are my pipelines stuck?", icon: <GitBranch className="h-3.5 w-3.5" /> },
  { text: "Find strong candidates for open roles", icon: <Zap className="h-3.5 w-3.5" /> },
  { text: "Show me pipeline health across all roles", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { text: "Which recommendations should I review?", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
];

type SuggestionItem = string | { text: string; icon?: React.ReactNode };

export function AskPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<AskPanelConfig | null>(null);

  const openPanel = useCallback((cfg?: AskPanelConfig) => {
    setConfig(cfg ?? null);
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
    setConfig(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, closePanel]);

  return (
    <AskPanelContext.Provider value={{ open, config, openPanel, closePanel }}>
      {children}
      <AskOverlay />
    </AskPanelContext.Provider>
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

function AskOverlay() {
  const { open, config, closePanel } = useAskPanel();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentBriefRef = useRef(false);

  // Reset state when panel opens
  useEffect(() => {
    if (open) {
      setMessages([]);
      setInput("");
      setIsLoading(false);
      hasSentBriefRef.current = false;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle submit - defined before early return to avoid hooks issues
  const handleSubmit = useCallback(async (message: string) => {
    if (!message.trim() || isLoading) return;

    const userMessage = message.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      // Build conversation history for context (exclude the message we're about to send)
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          context: config
            ? { entity: config.entity, id: config.id, view: config.view, data: config.data }
            : undefined,
          history,
        }),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      const decoder = new TextDecoder();
      let assistantMessage = "";

      // Add empty assistant message that we'll update
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setIsLoading(false);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        assistantMessage += chunk;

        // Update the last message with accumulated content
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "assistant",
            content: assistantMessage,
          };
          return newMessages;
        });
      }

      if (!assistantMessage.trim()) {
        setMessages((prev) => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "assistant",
            content: "I couldn't generate a response. Please try again.",
          };
          return newMessages;
        });
      }
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => m.content !== ""),
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
      setIsLoading(false);
    }
  }, [isLoading, config]);

  // Compute derived values before useEffect that depends on them
  const hasEntity = !!config?.entity;
  const entity = config?.entity ?? "";
  const label = ENTITY_LABELS[entity] ?? entity;
  const view = config?.view ?? "list";

  // Determine initial message from handover context
  const handoverMessage = config?.handover
    ? config.handover.action === "approved"
      ? `I approved ${config.handover.operation ?? "the action"}${config.handover.entityLabel ? ` for "${config.handover.entityLabel}"` : ""}`
      : config.handover.action === "dismissed"
        ? `I dismissed ${config.handover.operation ?? "the action"}${config.handover.entityLabel ? ` for "${config.handover.entityLabel}"` : ""}`
        : `Help me decide on ${config.handover.operation ?? "this action"}${config.handover.entityLabel ? ` for "${config.handover.entityLabel}"` : ""}`
    : undefined;

  // Auto-send initial message: explicit initialMessage > handover > "Brief me" on detail view
  useEffect(() => {
    if (open && !hasSentBriefRef.current) {
      const initialMsg = config?.initialMessage ?? handoverMessage ?? (view === "detail" && config?.id ? "Brief me" : undefined);
      if (initialMsg) {
        hasSentBriefRef.current = true;
        const timer = setTimeout(() => handleSubmit(initialMsg), 150);
        return () => clearTimeout(timer);
      }
    }
  }, [open, config?.initialMessage, view, config?.id, handoverMessage, handleSubmit]);

  if (!open) return null;

  const suggestions: SuggestionItem[] = hasEntity
    ? getSuggestions(entity, view)
    : globalSuggestions;

  const title = hasEntity
    ? view === "detail"
      ? `Ask about this ${entity}`
      : `Ask about ${label.toLowerCase()}`
    : "Ask AI";

  const placeholder = hasEntity
    ? `Ask anything about ${view === "detail" ? `this ${entity}` : label.toLowerCase()}...`
    : "Ask about roles, candidates, pipeline...";

  const getSuggestionText = (s: SuggestionItem) => typeof s === "string" ? s : s.text;
  const getSuggestionIcon = (s: SuggestionItem) => typeof s === "string" ? null : s.icon;

  const handleSuggestionClick = (suggestion: SuggestionItem) => {
    handleSubmit(getSuggestionText(suggestion));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={closePanel} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl h-[calc(100vh-6rem)] mt-12 mx-4 rounded-xl border border-border bg-background shadow-2xl flex flex-col animate-in slide-in-from-bottom-2 fade-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100">
              <Sparkles className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <p className="text-[11px] text-muted-foreground">
                AI-powered insights and recommendations
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={closePanel}
            className="flex items-center justify-center rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 mb-4">
                <Sparkles className="h-6 w-6 text-amber-500" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">{title}</p>
              <p className="text-xs text-muted-foreground mb-6 max-w-sm">
                Get AI-powered insights, analysis, and recommendations.
              </p>

              {/* Suggestions */}
              <div className="flex flex-wrap justify-center gap-2 max-w-md">
                {suggestions.map((suggestion, idx) => {
                  const text = getSuggestionText(suggestion);
                  const icon = getSuggestionIcon(suggestion);
                  return (
                    <Button
                      key={idx}
                      variant="unstyled"
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                    >
                      {icon && <span className="text-amber-500">{icon}</span>}
                      {text}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex",
                    message.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] px-4 py-2.5 text-sm leading-relaxed",
                      message.role === "user"
                        ? "text-foreground"
                        : "text-foreground"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <MessageContent content={message.content} />
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="px-4 py-2.5 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                    <span className="text-sm text-muted-foreground">AI is thinking...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(input);
            }}
            className="flex items-center gap-2"
          >
            <Input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              className="flex-1 rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            />
            <Button
              type="submit"
              variant="default"
              size="icon"
              disabled={!input.trim() || isLoading}
              className="flex items-center justify-center rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
