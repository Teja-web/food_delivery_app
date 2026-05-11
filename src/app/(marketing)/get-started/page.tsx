import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { LeadForm } from "./lead-form";

export const metadata: Metadata = {
  title: "Get Started | Dilliznt",
  description:
    "Tell us about your team and hiring needs. We'll reach out within one business day to set up your Dilliznt workspace.",
};

export default function GetStartedPage() {
  return (
    <div className="bg-slate-950 min-h-[calc(100vh-56px)] relative overflow-hidden">
      {/* Ambient gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-[200px] right-[10%] w-[600px] h-[600px] bg-amber-500/[0.06] rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] -left-[100px] w-[400px] h-[400px] bg-blue-500/[0.04] rounded-full blur-[100px]" />
      </div>
      <div className="absolute inset-0 dot-grid opacity-40" />

      <div className="relative max-w-[1100px] mx-auto px-6 lg:px-10 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-start">
          {/* Left — copy */}
          <div className="lg:sticky lg:top-28">
            <h1 className="font-display text-4xl sm:text-5xl text-white leading-[0.95] mb-6 tracking-tight">
              Let&rsquo;s get you
              <br />
              <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">started</span>.
            </h1>
            <p className="text-base text-slate-400 leading-relaxed mb-10 max-w-sm">
              Tell us about your team and what you&rsquo;re hiring for.
              We&rsquo;ll reach out within one business day to get your
              workspace set up.
            </p>

            <div className="space-y-5">
              {[
                "Personalized onboarding for your team",
                "All 25 AI agents configured to your workflow",
                "Calendar and email integrations connected",
                "First role live within the first session",
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-slate-300">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — form */}
          <LeadForm />
        </div>
      </div>
    </div>
  );
}
