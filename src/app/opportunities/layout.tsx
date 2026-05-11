import Link from "next/link";

export default function OpportunitiesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[oklch(0.97_0.006_55)]">
      <header className="sticky top-0 z-20 border-b border-stone-200/40 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/opportunities" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="Dilliznt" className="h-7 w-7" />
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold tracking-tight text-foreground">
                Dilliznt
              </div>
              <div className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Opportunities
              </div>
            </div>
          </Link>

          <nav className="flex items-center gap-3 text-xs font-medium">
            <Link
              href="/auth/sign-in?mode=candidate"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/auth/sign-in?mode=candidate"
              className="rounded-md bg-foreground px-3 py-1.5 text-background transition-opacity hover:opacity-90"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
