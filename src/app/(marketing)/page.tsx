import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Users,
  Target,
  Send,
  MessageSquare,
  BarChart3,
  Sparkles,
  TrendingUp,
  Shield,
  Bot,
  Zap,
  ArrowUpRight,
  ChevronRight,
  Workflow,
  Globe,
  Heart,
  Layers,
  Network,
  CircuitBoard,
  Cpu,
  GitBranch,
  Gauge,
  Search,
  CalendarCheck,
  Mail,
  Eye,
  Plug,
  Video,
  FileText,
  Lock,
  MonitorCheck,
  ClipboardCheck,
  DollarSign,
  ScreenShare,
  Mic,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Dilliznt — AI-Native Talent Intelligence Platform",
  description:
    "AI-native talent intelligence platform. 25 specialized AI agents that screen, match, interview, and analyze autonomously — with full human oversight at every decision point.",
};

export default function HomePage() {
  return (
    <div>
      {/* ═══ HERO ═══ */}
      <section className="relative overflow-hidden bg-slate-950">
        {/* Ambient gradient orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-[300px] -right-[200px] w-[800px] h-[800px] bg-amber-500/[0.07] rounded-full blur-[120px]" />
          <div className="absolute -bottom-[200px] -left-[200px] w-[600px] h-[600px] bg-blue-500/[0.05] rounded-full blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-amber-400/[0.03] rounded-full blur-[80px] anim-pulse-soft" />
        </div>

        {/* Dot grid overlay */}
        <div className="absolute inset-0 dot-grid opacity-60" />

        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10 pt-20 pb-28 lg:pt-28 lg:pb-36">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Copy column */}
            <div className="lg:col-span-5">
              {/* Eyebrow */}
              <div className="anim-fade-up inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-400/20 bg-amber-400/[0.06] mb-8">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span className="text-[11px] font-medium text-amber-400 tracking-wide uppercase">
                  AI-native talent platform
                </span>
              </div>

              <h1 className="anim-fade-up delay-100 font-display text-[3.2rem] sm:text-[4rem] lg:text-[4.5rem] text-white leading-[0.95] mb-6 tracking-tight">
                Hire faster.
                <br />
                Hire smarter.
                <br />
                <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">Build lasting teams.</span>
              </h1>

              <p className="anim-fade-up delay-200 text-base sm:text-lg text-slate-400 mb-6 max-w-md leading-relaxed">
                25 specialized AI agents work alongside your team — screening
                candidates, conducting video interviews, generating offers, and
                surfacing insights. You make the decisions that matter.
              </p>

              {/* Key value props — compact */}
              <div className="anim-fade-up delay-200 grid grid-cols-3 gap-3 mb-10">
                {[
                  { icon: Gauge, label: "Velocity" },
                  { icon: Brain, label: "Intelligence" },
                  { icon: Heart, label: "Relationships" },
                ].map((v) => (
                  <div key={v.label} className="flex items-center gap-2 text-[13px] text-slate-400">
                    <v.icon className="w-3.5 h-3.5 text-amber-400/70" />
                    <span>{v.label}</span>
                  </div>
                ))}
              </div>

              <div className="anim-fade-up delay-300 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/get-started"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-amber-400 text-slate-950 font-semibold text-sm tracking-wide hover:bg-amber-300 transition-all group"
                >
                  Get started
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  href="/features"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 border border-white/10 text-white text-sm tracking-wide hover:border-white/25 hover:bg-white/[0.03] transition-all"
                >
                  See how it works
                </Link>
              </div>
            </div>

            {/* Product visualization */}
            <div className="lg:col-span-7 anim-slide-right delay-300">
              <div className="relative">
                {/* Main terminal card */}
                <div className="bg-slate-900/80 backdrop-blur-sm border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-black/40">
                  {/* Terminal bar */}
                  <div className="bg-slate-900 px-4 py-2 flex items-center gap-2 border-b border-white/[0.06]">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="text-xs text-slate-400 tracking-wider uppercase">
                        Pipeline &middot; Senior Engineer, Platform
                      </div>
                    </div>
                  </div>

                  {/* Pipeline header */}
                  <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-md bg-amber-400/10 flex items-center justify-center">
                        <Target className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">
                          Senior Engineer — Platform
                        </div>
                        <div className="text-xs text-slate-400">
                          Engineering &middot; Remote &middot; $180-220k
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[11px] text-emerald-400">Active</span>
                    </div>
                  </div>

                  {/* Pipeline stages */}
                  <div className="p-4">
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { stage: "APPLIED", count: 142, candidates: [
                          { name: "M. Kowalski", score: 92, tag: "Referred" },
                          { name: "J. Thompson", score: 87, tag: null },
                        ]},
                        { stage: "SCREENING", count: 34, candidates: [
                          { name: "P. Sharma", score: 95, tag: "Top 5%" },
                          { name: "A. Dubois", score: 91, tag: null },
                        ]},
                        { stage: "INTERVIEW", count: 12, candidates: [
                          { name: "S. Liu", score: 94, tag: "Round 2" },
                        ]},
                        { stage: "OFFER", count: 3, candidates: [
                          { name: "C. Wei", score: 97, tag: "Pending" },
                        ]},
                      ].map((col) => (
                        <div key={col.stage}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[11px] font-semibold text-slate-500 tracking-[0.15em]">
                              {col.stage}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {col.count}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {col.candidates.map((c) => (
                              <div
                                key={c.name}
                                className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 hover:bg-white/[0.05] transition-colors"
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[11px] font-medium text-slate-300">
                                    {c.name}
                                  </span>
                                  {c.tag && (
                                    <span className="text-[11px] font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded tracking-wide">
                                      {c.tag}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300"
                                      style={{ width: `${c.score}%` }}
                                    />
                                  </div>
                                  <span className="text-[11px] font-mono text-amber-400/80">
                                    {c.score}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Floating: AI insight */}
                <div className="absolute -left-4 lg:-left-8 bottom-16 anim-float bg-slate-900 border border-amber-400/20 rounded-lg p-3 max-w-[200px] shadow-xl shadow-black/40">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Brain className="w-3 h-3 text-amber-400" />
                    <span className="text-[11px] font-semibold text-amber-400 tracking-wide">AI INSIGHT</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    P. Sharma matches 6/7 key skills. Strong culture fit signal from open-source work.
                  </p>
                </div>

                {/* Floating: metric */}
                <div className="absolute -right-2 lg:-right-6 top-24 anim-float delay-200 bg-slate-900 border border-emerald-400/20 rounded-lg p-2.5 shadow-xl shadow-black/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-md bg-emerald-400/10 flex items-center justify-center">
                      <span className="text-sm font-mono font-bold text-emerald-400">18d</span>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-slate-300">Time-to-hire</div>
                      <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                        <TrendingUp className="w-2.5 h-2.5" />
                        32% faster
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom edge */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
      </section>

      {/* ═══ PARADIGM SHIFT — why AI-native matters ═══ */}
      <section className="bg-white py-28 relative">
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            {/* Left — positioning */}
            <div>
              <span className="text-xs font-semibold text-amber-600 tracking-[0.2em] uppercase block mb-4">
                Why AI-Native
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-6">
                Not AI bolted on.
                <br />
                AI at the <span className="text-amber-600 font-extrabold">core</span>.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8 max-w-lg">
                Legacy ATS tools bolt AI onto decades-old workflows. Dilliznt is
                built from the ground up with intelligence woven into every
                layer — from how candidates are discovered, to how interviews
                are conducted, to how offers are crafted.
              </p>

              <div className="space-y-5">
                {[
                  {
                    icon: Layers,
                    title: "25 specialized AI agents",
                    desc: "Not a single chatbot. Dedicated agents for screening, matching, interview prep, code evaluation, offer generation, and more — each tuned for its domain.",
                  },
                  {
                    icon: Video,
                    title: "Built-in video interviews with proctoring",
                    desc: "Live video interviews with screen monitoring, AI-guided questioning, real-time transcription, and automated panel synthesis.",
                  },
                  {
                    icon: CircuitBoard,
                    title: "Event-driven automation",
                    desc: "Every application, score change, and stage transition triggers intelligent workflows. No manual handoffs, no dropped balls.",
                  },
                  {
                    icon: Sparkles,
                    title: "Ask anything about your hiring data",
                    desc: "Natural language questions across your entire recruiting operation. Pipeline health, bottlenecks, source ROI — answers in seconds.",
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div className="w-9 h-9 rounded-md bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4.5 h-4.5 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-semibold text-slate-900 mb-0.5">{item.title}</h3>
                      <p className="text-[13px] text-slate-600 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — comparison table */}
            <div className="lg:mt-16">
              <div className="bg-slate-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-slate-300/20">
                <div className="px-5 py-3 border-b border-white/[0.06]">
                  <span className="text-[11px] font-semibold text-slate-500 tracking-[0.15em] uppercase">
                    Legacy ATS vs. AI-Native
                  </span>
                </div>
                <div className="divide-y divide-white/[0.06]">
                  {[
                    { dimension: "Candidate Discovery", legacy: "Manual keyword search", native: "Semantic AI matching across signals" },
                    { dimension: "Screening", legacy: "Resume keyword scan", native: "Multi-dimensional intelligence scoring" },
                    { dimension: "Interviews", legacy: "Unstructured, separate tools", native: "Built-in video with AI proctoring" },
                    { dimension: "Assessments", legacy: "Third-party bolt-ons", native: "Native code, personality & skills eval" },
                    { dimension: "Offers", legacy: "Spreadsheet guesswork", native: "AI-generated comp packages" },
                    { dimension: "Automations", legacy: "Simple if/then rules", native: "Event-driven agentic workflows" },
                    { dimension: "Analytics", legacy: "Backward-looking reports", native: "Ask questions in plain English" },
                    { dimension: "Relationship", legacy: "Transactional, per-role", native: "Long-term talent graph" },
                  ].map((row) => (
                    <div key={row.dimension} className="grid grid-cols-12 gap-0">
                      <div className="col-span-3 px-4 py-3 flex items-center">
                        <span className="text-xs font-medium text-slate-400">{row.dimension}</span>
                      </div>
                      <div className="col-span-4 px-4 py-3 border-l border-white/[0.06] flex items-center">
                        <span className="text-xs text-slate-500">{row.legacy}</span>
                      </div>
                      <div className="col-span-5 px-4 py-3 border-l border-amber-400/10 bg-amber-400/[0.03] flex items-center">
                        <span className="text-[11px] text-amber-400/90 font-medium">{row.native}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ THREE PILLARS — velocity, quality, relationships ═══ */}
      <section className="bg-slate-950 py-28 relative overflow-hidden">
        <div className="absolute inset-0 grain" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />

        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-20">
            <span className="text-xs font-semibold text-amber-400 tracking-[0.2em] uppercase block mb-4">
              Three Pillars
            </span>
            <h2 className="font-display text-4xl sm:text-5xl text-white leading-[1] mb-5">
              Velocity. Quality.
              <br />
              <span className="bg-gradient-to-r from-amber-400 to-amber-300 bg-clip-text text-transparent">Relationships.</span>
            </h2>
            <p className="text-base text-slate-400 leading-relaxed max-w-lg">
              Every feature in Dilliznt optimizes for at least one of these three
              outcomes — most optimize for all three simultaneously.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Pillar 1: Velocity */}
            <div className="bg-slate-900/60 border border-white/[0.08] rounded-xl overflow-hidden group hover:border-amber-400/20 hover:shadow-lg hover:shadow-amber-400/5 transition-all duration-300">
              <div className="p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-md bg-amber-400/10 flex items-center justify-center">
                    <Gauge className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Hiring Velocity</h3>
                    <p className="text-xs text-slate-400">Compress every stage</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {[
                    { metric: "Time-to-hire", value: "18 days", change: "-32%" },
                    { metric: "Screen-to-interview", value: "2.1 days", change: "-45%" },
                    { metric: "Offer turnaround", value: "48 hours", change: "-60%" },
                  ].map((m) => (
                    <div key={m.metric} className="flex items-center justify-between">
                      <span className="text-[13px] text-slate-400">{m.metric}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-mono font-bold text-white">{m.value}</span>
                        <span className="text-[11px] font-medium text-emerald-400">{m.change}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/[0.06] pt-5 space-y-2.5">
                  {[
                    "AI auto-screens applicants in seconds",
                    "Smart scheduling eliminates back-and-forth",
                    "Built-in video interviews — no tool switching",
                    "Automated stage progression rules",
                    "AI-generated offer packages ready to send",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                      <span className="text-[13px] text-slate-400">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pillar 2: Quality */}
            <div className="bg-slate-900/60 border border-white/[0.08] rounded-xl overflow-hidden group hover:border-blue-400/20 hover:shadow-lg hover:shadow-blue-400/5 transition-all duration-300">
              <div className="p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-md bg-blue-400/10 flex items-center justify-center">
                    <Brain className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Candidate Quality</h3>
                    <p className="text-xs text-slate-400">Intelligence-driven selection</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {[
                    { metric: "Quality-of-hire", value: "94/100", change: "+28%" },
                    { metric: "Offer acceptance", value: "89%", change: "+15%" },
                    { metric: "90-day retention", value: "96%", change: "+22%" },
                  ].map((m) => (
                    <div key={m.metric} className="flex items-center justify-between">
                      <span className="text-[13px] text-slate-400">{m.metric}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-mono font-bold text-white">{m.value}</span>
                        <span className="text-[11px] font-medium text-emerald-400">{m.change}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/[0.06] pt-5 space-y-2.5">
                  {[
                    "Multi-dimensional candidate scoring",
                    "Structured interviews with competency rubrics",
                    "Code evaluation and personality analysis",
                    "Panel synthesis with disagreement flagging",
                    "Mock interviews for candidate preparation",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                      <span className="text-[13px] text-slate-400">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pillar 3: Relationships */}
            <div className="bg-slate-900/60 border border-white/[0.08] rounded-xl overflow-hidden group hover:border-emerald-400/20 hover:shadow-lg hover:shadow-emerald-400/5 transition-all duration-300">
              <div className="p-6 lg:p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-md bg-emerald-400/10 flex items-center justify-center">
                    <Heart className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Talent Relationships</h3>
                    <p className="text-xs text-slate-400">Beyond the transaction</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {[
                    { metric: "Candidate NPS", value: "+72", change: "+40pts" },
                    { metric: "Warm pipeline", value: "3.2k", change: "always ready" },
                    { metric: "Re-engagement", value: "34%", change: "conversion" },
                  ].map((m) => (
                    <div key={m.metric} className="flex items-center justify-between">
                      <span className="text-[13px] text-slate-400">{m.metric}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-mono font-bold text-white">{m.value}</span>
                        <span className="text-[11px] font-medium text-emerald-400">{m.change}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/[0.06] pt-5 space-y-2.5">
                  {[
                    "Talent pools that stay warm automatically",
                    "Personalized nurture across channels",
                    "Candidate prep builds trust before interviews",
                    "Silver medalist re-engagement workflows",
                    "Every interaction builds a lasting talent graph",
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                      <span className="text-[13px] text-slate-400">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
      </section>

      {/* ═══ CANDIDATE INTELLIGENCE ═══ */}
      <section className="bg-white py-28 relative">
        <div className="absolute inset-0 dot-grid opacity-30" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <div className="lg:col-span-5">
              <span className="text-xs font-semibold text-amber-600 tracking-[0.2em] uppercase block mb-4">
                Candidate Intelligence
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-6">
                AI that understands
                <br />
                <span className="bg-gradient-to-r from-amber-600 to-amber-500 bg-clip-text text-transparent">who to hire</span>.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8 max-w-md">
                Every candidate scored across skills, experience, culture signals,
                and growth potential. Fully explainable AI shows exactly why —
                no black boxes.
              </p>

              <div className="space-y-4 mb-8">
                {[
                  "Pillar-based talent scoring with evidence-gated signals",
                  "Career trajectory and growth potential analysis",
                  "Culture fit signals from communication patterns",
                  "Automated resume parsing and profile enrichment",
                  "Side-by-side candidate comparison for any role",
                  "Contextual recommendations for each role",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-1 h-1 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                    <span className="text-[13px] text-slate-500">{item}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/features"
                className="inline-flex items-center gap-2 text-[13px] font-medium text-amber-600 hover:text-amber-500 tracking-wide group"
              >
                Explore intelligence
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>

            {/* Candidate profile card */}
            <div className="lg:col-span-7">
              <div className="bg-slate-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-slate-300/20">
                {/* Header */}
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-gradient-to-br from-amber-400/20 to-amber-400/5 flex items-center justify-center">
                      <span className="text-sm font-semibold text-amber-400">PS</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Priya Sharma</div>
                      <div className="text-xs text-slate-400">Senior Engineer &middot; 8 yrs &middot; San Francisco</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-400/10 rounded">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[11px] font-medium text-emerald-400 tracking-wide">STRONG MATCH</span>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  {/* Score grid */}
                  <div className="grid grid-cols-5 gap-3">
                    {[
                      { label: "Overall", score: 95, color: "text-amber-400" },
                      { label: "Skills", score: 92, color: "text-blue-400" },
                      { label: "Culture", score: 88, color: "text-emerald-400" },
                      { label: "Growth", score: 94, color: "text-slate-300" },
                      { label: "Retention", score: 91, color: "text-rose-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 text-center">
                        <div className={`text-xl font-mono font-bold ${s.color}`}>{s.score}</div>
                        <div className="text-xs text-slate-400 tracking-wider uppercase mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-1.5">
                    {["TypeScript", "React", "Node.js", "PostgreSQL", "Kubernetes"].map((skill) => (
                      <span key={skill} className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded tracking-wide">
                        {skill}
                      </span>
                    ))}
                    <span className="text-[11px] font-medium text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded tracking-wide">
                      Go (learning)
                    </span>
                  </div>

                  {/* AI Analysis */}
                  <div className="bg-amber-400/[0.04] border border-amber-400/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] font-semibold text-amber-400 tracking-[0.15em] uppercase">
                        AI Analysis
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                      Strong systems thinking evident in open-source contributions.
                      Communication style aligns with team culture. Growth trajectory
                      indicates senior+ potential within 12 months. 89% probability of
                      accepting within offered range.
                    </p>
                  </div>

                  {/* Next best actions */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { action: "Schedule technical", icon: CalendarCheck, color: "text-blue-400" },
                      { action: "Send team intro", icon: Mail, color: "text-emerald-400" },
                      { action: "Prep interview guide", icon: MessageSquare, color: "text-amber-400" },
                    ].map((a) => (
                      <div key={a.action} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 flex items-center gap-2">
                        <a.icon className={`w-3 h-3 ${a.color} flex-shrink-0`} />
                        <span className="text-[11px] text-slate-400">{a.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DILLIZNT VIDEO INTERVIEWS ═══ */}
      <section className="bg-slate-950 py-28 relative overflow-hidden">
        <div className="absolute inset-0 grain" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/[0.06] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <div className="lg:col-span-5">
              <span className="anim-fade-up text-xs font-semibold text-blue-400 tracking-[0.2em] uppercase block mb-4">
                Dilliznt Video Interviews
              </span>
              <h2 className="anim-fade-up delay-100 font-display text-4xl sm:text-5xl text-white leading-[1] mb-6">
                Interviews that
                <br />
                run <span className="text-blue-400 font-extrabold">themselves</span>.
              </h2>
              <p className="text-base text-slate-400 leading-relaxed mb-8 max-w-md">
                Built-in video interviews with screen proctoring, AI-guided
                structured questioning, live transcription, and automated panel
                synthesis. No third-party tools. No context switching.
              </p>

              <div className="space-y-6 mb-10">
                {[
                  {
                    icon: Video,
                    title: "Live Video with Proctoring",
                    desc: "Multi-screen monitoring, screenshot streaming to panelists, and recording with automatic transcription.",
                  },
                  {
                    icon: ClipboardCheck,
                    title: "AI-Generated Interview Plans",
                    desc: "Tailored questions per role and candidate — with follow-ups, competency mapping, risk probes, and scoring guidance.",
                  },
                  {
                    icon: Users,
                    title: "Multi-Panel Synthesis",
                    desc: "AI aggregates scorecards across panelists with seniority-weighted scoring, disagreement flagging, and hire recommendations.",
                  },
                  {
                    icon: Bot,
                    title: "Candidate Mock Interviews",
                    desc: "Candidates practice with AI before the real thing — building confidence and giving your team better-prepared interviewees.",
                  },
                ].map((f) => (
                  <div key={f.title} className="flex gap-4">
                    <div className="w-8 h-8 rounded-md bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <f.icon className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-white mb-1">{f.title}</h3>
                      <p className="text-[13px] text-slate-400 leading-relaxed">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/features"
                className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-400 hover:text-blue-300 tracking-wide group"
              >
                Explore interviews
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>

            {/* Interview room mockup */}
            <div className="lg:col-span-7 space-y-4">
              <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.08] rounded-xl overflow-hidden">
                {/* Room header */}
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-blue-400/10 flex items-center justify-center">
                      <Video className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Technical Interview — Round 2</div>
                      <div className="text-xs text-slate-400">Senior Engineer, Platform &middot; 60 min</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-rose-400/10 rounded">
                      <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                      <span className="text-[11px] font-medium text-rose-400 tracking-wide">REC</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-400/10 rounded">
                      <ScreenShare className="w-3 h-3 text-emerald-400" />
                      <span className="text-[11px] font-medium text-emerald-400 tracking-wide">PROCTORED</span>
                    </div>
                  </div>
                </div>

                {/* Video grid */}
                <div className="p-4">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { name: "P. Sharma", role: "Candidate", color: "from-amber-400/20 to-amber-400/5" },
                      { name: "D. Kim", role: "Hiring Manager", color: "from-blue-400/20 to-blue-400/5" },
                      { name: "R. Chen", role: "Tech Lead", color: "from-emerald-400/20 to-emerald-400/5" },
                    ].map((p) => (
                      <div key={p.name} className="bg-gradient-to-br from-white/[0.04] to-white/[0.01] border border-white/[0.08] rounded-lg aspect-video flex flex-col items-center justify-center relative">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${p.color} flex items-center justify-center mb-2`}>
                          <span className="text-xs font-semibold text-slate-300">{p.name.split(" ").map(n => n[0]).join("")}</span>
                        </div>
                        <span className="text-[11px] font-medium text-slate-300">{p.name}</span>
                        <span className="text-xs text-slate-400">{p.role}</span>
                        <div className="absolute bottom-2 left-2 flex items-center gap-1">
                          <Mic className="w-2.5 h-2.5 text-emerald-400" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Live scorecard strip */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-[11px] font-semibold text-slate-500 tracking-[0.15em] uppercase">Live Scorecard</span>
                      </div>
                      <span className="text-xs text-slate-400">Question 4/7 &middot; System Design</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { comp: "System Design", score: "4/5", status: "bg-amber-400" },
                        { comp: "Coding", score: "5/5", status: "bg-emerald-400" },
                        { comp: "Communication", score: "4/5", status: "bg-blue-400" },
                        { comp: "Leadership", score: "—", status: "bg-white/10" },
                      ].map((c) => (
                        <div key={c.comp} className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${c.status}`} />
                          <span className="text-[11px] text-slate-500">{c.comp}</span>
                          <span className="text-[11px] font-mono text-slate-400 ml-auto">{c.score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating: transcript */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.08] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Mic className="w-3 h-3 text-amber-400" />
                    <span className="text-[11px] font-semibold text-amber-400 tracking-wide">LIVE TRANSCRIPT</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    &ldquo;...I&rsquo;d partition the data by region first, then use consistent hashing across the service layer...&rdquo;
                  </p>
                </div>
                <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.08] rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <MonitorCheck className="w-3 h-3 text-emerald-400" />
                    <span className="text-[11px] font-semibold text-emerald-400 tracking-wide">SCREEN MONITOR</span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    2 screens detected &middot; IDE active &middot; No tab switches &middot; Environment verified
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
      </section>

      {/* ═══ ENGAGEMENT & TALENT POOLS ═══ */}
      <section className="bg-slate-50 py-28 relative border-y border-slate-200">
        <div className="absolute inset-0 dot-grid opacity-20" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Campaign dashboard */}
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-lg shadow-slate-200/50">
                {/* Header */}
                <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-2">
                    <Send className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium text-slate-900">Engagement Campaigns</span>
                  </div>
                  <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded tracking-wide">
                    3 ACTIVE
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  {[
                    { name: "Q1 Engineering Outreach", pool: "Senior Engineers", sent: 234, open: 81, reply: 29, booked: 12 },
                    { name: "Product Design Pipeline", pool: "UX/UI Designers", sent: 156, open: 82, reply: 28, booked: 8 },
                    { name: "Leadership Nurture", pool: "VP+ Candidates", sent: 42, open: 90, reply: 50, booked: 6 },
                  ].map((c) => (
                    <div key={c.name} className="bg-slate-50 border border-slate-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-[13px] font-medium text-slate-900">{c.name}</div>
                          <div className="text-xs text-slate-400">{c.pool}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </div>
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <div className="text-lg font-mono font-bold text-slate-800">{c.sent}</div>
                          <div className="text-[11px] text-slate-500 tracking-wider uppercase">Sent</div>
                        </div>
                        <div>
                          <div className="text-lg font-mono font-bold text-blue-600">{c.open}%</div>
                          <div className="text-[11px] text-slate-500 tracking-wider uppercase">Opened</div>
                        </div>
                        <div>
                          <div className="text-lg font-mono font-bold text-emerald-600">{c.reply}%</div>
                          <div className="text-[11px] text-slate-500 tracking-wider uppercase">Replied</div>
                        </div>
                        <div>
                          <div className="text-lg font-mono font-bold text-amber-600">{c.booked}</div>
                          <div className="text-[11px] text-slate-500 tracking-wider uppercase">Booked</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className="lg:col-span-5 order-1 lg:order-2">
              <span className="text-xs font-semibold text-blue-600 tracking-[0.2em] uppercase block mb-4">
                Talent Pools & Engagement
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-6">
                Build relationships
                <br />
                <span className="text-blue-600">before you need them</span>.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                Dynamic talent pools, personalized outreach campaigns, and
                engagement scoring. Your pipeline stays warm so roles fill fast,
                and candidates feel valued — not spammed.
              </p>

              <div className="space-y-4 mb-8">
                {[
                  "AI-curated pools with auto-refresh and segmentation",
                  "Multi-channel campaigns — email, LinkedIn, SMS",
                  "AI-generated personalized messaging per candidate",
                  "Engagement scoring with optimal send timing",
                  "Silver medalist re-engagement for future roles",
                  "Candidate experience tracking at every touchpoint",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-1 h-1 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                    <span className="text-[13px] text-slate-500">{item}</span>
                  </div>
                ))}
              </div>

              <Link
                href="/features"
                className="inline-flex items-center gap-2 text-[13px] font-medium text-blue-600 hover:text-blue-500 tracking-wide group"
              >
                Explore engagement
                <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ASK AI ═══ */}
      <section className="bg-white py-28 relative">
        <div className="absolute inset-0 dot-grid opacity-20" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-5">
              <span className="anim-fade-up text-xs font-semibold text-amber-600 tracking-[0.2em] uppercase block mb-4">
                Ask AI
              </span>
              <h2 className="anim-fade-up delay-100 font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-6">
                Your hiring data,
                <br />
                <span className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 bg-clip-text text-transparent">one question away</span>.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8 max-w-md">
                Skip the dashboards. Ask anything about your hiring operation
                in plain English — pipeline health, candidate comparisons,
                bottleneck analysis, source effectiveness — and get
                immediate, data-backed answers.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  { title: "Pipeline Intelligence", desc: "\"Which roles are at risk?\" \"Where is hiring stuck?\" Instant answers across your entire operation." },
                  { title: "Candidate Discovery", desc: "\"Who in our talent pool matches the new VP role?\" Surface candidates you didn't know you had." },
                  { title: "Hiring Analytics", desc: "\"What's our offer acceptance rate this quarter?\" No more digging through spreadsheets." },
                  { title: "Proactive Alerts", desc: "AI flags stalled applications, competing offers, and pipeline bottlenecks before they become problems." },
                ].map((item) => (
                  <div key={item.title} className="border-l-2 border-amber-200 pl-4 py-1">
                    <h4 className="text-sm font-semibold text-slate-900 mb-0.5">{item.title}</h4>
                    <p className="text-[13px] text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Ask AI panel mockup */}
            <div className="lg:col-span-7">
              <div className="bg-slate-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-slate-300/20">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-amber-400/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Ask AI</div>
                    <div className="text-xs text-slate-400">Ask anything about your hiring data</div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* User query */}
                  <div className="flex justify-end">
                    <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-2.5 max-w-[80%]">
                      <p className="text-[12px] text-amber-300">Which roles need attention this week?</p>
                    </div>
                  </div>

                  {/* AI response */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-3">
                    <p className="text-[12px] text-slate-300 leading-relaxed">
                      3 roles need your attention:
                    </p>
                    <div className="space-y-2">
                      {[
                        { color: "rose", title: "Staff Engineer — Platform", desc: "Pipeline is thin: only 2 in screening. 4 strong candidates in your ML talent pool match 80%+ requirements." },
                        { color: "amber", title: "Product Manager — Growth", desc: "2 offers pending for 5+ days. LinkedIn activity suggests competing offers. Recommend follow-up calls today." },
                        { color: "blue", title: "Design Lead — Brand", desc: "8 interviews completed, no scorecards submitted. 3 panelists have outstanding feedback." },
                      ].map((item) => {
                        const colorMap: Record<string, { bg: string; border: string; text: string }> = {
                          rose: { bg: "bg-rose-400/[0.06]", border: "border-rose-400/10", text: "text-rose-400" },
                          amber: { bg: "bg-amber-400/[0.06]", border: "border-amber-400/10", text: "text-amber-400" },
                          blue: { bg: "bg-blue-400/[0.06]", border: "border-blue-400/10", text: "text-blue-400" },
                        };
                        const c = colorMap[item.color]!;
                        return (
                          <div key={item.title} className={`${c.bg} border ${c.border} rounded-lg p-3`}>
                            <div className={`text-[11px] font-medium ${c.text} mb-1`}>{item.title}</div>
                            <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Suggestion pills */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {[
                      "Show me pipeline health",
                      "Compare top candidates for Staff Eng",
                      "What needs my attention today?",
                    ].map((q) => (
                      <span key={q} className="text-[11px] text-slate-500 bg-white/[0.04] border border-white/[0.06] rounded-full px-3 py-1.5">
                        {q}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ AI AGENTS — the full picture ═══ */}
      <section className="bg-slate-950 py-28 relative overflow-hidden">
        <div className="absolute inset-0 grain" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-600/[0.06] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/[0.04] rounded-full blur-[100px]" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-16">
            <span className="text-xs font-semibold text-amber-400 tracking-[0.2em] uppercase block mb-4">
              25 AI Agents
            </span>
            <h2 className="font-display text-4xl sm:text-5xl text-white leading-[1] mb-5">
              A specialist agent
              <br />
              for <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">every stage</span>.
            </h2>
            <p className="text-base text-slate-400 leading-relaxed max-w-lg">
              Not a single chatbot doing everything. 25 purpose-built agents, each
              tuned for its domain — from resume parsing to offer negotiation strategy.
              They trigger automatically via events, or you invoke them on demand.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                category: "Screening & Scoring",
                color: "amber",
                agents: [
                  "Candidate Intelligence",
                  "Candidate Scorer",
                  "Candidate Comparer",
                  "Resume Parser",
                ],
              },
              {
                category: "Matching & Pools",
                color: "emerald",
                agents: [
                  "Role-Candidate Matcher",
                  "Pool Candidate Matcher",
                  "Pool Insight Analyzer",
                  "Role Fulfilment Tracker",
                ],
              },
              {
                category: "Interviews & Assessment",
                color: "blue",
                agents: [
                  "Interview Prep Generator",
                  "Interview Synthesizer",
                  "Code Evaluator",
                  "Personality Analyzer",
                  "Assessment Evaluator",
                  "Candidate Prep Coach",
                ],
              },
              {
                category: "Offers & Operations",
                color: "rose",
                agents: [
                  "Offer Generator",
                  "Close Risk Analyst",
                  "Offer Letter Extractor",
                  "Pay Stub Extractor",
                  "Communication Drafter",
                  "Recruiter Briefing",
                  "Role Wizard",
                ],
              },
            ].map((group) => {
              const colorMap: Record<string, { bg: string; border: string; text: string; dot: string }> = {
                amber: { bg: "bg-amber-400/[0.06]", border: "border-amber-400/15", text: "text-amber-400", dot: "bg-amber-400" },
                emerald: { bg: "bg-emerald-400/[0.06]", border: "border-emerald-400/15", text: "text-emerald-400", dot: "bg-emerald-400" },
                blue: { bg: "bg-blue-400/[0.06]", border: "border-blue-400/15", text: "text-blue-400", dot: "bg-blue-400" },
                rose: { bg: "bg-rose-400/[0.06]", border: "border-rose-400/15", text: "text-rose-400", dot: "bg-rose-400" },
              };
              const c = colorMap[group.color]!;
              return (
                <div key={group.category} className={`${c.bg} border ${c.border} rounded-xl p-5 hover:scale-[1.02] transition-transform duration-300`}>
                  <h3 className={`text-[11px] font-semibold ${c.text} tracking-[0.15em] uppercase mb-4`}>
                    {group.category}
                  </h3>
                  <div className="space-y-2.5">
                    {group.agents.map((agent) => (
                      <div key={agent} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                        <span className="text-[12px] text-slate-400">{agent}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[13px] text-slate-600 mt-8 text-center">
            Every agent fires automatically via event-driven triggers — or invoke any agent on demand through the UI.
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
      </section>

      {/* ═══ OFFER INTELLIGENCE ═══ */}
      <section className="bg-white py-28 relative">
        <div className="absolute inset-0 dot-grid opacity-20" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Offer card */}
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="bg-slate-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-slate-300/20">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-emerald-400/10 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Offer Package — Priya Sharma</div>
                      <div className="text-xs text-slate-400">Senior Engineer &middot; Generated by AI</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded tracking-wide">
                    COMPETITIVE
                  </span>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Base Salary", value: "$195,000", note: "75th percentile" },
                      { label: "Equity (4yr)", value: "$120,000", note: "Standard vest" },
                      { label: "Sign-On Bonus", value: "$25,000", note: "Recommended" },
                    ].map((comp) => (
                      <div key={comp.label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                        <div className="text-lg font-mono font-bold text-white">{comp.value}</div>
                        <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-0.5">{comp.label}</div>
                        <div className="text-[11px] text-emerald-400 mt-1">{comp.note}</div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-amber-400/[0.04] border border-amber-400/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] font-semibold text-amber-400 tracking-[0.15em] uppercase">AI Recommendation</span>
                    </div>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                      Based on current compensation ($172k base), market data, and candidate signals,
                      this package represents a 13% increase with strong equity upside. Sign-on bonus
                      recommended to offset unvested equity from current role. 89% predicted acceptance rate.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Close Risk</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-400" style={{ width: "22%" }} />
                        </div>
                        <span className="text-[11px] font-mono text-emerald-400">Low</span>
                      </div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                      <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Negotiation Room</div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono text-slate-400">$190k</span>
                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative">
                          <div className="h-full rounded-full bg-amber-400" style={{ width: "65%" }} />
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">$210k</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Copy */}
            <div className="lg:col-span-5 order-1 lg:order-2">
              <span className="text-xs font-semibold text-emerald-600 tracking-[0.2em] uppercase block mb-4">
                Offer Intelligence
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-6">
                Offers that <span className="text-emerald-600 font-extrabold">close</span>.
                <br />
                Not guesswork.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                AI generates competitive offer packages based on current compensation,
                market data, and candidate signals. Close risk analysis and negotiation
                strategy — so you know exactly where you stand.
              </p>

              <div className="space-y-3">
                {[
                  { title: "AI-Generated Packages", desc: "Compensation recommendations calibrated to candidate history, market data, and role band." },
                  { title: "Close Risk Analysis", desc: "Composite risk scoring with ownership assignments and a checklist to close confidently." },
                  { title: "Offer Letter & Pay Stub Parsing", desc: "Upload current offer letters or pay stubs — AI extracts structured compensation data automatically." },
                  { title: "Negotiation Intelligence", desc: "Floor/ceiling ranges, hike percentages, and rationale to guide every negotiation." },
                ].map((item) => (
                  <div key={item.title} className="border-l-2 border-emerald-200 pl-4 py-1">
                    <h4 className="text-sm font-semibold text-slate-900 mb-0.5">{item.title}</h4>
                    <p className="text-[13px] text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PLATFORM ═══ */}
      <section className="bg-slate-50 py-16 border-y border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="text-center mb-10">
            <h3 className="font-display text-2xl text-slate-900">Enterprise-grade platform</h3>
            <p className="text-[13px] text-slate-500 mt-2">Security, integrations, and reliability built into every layer.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Users, title: "Multi-Tenant Isolation", desc: "Org-scoped data with role-based access" },
              { icon: Shield, title: "SSO Authentication", desc: "Google, GitHub & LinkedIn OAuth" },
              { icon: Eye, title: "AI Audit Trail", desc: "Every agent action logged & traceable" },
              { icon: Lock, title: "Encrypted Integrations", desc: "AES-256-GCM for all third-party tokens" },
            ].map((f, i) => (
              <div key={i} className="text-center p-6">
                <div className="w-10 h-10 rounded-md bg-white border border-slate-200 flex items-center justify-center mx-auto mb-3">
                  <f.icon className="w-5 h-5 text-slate-500" />
                </div>
                <h3 className="text-sm font-semibold text-slate-900 mb-0.5">{f.title}</h3>
                <p className="text-xs text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="bg-slate-950 py-28 relative overflow-hidden">
        <div className="absolute inset-0 grain" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-500/[0.04] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-3xl mx-auto px-6 lg:px-10 text-center">
          <h2 className="font-display text-5xl sm:text-6xl text-white leading-[0.95] mb-6">
            Ready to see it
            <br />
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">in action</span>?
          </h2>
          <p className="text-base text-slate-500 mb-10 max-w-md mx-auto leading-relaxed">
            Tell us about your team and hiring needs. We&rsquo;ll set up
            your workspace and walk you through everything.
          </p>
          <Link
            href="/get-started"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-amber-400 text-slate-950 font-semibold text-sm tracking-wide hover:bg-amber-300 transition-all group"
          >
            Get started
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        </div>
      </section>
    </div>
  );
}
