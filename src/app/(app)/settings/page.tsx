import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { ThemePicker } from "./ThemePicker";

export default function SettingsPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personal preferences. Org-level settings live on a separate admin surface.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            Theme — persists in <span className="font-mono text-foreground">localStorage</span>.
          </div>
          <ThemePicker />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Shortcuts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span>Open command palette</span>
            <kbd className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘ K
            </kbd>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>More shortcuts</span>
            <span className="text-[11px]">coming soon</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
