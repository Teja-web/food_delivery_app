"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Calendar,
  DollarSign,
  Dumbbell,
  Flame,
  Lightbulb,
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Video,
  Zap,
} from "lucide-react";
import { CoachMarkdown } from "./coach-markdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/* -- Types --------------------------------------------------- */

type BubbleType = "coach" | "user" | "card" | "nudge" | "challenge";

interface CardData {
  variant: "interview-alert" | "interview-join" | "offer" | "insight" | "opportunity-check" | "growth" | "celebration";
  title: string;
  body: string;
  meta?: string;
  cta?: { label: string; href: string };
}

interface Bubble {
  id: string;
  type: BubbleType;
  content?: string;
  card?: CardData;
}

/* -- Advisory → Bubbles conversion --------------------------- */

function daysUntilDate(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

interface OfferApplication {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  orgName: string | null;
}

function advisoryToBubbles(
  advisory: Record<string, unknown>,
  intelligenceProfile: Record<string, unknown> | null,
  firstName: string,
  upcomingInterviews: UpcomingInterview[] = [],
  offerApplications: OfferApplication[] = [],
): Bubble[] {
  const bubbles: Bubble[] = [];

  // talentAssessment fields: roleFamily, pillars, overall, rating, outlook, confidence, gaps
  const pillars = advisory.pillars as Array<{ pillar: string; weight: number; score: number; signals: string[] }> | undefined;
  const gaps = advisory.gaps as string[] | undefined;
  const outlook = advisory.outlook as string | undefined;
  const rating = advisory.rating as string | undefined;
  const overall = advisory.overall as number | undefined;

  // intelligence profile fields: summary, skills, currentTitle, currentCompany, totalYearsExperience
  const summary = intelligenceProfile?.summary as string | undefined;
  const skills = intelligenceProfile?.skills as string[] | undefined;
  const currentTitle = intelligenceProfile?.currentTitle as string | undefined;

  bubbles.push({
    id: "briefing-open",
    type: "coach",
    content: `Good morning, ${firstName}. Here's what I'm seeing in your career right now.`,
  });

  // Skill narrative from profile summary
  if (summary) {
    bubbles.push({
      id: "briefing-skills",
      type: "coach",
      content: summary,
    });
  }

  // Top strengths from pillars
  if (pillars && pillars.length > 0) {
    const sorted = [...pillars].sort((a, b) => b.score - a.score);
    const topPillars = sorted.slice(0, 3);
    const titleCase = (s: string) => s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
    const strengthNames = topPillars.map((p) => `**${titleCase(p.pillar)}** (${p.score}/100)`);
    bubbles.push({
      id: "briefing-strengths",
      type: "coach",
      content: `Your strongest areas: ${strengthNames.join(", ")}.`,
    });
  }

  // Gaps as challenges
  if (gaps && gaps.length > 0) {
    bubbles.push({
      id: "briefing-growth",
      type: "challenge",
      content: `Areas to focus on: ${gaps.join(". ")}. These are the gaps that interviewers are most likely to probe.`,
    });
  }

  // Outlook + overall score
  if (outlook || overall != null) {
    const parts: string[] = [];
    if (overall != null && rating) {
      parts.push(`Your overall talent score is **${overall}/100** (${rating}).`);
    }
    if (outlook === "positive") {
      parts.push("Your career trajectory looks positive — keep building momentum.");
    } else if (outlook === "stable") {
      parts.push("Your career trajectory is stable. Consider stretch opportunities to accelerate growth.");
    } else if (outlook === "negative") {
      parts.push("Your career trajectory needs attention. Let's work on closing the gaps.");
    }
    if (parts.length > 0) {
      bubbles.push({
        id: "briefing-outlook",
        type: "coach",
        content: parts.join(" "),
      });
    }
  }

  // Upcoming interview cards — show "Join now" for live/imminent, "Prep" otherwise
  for (const iv of upcomingInterviews) {
    const when = daysUntilDate(iv.scheduledAt);
    const dateStr = new Date(iv.scheduledAt).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    // Check if interview is joinable (within 15min before start through end)
    const scheduled = new Date(iv.scheduledAt);
    const duration = iv.durationMins ?? 45;
    const windowStart = scheduled.getTime() - 15 * 60 * 1000;
    const windowEnd = scheduled.getTime() + duration * 60 * 1000;
    const now = Date.now();
    const isJoinable = now >= windowStart && now <= windowEnd && (iv.meetingLink || iv.candidateToken);

    if (isJoinable) {
      const joinUrl = iv.meetingLink || `/interviews/${iv.id}/room?token=${iv.candidateToken}`;
      bubbles.push({
        id: `briefing-interview-${iv.id}`,
        type: "card",
        card: {
          variant: "interview-join",
          title: "Interview room is open",
          body: `${iv.jobTitle} — your interview is ready to join.`,
          cta: { label: "Join now", href: joinUrl },
        },
      });
    } else {
      bubbles.push({
        id: `briefing-interview-${iv.id}`,
        type: "card",
        card: {
          variant: "interview-alert",
          title: `Interview ${when}`,
          body: `${iv.jobTitle} — ${dateStr}`,
          cta: { label: "Prep for this", href: `/prepare?role=${iv.jobId}` },
        },
      });
    }
  }

  // Offer cards
  for (const opp of offerApplications) {
    bubbles.push({
      id: `briefing-offer-${opp.applicationId}`,
      type: "card",
      card: {
        variant: "offer",
        title: "You have an offer",
        body: `${opp.jobTitle}${opp.orgName ? ` at ${opp.orgName}` : ""} — review the details and next steps.`,
        cta: { label: "View offer", href: `/roles/${opp.jobId}/offer` },
      },
    });
  }

  return bubbles;
}

/* -- Card renderer ------------------------------------------- */

function CoachCard({ card }: { card: CardData }) {
  const styles: Record<string, string> = {
    "interview-alert": "border-amber-200 bg-gradient-to-br from-amber-50/80 to-orange-50/40",
    "interview-join": "border-blue-300 bg-gradient-to-br from-blue-50/80 to-sky-50/40 ring-1 ring-blue-200",
    offer: "border-emerald-300 bg-gradient-to-br from-emerald-50/80 to-teal-50/40 ring-1 ring-emerald-200",
    insight: "border-teal-200/60 bg-gradient-to-br from-teal-50/60 to-cyan-50/30",
    "opportunity-check": "border-border bg-gradient-to-br from-secondary to-secondary/30",
    growth: "border-violet-200/60 bg-gradient-to-br from-violet-50/50 to-fuchsia-50/20",
    celebration: "border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-lime-50/20",
  };
  const icons: Record<string, React.ReactNode> = {
    "interview-alert": <Calendar className="h-4 w-4 text-amber-600" />,
    "interview-join": <Video className="h-4 w-4 text-blue-600" />,
    offer: <DollarSign className="h-4 w-4 text-emerald-600" />,
    insight: <Lightbulb className="h-4 w-4 text-teal-600" />,
    "opportunity-check": <Building2 className="h-4 w-4 text-muted-foreground" />,
    growth: <TrendingUp className="h-4 w-4 text-violet-600" />,
    celebration: <Sparkles className="h-4 w-4 text-emerald-600" />,
  };

  return (
    <div className={`rounded-2xl border p-4 ${styles[card.variant] ?? ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icons[card.variant]}
          <span className="text-xs font-semibold text-foreground">{card.title}</span>
        </div>
        {card.meta && (
          <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {card.meta}
          </span>
        )}
      </div>
      <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{card.body}</p>
      {card.cta && (
        <Link
          href={card.cta.href}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 active:scale-[0.97]"
        >
          {card.cta.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

/* -- Main ---------------------------------------------------- */

interface UpcomingInterview {
  id: string;
  jobId: string;
  jobTitle: string;
  scheduledAt: string;
  durationMins: number;
  status: string;
  meetingLink: string | null;
  candidateToken: string | null;
}

export function CoachClient({
  firstName,
  advisory,
  intelligenceProfile,
  skills,
  candidateId,
  hasResume,
  upcomingInterviews = [],
  offerApplications = [],
}: {
  firstName: string;
  advisory: Record<string, unknown> | null;
  intelligenceProfile: Record<string, unknown> | null;
  skills: string[];
  candidateId: string;
  hasResume: boolean;
  upcomingInterviews?: UpcomingInterview[];
  offerApplications?: OfferApplication[];
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [briefingBubbles] = useState<Bubble[]>(() => {
    if (advisory) return advisoryToBubbles(advisory, intelligenceProfile, firstName, upcomingInterviews, offerApplications);
    if (hasResume) {
      const bubbles: Bubble[] = [{
        id: "welcome",
        type: "coach" as const,
        content: `Hi ${firstName}. I'm your career coach. Ask me about your opportunities, interview prep, or career direction — I have access to your full profile and pipeline.`,
      }];
      for (const iv of upcomingInterviews) {
        const when = daysUntilDate(iv.scheduledAt);
        const dateStr = new Date(iv.scheduledAt).toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });

        const scheduled = new Date(iv.scheduledAt);
        const duration = iv.durationMins ?? 45;
        const windowStart = scheduled.getTime() - 15 * 60 * 1000;
        const windowEnd = scheduled.getTime() + duration * 60 * 1000;
        const now = Date.now();
        const isJoinable = now >= windowStart && now <= windowEnd && (iv.meetingLink || iv.candidateToken);

        if (isJoinable) {
          const joinUrl = iv.meetingLink || `/interviews/${iv.id}/room?token=${iv.candidateToken}`;
          bubbles.push({
            id: `briefing-interview-${iv.id}`,
            type: "card" as const,
            card: {
              variant: "interview-join" as const,
              title: "Interview room is open",
              body: `${iv.jobTitle} — your interview is ready to join.`,
              cta: { label: "Join now", href: joinUrl },
            },
          });
        } else {
          bubbles.push({
            id: `briefing-interview-${iv.id}`,
            type: "card" as const,
            card: {
              variant: "interview-alert" as const,
              title: `Interview ${when}`,
              body: `${iv.jobTitle} — ${dateStr}`,
              cta: { label: "Prep for this", href: `/prepare?role=${iv.jobId}` },
            },
          });
        }
      }
      for (const opp of offerApplications) {
        bubbles.push({
          id: `briefing-offer-${opp.applicationId}`,
          type: "card" as const,
          card: {
            variant: "offer" as const,
            title: "You have an offer",
            body: `${opp.jobTitle}${opp.orgName ? ` at ${opp.orgName}` : ""} — review the details and next steps.`,
            cta: { label: "View offer", href: `/roles/${opp.jobId}/offer` },
          },
        });
      }
      return bubbles;
    }
    // No advisory, no resume — nudge to profile
    return [
      {
        id: "welcome-onboarding",
        type: "coach" as const,
        content: `Welcome, ${firstName}! I'm your career coach. Your profile is empty right now — upload your resume on your profile page so I can give you personalized guidance, find matching roles, and prep you for interviews.`,
      },
      {
        id: "onboarding-cta",
        type: "card" as const,
        card: {
          variant: "growth" as const,
          title: "Complete your profile",
          body: "Upload your resume to get started. I'll extract your skills, experience, and preferences automatically.",
          cta: { label: "Go to profile", href: "/profile" },
        },
      },
    ];
  });

  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "assistant"; content: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, briefingBubbles]);

  const handleSend = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage = text.trim();
    const userMsgId = `user-${Date.now()}`;

    // Add user message
    setMessages((prev) => [...prev, { id: userMsgId, role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/portal/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: userMessage }],
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      const decoder = new TextDecoder();
      let assistantMessage = "";
      const assistantMsgId = `assistant-${Date.now()}`;

      // Add empty assistant message that we'll update
      setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);
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
            id: assistantMsgId,
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
            id: assistantMsgId,
            role: "assistant",
            content: "I couldn't generate a response. Please try again.",
          };
          return newMessages;
        });
      }
    } catch (error) {
      console.error("[Coach] Error:", error);
      setMessages((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Conversation */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-6">
          {/* Date marker */}
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/50" />
            <span className="text-[11px] font-medium text-muted-foreground">
              Today, {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}
            </span>
            <div className="h-px flex-1 bg-border/50" />
          </div>

          <div className="space-y-4">
            {/* Briefing bubbles */}
            {briefingBubbles.map((bubble, i) => (
              <BubbleRenderer key={bubble.id} bubble={bubble} index={i} />
            ))}

            {/* Chat messages */}
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const text = msg.content;

              if (!text) return null;

              if (isUser) {
                return (
                  <div key={msg.id} className="feed-item-enter flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-3 text-[13.5px] leading-relaxed text-primary-foreground">
                      {text}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className="feed-item-enter flex items-start gap-2">
                  <div className="mt-1 w-6 shrink-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[10px]">
                      ✦
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-bl-md bg-card px-4 py-3 text-[13.5px] leading-relaxed text-foreground shadow-sm shadow-border/50">
                    <CoachMarkdown content={text} />
                  </div>
                </div>
              );
            })}

            {/* Loading indicator */}
            {isLoading && messages.length > 0 && (
              <div className="flex items-start gap-2">
                <div className="mt-1 w-6 shrink-0">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[10px]">
                    ✦
                  </div>
                </div>
                <div className="rounded-2xl rounded-bl-md bg-card px-4 py-3 shadow-sm shadow-border/50">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30" style={{ animationDelay: "0ms" }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30" style={{ animationDelay: "150ms" }} />
                    <div className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/30" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-6" />
        </div>
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}

/* -- Bubble renderer ----------------------------------------- */

function BubbleRenderer({ bubble, index }: { bubble: Bubble; index: number }) {
  if (bubble.type === "card" && bubble.card) {
    return (
      <div className="feed-item-enter flex items-start gap-2" style={{ animationDelay: `${index * 120}ms` }}>
        <div className="mt-1 w-6 shrink-0">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[10px]">
            ✦
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <CoachCard card={bubble.card} />
        </div>
      </div>
    );
  }

  const isChallenge = bubble.type === "challenge";
  const isNudge = bubble.type === "nudge";

  return (
    <div className="feed-item-enter flex items-start gap-2" style={{ animationDelay: `${index * 120}ms` }}>
      <div className="mt-1 w-6 shrink-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[10px]">
          ✦
        </div>
      </div>
      <div
        className={`min-w-0 flex-1 rounded-2xl rounded-bl-md px-4 py-3 text-[13.5px] leading-relaxed ${
          isChallenge
            ? "border border-amber-200/60 bg-amber-50/30 text-amber-900"
            : isNudge
              ? "border border-border bg-secondary text-muted-foreground italic"
              : "bg-card text-foreground shadow-sm shadow-border/50"
        }`}
      >
        {isChallenge && (
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-600">
            <Zap className="h-3 w-3" />
            Challenge
          </div>
        )}
        <CoachMarkdown content={bubble.content ?? ""} />
      </div>
    </div>
  );
}

/* -- Chat input ---------------------------------------------- */

function ChatInput({ onSend, isLoading }: { onSend: (text: string) => void; isLoading: boolean }) {
  const [input, setInput] = useState("");

  const quickActions = [
    "How should I prepare for my next interview?",
    "What are my weak areas?",
    "Summarize my pipeline",
  ];

  const handleSubmit = () => {
    if (!input.trim()) return;
    onSend(input);
    setInput("");
  };

  return (
    <div className="shrink-0 border-t border-border/40 bg-card/80 backdrop-blur-xl">
      <div className="mx-auto max-w-2xl px-4 py-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {quickActions.map((q) => (
            <Button
              key={q}
              variant="unstyled"
              onClick={() => onSend(q)}
              disabled={isLoading}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground active:scale-[0.97] disabled:opacity-50"
            >
              {q}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[8px]">
            ✦
          </div>
          <div className="relative flex-1">
            <Input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Ask your coach anything..."
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
