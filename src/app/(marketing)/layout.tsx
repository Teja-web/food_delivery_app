import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="marketing min-h-screen flex flex-col">
      {/* Header — minimal editorial bar */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-center gap-2 group">
              <img src="/logo.svg" alt="Dilliznt" className="h-8 w-8 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Dilliznt</p>
                <p className="text-[10px] uppercase tracking-widest text-amber-400">Talent Intelligence</p>
              </div>
            </Link>

            <div className="flex items-center gap-6">
              <Link
                href="/auth/sign-in"
                className="text-[13px] text-slate-400 hover:text-white transition-colors tracking-wide hidden sm:block"
              >
                Sign in
              </Link>
              <Link
                href="/get-started"
                className="text-[13px] font-medium px-5 py-2 bg-amber-400 text-slate-950 hover:bg-amber-300 transition-all tracking-wide"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-slate-950 text-slate-400 border-t border-white/[0.04]">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="Dilliznt" className="h-6 w-6 shrink-0" />
              <span className="font-semibold text-white text-sm">Dilliznt</span>
            </div>

            {/* Links */}
            <nav className="flex items-center gap-6">
              <Link
                href="/privacy"
                className="text-[13px] text-slate-400 hover:text-amber-400 transition-colors"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-[13px] text-slate-400 hover:text-amber-400 transition-colors"
              >
                Terms
              </Link>
            </nav>
          </div>

          <div className="mt-8 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-[11px] text-slate-500">
              &copy; {new Date().getFullYear()} Dilliznt. All rights reserved.
            </span>
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-slate-500">All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
