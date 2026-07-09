import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import { Logo } from "./Logo";

const SIGN_IN = "/auth/sign-in";

type NavKey = "landing" | "manifesto" | "how" | "integrations" | "pricing";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "manifesto", href: "/manifesto", label: "Manifesto" },
  { key: "how", href: "/how-it-works", label: "How it works" },
  { key: "integrations", href: "/connect", label: "Integrations" },
  { key: "pricing", href: "/pricing", label: "Pricing" },
];

export function MarketingShell({
  active,
  children,
}: {
  active?: NavKey;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="group flex items-center gap-2.5">
            <Logo className="h-8 w-8 shrink-0" />
            <div className="min-w-0 leading-tight">
              <div className="font-display text-[15px] font-bold tracking-tight text-foreground">
                Coznt
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400">
                AIDLC Governed
              </div>
            </div>
          </Link>
          <nav className="hidden items-center gap-7 text-[13px] text-muted-foreground md:flex">
            {NAV.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`transition-colors hover:text-foreground ${
                  active === item.key ? "text-foreground" : ""
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href={SIGN_IN}
              className="hidden text-[13px] text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Sign in
            </Link>
            <Button asChild size="sm" className="h-8">
              <Link href={SIGN_IN}>
                Get access <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-border/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <Logo className="h-7 w-7 shrink-0" />
              <div className="leading-tight">
                <div className="font-display text-[14px] font-semibold text-foreground">
                  Coznt
                </div>
                <div className="text-[9.5px] font-medium uppercase tracking-[0.2em] text-amber-400">
                  AIDLC Governed
                </div>
              </div>
            </Link>
            <p className="mt-3 max-w-xs text-[12px] leading-[1.55] text-muted-foreground">
              The autonomy ledger for engineering organizations. Every action recorded.
              Every outcome assessed. Every promotion explainable.
            </p>
          </div>

          <FooterCol
            title="Product"
            links={[
              { href: "/how-it-works", label: "How it works" },
              { href: "/connect", label: "Integrations" },
              { href: "/pricing", label: "Pricing" },
            ]}
          />
          <FooterCol
            title="Thesis"
            links={[
              { href: "/manifesto", label: "Manifesto" },
              { href: "/#moments", label: "The five moments" },
              { href: "/#phases", label: "Six phases" },
            ]}
          />
          <FooterCol
            title="Access"
            links={[
              { href: SIGN_IN, label: "Sign in" },
              { href: SIGN_IN, label: "Get access" },
              { href: "/pricing#design-partner", label: "Design partner program" },
            ]}
          />
        </div>
        <div className="border-t border-border/40">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 px-6 py-5 text-[12px] text-muted-foreground md:flex-row md:items-center">
            <span>AI-native SDLC, made auditable.</span>
            <span className="font-mono text-[11px]">© 2026 Coznt</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </div>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-[13px] text-foreground/80 transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
