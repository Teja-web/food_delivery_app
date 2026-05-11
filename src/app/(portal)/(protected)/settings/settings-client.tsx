"use client";

import { useState, useTransition } from "react";
import {
  Bell,
  BellOff,
  Download,
  LogOut,
  Mail,
  Shield,
  User,
} from "lucide-react";
import { portalSignOut, updateNotificationPreferencesAction } from "@/actions/portal";
import { Button } from "@/components/ui/button";

const DEFAULT_NOTIFICATIONS = [
  { id: "new-matches", label: "New role matches", description: "When your coach finds roles that fit your profile", enabled: true },
  { id: "interview-prep", label: "Interview prep reminders", description: "Nudges before upcoming interviews", enabled: true },
  { id: "feedback", label: "Feedback received", description: "When interview feedback comes in", enabled: true },
  { id: "coach-insights", label: "Coach insights", description: "Weekly growth patterns and career observations", enabled: true },
  { id: "pipeline-updates", label: "Pipeline status changes", description: "Stage advances, scheduling, decisions", enabled: false },
];

export function SettingsClient({
  email,
  name,
  notifications,
}: {
  email: string;
  name: string | null;
  notifications: Record<string, boolean>;
}) {
  const [isPending, startTransition] = useTransition();
  const [notifs, setNotifs] = useState<Record<string, boolean>>(
    Object.fromEntries(
      DEFAULT_NOTIFICATIONS.map((n) => [n.id, notifications[n.id] ?? n.enabled])
    )
  );

  function handleSignOut() {
    startTransition(async () => {
      await portalSignOut();
    });
  }

  function toggleNotif(id: string) {
    const updated = { ...notifs, [id]: !notifs[id] };
    setNotifs(updated);
    startTransition(async () => {
      await updateNotificationPreferencesAction(updated);
    });
  }

  const supportEmail = "support@dilliznt.com";
  const exportSubject = encodeURIComponent("Data Export Request");
  const exportBody = encodeURIComponent(
    `Hi,\n\nI'd like to request an export of my personal data.\n\nAccount email: ${email}\n\nThank you.`
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="space-y-8">
          {/* Header */}
          <div className="section-reveal">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Settings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage your account, notifications, and data.
            </p>
          </div>

          {/* Account */}
          <div className="section-reveal rounded-xl border border-border bg-card p-5" style={{ animationDelay: "60ms" }}>
            <div className="mb-4 flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Account</h2>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {name || "Candidate"}
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {email}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Coach Notifications */}
          <div className="section-reveal rounded-xl border border-border bg-card p-5" style={{ animationDelay: "120ms" }}>
            <div className="mb-4 flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Coach notifications</h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Choose how your coach reaches out to you. The best coaching happens when your coach can be proactive.
            </p>
            <div className="space-y-1">
              {DEFAULT_NOTIFICATIONS.map((notif) => (
                <Button
                  key={notif.id}
                  variant="ghost"
                  onClick={() => toggleNotif(notif.id)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {notifs[notif.id] ? <Bell className="h-4 w-4 text-amber-500" /> : <BellOff className="h-4 w-4 text-muted-foreground/30" />}
                    <div>
                      <p className="text-xs font-semibold text-foreground">{notif.label}</p>
                      <p className="text-[11px] text-muted-foreground">{notif.description}</p>
                    </div>
                  </div>
                  <div className={`h-5 w-9 rounded-full p-0.5 transition-colors ${notifs[notif.id] ? "bg-emerald-500" : "bg-border"}`}>
                    <div className={`h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${notifs[notif.id] ? "translate-x-4" : "translate-x-0"}`} />
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Data & Privacy */}
          <div className="section-reveal rounded-xl border border-border bg-card p-5" style={{ animationDelay: "180ms" }}>
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">
                Data & Privacy
              </h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              You can request an export of all your personal data at any time.
            </p>
            <a
              href={`mailto:${supportEmail}?subject=${exportSubject}&body=${exportBody}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              <Download className="h-3.5 w-3.5" />
              Request data export
            </a>
          </div>

          {/* Sign out */}
          <div className="section-reveal rounded-xl border border-red-100 bg-card p-5" style={{ animationDelay: "240ms" }}>
            <div className="mb-4 flex items-center gap-2">
              <LogOut className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-foreground">
                Sign out
              </h2>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Sign out of your account on this device.
            </p>
            <Button
              variant="unstyled"
              onClick={handleSignOut}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              {isPending ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
