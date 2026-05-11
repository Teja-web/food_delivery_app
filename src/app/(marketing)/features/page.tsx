import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  Users,
  Target,
  Send,
  MessageSquare,
  BarChart3,
  Sparkles,
  Bot,
  Zap,
  Search,
  Shield,
  Globe,
  Lock,
  Workflow,
  TrendingUp,
  ChevronRight,
  CalendarCheck,
  Mail,
  Eye,
  Heart,
  Layers,
  Network,
  GitBranch,
  Cpu,
  Gauge,
  FileText,
  Plug,
  Activity,
  LineChart,
  PieChart,
  CircuitBoard,
  Video,
  DollarSign,
  ScreenShare,
  Mic,
  ClipboardCheck,
  MonitorCheck,
  Code,
  UserCheck,
  Fingerprint,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Features | Dilliznt — AI-Native Talent Intelligence Platform",
  description:
    "Explore Dilliznt's complete feature set: 25 specialized AI agents, built-in video interviews with proctoring, offer intelligence, Ask AI, talent pools, assessments, and event-driven automation.",
};

export default function FeaturesPage() {
  return (
    <div>
      {/* ═══ HERO ═══ */}
      <section className="bg-slate-950 pt-20 pb-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-[200px] right-0 w-[600px] h-[600px] bg-amber-500/[0.06] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-blue-500/[0.04] rounded-full blur-[100px]" />
        </div>
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />

        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-12 items-end">
            <div>
              <span className="text-xs font-semibold text-amber-400 tracking-[0.2em] uppercase block mb-6 anim-fade-up">
                Platform Features
              </span>
              <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl text-white leading-[0.92] mb-6 anim-fade-up delay-100">
                Intelligence at
                <br />
                <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-500 bg-clip-text text-transparent">every stage</span>.
              </h1>
              <p className="text-lg text-slate-400 max-w-lg leading-relaxed anim-fade-up delay-200">
                A unified, AI-native talent acquisition platform with specialized
                agents for every part of hiring — from screening through offer
                close, with built-in video interviews and real-time intelligence.
              </p>
            </div>

            {/* Feature count strip */}
            <div className="anim-fade-up delay-300">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { value: "25", label: "AI Agents" },
                  { value: "14+", label: "Auto Workflows" },
                  { value: "40+", label: "Event Triggers" },
                  { value: "4", label: "Integrations" },
                ].map((s) => (
                  <div key={s.label} className="text-center">
                    <div className="font-display text-3xl text-white mb-1">{s.value}</div>
                    <div className="text-[11px] text-slate-500 tracking-wider uppercase">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURE 1: CANDIDATE INTELLIGENCE ═══ */}
      <section className="bg-white py-28 relative">
        <div className="absolute inset-0 dot-grid opacity-20" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-5">
              <span className="text-xs font-semibold text-amber-600 tracking-[0.2em] uppercase block mb-4">
                Candidate Intelligence
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-6">
                AI-powered
                <br />
                candidate scoring.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8 max-w-md">
                Every candidate evaluated with pillar-based scoring — skills, experience,
                culture fit, growth potential, and career trajectory. Evidence-gated
                signals mean every score is backed by data.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  { title: "Pillar-Based Talent Scoring", desc: "6-7 weighted pillars per role family, each with sub-signals. Letter rating, career outlook, and confidence level." },
                  { title: "Candidate Comparison", desc: "Side-by-side evaluation of multiple candidates for any role, with ranked recommendations and trade-off analysis." },
                  { title: "Profile Enrichment", desc: "Automated resume parsing extracts work history, education, skills, and builds a structured candidate profile." },
                  { title: "Career Trajectory Analysis", desc: "AI evaluates career velocity, role progression, and growth potential — positive, stable, or negative outlook." },
                  { title: "Validation Gaps", desc: "Surfaces top 3 areas that need verification before making a hiring decision." },
                ].map((item) => (
                  <div key={item.title} className="border-l-2 border-amber-200 pl-4 py-1">
                    <h4 className="text-sm font-semibold text-slate-900 mb-0.5">{item.title}</h4>
                    <p className="text-[13px] text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              <Link
                href="/get-started"
                className="inline-flex items-center gap-2 px-6 py-3 bg-slate-950 text-amber-400 text-[13px] font-medium tracking-wide hover:bg-slate-900 transition-all group"
              >
                Get started
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            {/* Candidate card */}
            <div className="lg:col-span-7 relative">
              <div className="bg-slate-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-slate-300/30">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-gradient-to-br from-amber-400/20 to-amber-400/5 flex items-center justify-center">
                      <span className="text-sm font-semibold text-amber-400">CW</span>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Chen Wei</div>
                      <div className="text-xs text-slate-400">Staff Engineer &middot; 12 yrs &middot; NYC</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-400/10 rounded">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    <span className="text-[11px] font-medium text-amber-400 tracking-wide">TOP 5%</span>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: "Overall", score: 97, color: "text-amber-400" },
                      { label: "Skills", score: 95, color: "text-blue-400" },
                      { label: "Culture", score: 92, color: "text-emerald-400" },
                      { label: "Growth", score: 98, color: "text-slate-300" },
                      { label: "Retention", score: 90, color: "text-rose-400" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 text-center">
                        <div className={`text-xl font-mono font-bold ${s.color}`}>{s.score}</div>
                        <div className="text-xs text-slate-400 tracking-wider uppercase mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {["Distributed Systems", "Go", "Kubernetes", "PostgreSQL", "gRPC", "Terraform"].map((skill) => (
                      <span key={skill} className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded tracking-wide">
                        {skill}
                      </span>
                    ))}
                  </div>

                  <div className="bg-amber-400/[0.04] border border-amber-400/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px] font-semibold text-amber-400 tracking-[0.15em] uppercase">AI Analysis</span>
                    </div>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                      Exceptional system design background. Led 3 platform migrations at scale.
                      Strong mentor signal from team reviews. Career velocity indicates principal
                      track. Positive outlook with high confidence.
                    </p>
                  </div>

                  {/* Next best actions */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { action: "Schedule technical", icon: CalendarCheck, color: "text-blue-400" },
                      { action: "Request references", icon: Users, color: "text-emerald-400" },
                      { action: "Prep offer package", icon: FileText, color: "text-amber-400" },
                    ].map((a) => (
                      <div key={a.action} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 flex items-center gap-2">
                        <a.icon className={`w-3 h-3 ${a.color} flex-shrink-0`} />
                        <span className="text-[11px] text-slate-400">{a.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Floating prediction */}
              <div className="absolute -left-4 lg:-left-8 bottom-12 bg-white border border-emerald-200 rounded-lg p-3 shadow-lg shadow-slate-200/50 max-w-[180px] anim-float">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="w-3 h-3 text-emerald-500" />
                  <span className="text-[11px] font-semibold text-emerald-600 tracking-[0.15em] uppercase">Outlook</span>
                </div>
                <p className="text-xs text-slate-400">
                  Career trajectory: <span className="font-semibold text-emerald-600">Positive</span> &middot; High confidence
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DILLIZNT VIDEO INTERVIEWS ═══ */}
      <section className="bg-slate-950 py-28 relative overflow-hidden">
        <div className="absolute inset-0 grain" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-400/20 to-transparent" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/[0.06] rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-amber-400/[0.04] rounded-full blur-[80px]" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-16">
            <span className="anim-fade-up text-xs font-semibold text-blue-400 tracking-[0.2em] uppercase block mb-4">
              Dilliznt Video Interviews
            </span>
            <h2 className="anim-fade-up delay-100 font-display text-4xl sm:text-5xl text-white leading-[1] mb-5">
              Video interviews with
              <br />
              built-in <span className="text-blue-400 font-extrabold">intelligence</span>.
            </h2>
            <p className="text-base text-slate-400 leading-relaxed max-w-lg">
              No more juggling Zoom links, separate scorecard tools, and post-interview
              synthesis meetings. Video, proctoring, structured evaluation, and AI
              synthesis — all in one place.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            {/* Interview room mockup */}
            <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.08] rounded-xl overflow-hidden">
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

                {/* Live scorecard */}
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

            {/* Panel synthesis mockup */}
            <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.08] rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-amber-400/10 flex items-center justify-center">
                    <Brain className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Panel Synthesis</div>
                    <div className="text-xs text-slate-400">3 panelists &middot; Auto-generated</div>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded tracking-wide">
                  STRONG HIRE
                </span>
              </div>

              <div className="p-4 space-y-3">
                {[
                  { competency: "System Design", score: 92, agreement: "Unanimous", color: "text-amber-400" },
                  { competency: "Coding Quality", score: 95, agreement: "Unanimous", color: "text-emerald-400" },
                  { competency: "Communication", score: 88, agreement: "Majority", color: "text-blue-400" },
                  { competency: "Leadership", score: 76, agreement: "Split", color: "text-rose-400" },
                ].map((c) => (
                  <div key={c.competency} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12px] font-medium text-slate-300">{c.competency}</span>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] ${c.agreement === "Split" ? "text-rose-400" : c.agreement === "Majority" ? "text-amber-400" : "text-emerald-400"}`}>
                          {c.agreement}
                        </span>
                        <span className={`text-sm font-mono font-bold ${c.color}`}>{c.score}</span>
                      </div>
                    </div>
                    <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-300" style={{ width: `${c.score}%` }} />
                    </div>
                  </div>
                ))}

                <div className="bg-amber-400/[0.04] border border-amber-400/10 rounded-lg p-3">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Exceptional technical depth across system design and coding. Panel unanimously
                    impressed by architecture thinking. Leadership scored lower due to limited
                    management examples — panelists recommend exploring this in next round.
                    Evidence coverage: 94%.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Feature detail cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                icon: Video,
                title: "Live Video + Recording",
                desc: "Multi-participant rooms with one-click recording, automatic transcription via speech-to-text, and download for compliance.",
              },
              {
                icon: ScreenShare,
                title: "Screen Proctoring",
                desc: "Multi-screen detection, live screenshot streaming to panelists, tab switch monitoring, and environment verification.",
              },
              {
                icon: ClipboardCheck,
                title: "AI Interview Plans",
                desc: "Tailored questions per role and candidate with competency mapping, follow-ups, risk probes, and scoring rubrics.",
              },
              {
                icon: Bot,
                title: "Mock Interviews",
                desc: "Candidates practice with AI before the real thing — full mock or rapid-fire drills with feedback and readiness scoring.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 hover:bg-white/[0.06] hover:border-blue-400/20 hover:shadow-lg hover:shadow-blue-400/5 transition-all duration-300">
                <div className="w-8 h-8 rounded-md bg-blue-400/10 flex items-center justify-center mb-3">
                  <f.icon className="w-4 h-4 text-blue-400" />
                </div>
                <h3 className="text-sm font-medium text-white mb-1">{f.title}</h3>
                <p className="text-[13px] text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
      </section>

      {/* ═══ ASSESSMENTS ═══ */}
      <section className="bg-white py-28 relative">
        <div className="absolute inset-0 dot-grid opacity-20" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-5">
              <span className="text-xs font-semibold text-emerald-600 tracking-[0.2em] uppercase block mb-4">
                Assessments
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-6">
                Evaluate <span className="text-emerald-600 font-extrabold">skills</span>,
                <br />
                not just resumes.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8 max-w-md">
                Built-in assessments with AI evaluation — code challenges,
                personality analysis, and custom rubrics. Embedded directly in
                the interview room or sent as take-homes.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  { title: "Code Evaluation", desc: "Correctness, code quality, efficiency, and best practices — scored automatically with detailed feedback." },
                  { title: "Personality Analysis", desc: "Big Five trait indicators extracted from assessment responses with supporting evidence." },
                  { title: "Custom Rubrics", desc: "Short/long text, MCQ, multi-select, coding, scales, and boolean question types. Build any assessment." },
                  { title: "Live Assessment in Interviews", desc: "Launch assessments directly in the interview room. Collaborative code editor syncs between candidate and panelists." },
                  { title: "Auto-Evaluation", desc: "AI evaluates submissions using rubric-profile-aware per-criterion scoring. Instant, consistent results." },
                ].map((item) => (
                  <div key={item.title} className="border-l-2 border-emerald-200 pl-4 py-1">
                    <h4 className="text-sm font-semibold text-slate-900 mb-0.5">{item.title}</h4>
                    <p className="text-[13px] text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Assessment mockup */}
            <div className="lg:col-span-7">
              <div className="bg-slate-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-slate-300/20">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-emerald-400/10 flex items-center justify-center">
                      <Code className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Code Assessment — Chen Wei</div>
                      <div className="text-xs text-slate-400">Platform Engineering &middot; AI Evaluated</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded tracking-wide">
                    EXCELLENT
                  </span>
                </div>

                <div className="p-5 space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "Correctness", score: 96, color: "text-emerald-400" },
                      { label: "Code Quality", score: 92, color: "text-blue-400" },
                      { label: "Efficiency", score: 88, color: "text-amber-400" },
                      { label: "Best Practices", score: 94, color: "text-slate-300" },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                        <div className={`text-xl font-mono font-bold ${s.color}`}>{s.score}</div>
                        <div className="text-xs text-slate-400 tracking-wider uppercase mt-0.5">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-emerald-400/[0.04] border border-emerald-400/10 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Brain className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[11px] font-semibold text-emerald-400 tracking-[0.15em] uppercase">AI Evaluation</span>
                    </div>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                      Clean implementation with excellent error handling. Used Go channels
                      effectively for concurrent processing. Minor optimization opportunity in
                      the cache invalidation path. Production-grade testing approach.
                    </p>
                  </div>

                  {/* Personality overlay */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Fingerprint className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[11px] font-semibold text-blue-400 tracking-[0.15em] uppercase">Personality Indicators</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { trait: "Openness", score: 82 },
                        { trait: "Conscientiousness", score: 91 },
                        { trait: "Extraversion", score: 65 },
                        { trait: "Agreeableness", score: 78 },
                        { trait: "Stability", score: 85 },
                      ].map((t) => (
                        <div key={t.trait} className="text-center">
                          <div className="text-sm font-mono font-bold text-slate-300">{t.score}</div>
                          <div className="text-[11px] text-slate-600 tracking-wider uppercase mt-0.5">{t.trait}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PLANNING & SOURCING ═══ */}
      <section className="bg-slate-50 py-28 border-y border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-16">
            <span className="text-[11px] font-semibold text-slate-400 tracking-[0.2em] uppercase block mb-4">
              Plan & Source
            </span>
            <h2 className="font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-5">
              From headcount plan
              <br />
              to qualified pipeline.
            </h2>
            <p className="text-base text-slate-500 leading-relaxed max-w-lg">
              AI-powered role creation, automatic sourcing and matching, and
              real-time pipeline health tracking. Every role starts with a
              qualified candidate pool.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Role Wizard */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-xl transition-shadow group">
              <div className="p-5 border-b border-slate-100 bg-slate-50/50">
                <div className="bg-white rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-slate-500" />
                    <span className="text-[12px] font-semibold text-slate-900">Role Wizard</span>
                    <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded ml-auto">AI-Powered</span>
                  </div>
                  <div className="space-y-2">
                    {[
                      { step: "Upload JD or describe the role", status: "done" },
                      { step: "AI extracts criteria & competencies", status: "done" },
                      { step: "Generates interview stages & plans", status: "done" },
                      { step: "Auto-matches existing candidates", status: "active" },
                    ].map((s) => (
                      <div key={s.step} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${s.status === "done" ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                        <span className={`text-[11px] ${s.status === "done" ? "text-slate-500" : "text-slate-900 font-medium"}`}>{s.step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">AI Role Creation</h3>
                <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                  Upload a job description or describe what you need — the Role Wizard
                  extracts everything: title, criteria, competencies, interview stages,
                  compensation range, and business case. One input, fully structured role.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Document Extraction", "Competency Mapping", "Interview Design", "Auto-Match"].map((tag) => (
                    <span key={tag} className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded tracking-wide">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Pipeline Health */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-xl transition-shadow group">
              <div className="p-5 border-b border-slate-100 bg-amber-50/30">
                <div className="bg-white rounded-lg p-4 border border-slate-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Activity className="w-4 h-4 text-amber-500" />
                    <span className="text-[12px] font-semibold text-slate-900">Pipeline Health</span>
                  </div>
                  {[
                    { role: "Staff Engineer", health: "At Risk", pct: 30, color: "bg-rose-400" },
                    { role: "Product Manager", health: "On Track", pct: 75, color: "bg-emerald-400" },
                    { role: "Design Lead", health: "Strong", pct: 90, color: "bg-blue-400" },
                    { role: "Data Scientist", health: "On Track", pct: 60, color: "bg-amber-400" },
                  ].map((r) => (
                    <div key={r.role} className="flex items-center gap-3 mb-2">
                      <span className="text-xs text-slate-500 w-28 truncate">{r.role}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${r.color}`} style={{ width: `${r.pct}%` }} />
                      </div>
                      <span className={`text-[11px] font-medium ${r.health === "At Risk" ? "text-rose-500" : r.health === "Strong" ? "text-blue-500" : "text-emerald-500"}`}>
                        {r.health}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Role Fulfilment Tracking</h3>
                <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
                  AI continuously assesses pipeline health for every open role.
                  Identifies bottlenecks, recommends the single next action,
                  and generates status reports with real pipeline data.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Health Scoring", "Bottleneck Detection", "Next Action", "Status Reports"].map((tag) => (
                    <span key={tag} className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded tracking-wide">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TALENT POOLS & ENGAGEMENT ═══ */}
      <section className="bg-white py-28 relative">
        <div className="absolute inset-0 dot-grid opacity-20" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Pool grid */}
            <div className="lg:col-span-7 order-2 lg:order-1">
              <div className="bg-slate-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-slate-300/20">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-medium text-white">Talent Pools</span>
                  </div>
                  <span className="text-[11px] font-medium text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded tracking-wide">5 ACTIVE</span>
                </div>
                <div className="p-4 space-y-2">
                  {[
                    { name: "Senior Engineers", count: 342, warm: 89, new: 12, engaged: 156 },
                    { name: "Product Leaders", count: 156, warm: 43, new: 5, engaged: 67 },
                    { name: "ML/AI Specialists", count: 98, warm: 31, new: 8, engaged: 42 },
                    { name: "Design Directors", count: 67, warm: 18, new: 3, engaged: 28 },
                  ].map((pool) => (
                    <div key={pool.name} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 hover:bg-white/[0.05] transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-[13px] font-medium text-slate-200">{pool.name}</div>
                          <div className="text-xs text-slate-500">{pool.count} candidates</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <span className="text-sm font-mono font-bold text-emerald-400">{pool.warm}</span>
                          <span className="text-xs text-slate-400 ml-1">warm</span>
                        </div>
                        <div>
                          <span className="text-sm font-mono font-bold text-blue-400">{pool.new}</span>
                          <span className="text-xs text-slate-400 ml-1">new this week</span>
                        </div>
                        <div>
                          <span className="text-sm font-mono font-bold text-amber-400">{pool.engaged}</span>
                          <span className="text-xs text-slate-400 ml-1">engaged</span>
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
              <h2 className="font-display text-4xl text-slate-900 leading-[1] mb-6">
                Your pipeline is
                <br />
                <span className="text-blue-600">always warm</span>.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                Build segmented talent pools, run multi-channel campaigns, and
                track engagement over time. AI auto-matches new candidates to
                pools and surfaces insights on pool health.
              </p>

              <div className="space-y-3 mb-8">
                {[
                  { title: "AI Pool Matching", desc: "New candidates automatically evaluated against pool criteria and auto-assigned with match confidence." },
                  { title: "Pool Insights", desc: "AI analyzes pool composition, identifies matching roles, and generates health assessments." },
                  { title: "Multi-Channel Campaigns", desc: "Email, LinkedIn, and SMS with AI-generated personalization and optimal send timing." },
                  { title: "Silver Medalist Nurture", desc: "Rejected candidates auto-enter pools for future roles. Re-engagement workflows fire when matching roles open." },
                ].map((item) => (
                  <div key={item.title} className="border-l-2 border-blue-200 pl-4 py-1">
                    <h4 className="text-sm font-semibold text-slate-900 mb-0.5">{item.title}</h4>
                    <p className="text-[13px] text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ OFFER INTELLIGENCE ═══ */}
      <section className="bg-slate-950 py-28 relative overflow-hidden">
        <div className="absolute inset-0 grain" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent" />

        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <div className="lg:col-span-5">
              <span className="text-xs font-semibold text-emerald-400 tracking-[0.2em] uppercase block mb-4">
                Offer Intelligence
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-white leading-[1] mb-6">
                Offers that <span className="text-emerald-400 font-extrabold">close</span>.
                <br />
                Not guesswork.
              </h2>
              <p className="text-base text-slate-400 leading-relaxed mb-8 max-w-md">
                AI generates competitive offer packages based on current compensation,
                market data, and candidate signals. Close risk analysis tells you
                exactly where you stand.
              </p>

              <div className="space-y-3">
                {[
                  { title: "AI-Generated Packages", desc: "Full compensation breakdown: base, equity, bonus, sign-on — calibrated to candidate history and role band." },
                  { title: "Close Risk Analysis", desc: "Composite risk scoring with specific risk factors, severity levels, and a close readiness checklist." },
                  { title: "Document Parsing", desc: "Upload offer letters or pay stubs — AI extracts earnings, deductions, and structured compensation data." },
                  { title: "Negotiation Strategy", desc: "Floor/ceiling ranges, competitive position (below/at/above-band), and calibration rationale." },
                ].map((item) => (
                  <div key={item.title} className="border-l-2 border-emerald-400/30 pl-4 py-1">
                    <h4 className="text-[13px] font-semibold text-slate-300 mb-0.5">{item.title}</h4>
                    <p className="text-[13px] text-slate-500 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Offer card */}
            <div className="lg:col-span-7">
              <div className="bg-slate-900/60 backdrop-blur-sm border border-white/[0.08] rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-emerald-400/10 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Offer — Priya Sharma</div>
                      <div className="text-xs text-slate-400">Senior Engineer &middot; AI Generated</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded tracking-wide">
                    COMPETITIVE
                  </span>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Base Salary", value: "$195,000", note: "75th %ile" },
                      { label: "Equity (4yr)", value: "$120,000", note: "Standard vest" },
                      { label: "Sign-On", value: "$25,000", note: "Recommended" },
                    ].map((comp) => (
                      <div key={comp.label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 text-center">
                        <div className="text-lg font-mono font-bold text-white">{comp.value}</div>
                        <div className="text-[11px] text-slate-500 uppercase tracking-wider mt-0.5">{comp.label}</div>
                        <div className="text-[11px] text-emerald-400 mt-1">{comp.note}</div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-amber-400/[0.04] border border-amber-400/10 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Brain className="w-3 h-3 text-amber-400" />
                      <span className="text-[11px] font-semibold text-amber-400 tracking-[0.1em] uppercase">AI Rationale</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      13% increase over current base ($172k). Sign-on offsets unvested equity.
                      Competitive position: at-band. 89% predicted acceptance. Close risk: Low.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Hike", value: "+13%", color: "text-emerald-400" },
                      { label: "Acceptance", value: "89%", color: "text-amber-400" },
                      { label: "Risk", value: "Low", color: "text-emerald-400" },
                    ].map((m) => (
                      <div key={m.label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-2.5 text-center">
                        <div className={`text-sm font-mono font-bold ${m.color}`}>{m.value}</div>
                        <div className="text-xs text-slate-400 uppercase tracking-wider mt-0.5">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
      </section>

      {/* ═══ ASK AI ═══ */}
      <section className="bg-white py-28 relative">
        <div className="absolute inset-0 dot-grid opacity-20" />
        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-12">
            <div className="lg:col-span-5 flex flex-col justify-center pr-8">
              <span className="text-xs font-semibold text-amber-600 tracking-[0.2em] uppercase block mb-4">
                Ask AI
              </span>
              <h2 className="font-display text-4xl sm:text-5xl text-slate-900 leading-[1] mb-6">
                Your hiring data,
                <br />
                <span className="bg-gradient-to-r from-amber-600 via-amber-500 to-amber-400 bg-clip-text text-transparent">one question away</span>.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                Ask anything about your recruiting operation in plain English.
                Pipeline health, candidate comparisons, source effectiveness,
                stalled applications — answers in seconds, not hours of
                dashboard digging.
              </p>

              <div className="space-y-2">
                {[
                  "\"Which roles need attention this week?\"",
                  "\"Compare the top 3 candidates for Staff Engineer\"",
                  "\"What's our offer acceptance rate this quarter?\"",
                  "\"Where are my pipelines stuck?\"",
                  "\"Show me candidates who interviewed well but declined\"",
                  "\"What needs my attention today?\"",
                ].map((q, i) => (
                  <div key={i} className="text-[13px] text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 italic">
                    {q}
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="bg-slate-950 border border-white/[0.08] rounded-xl overflow-hidden shadow-2xl shadow-slate-300/20">
                <div className="px-5 py-3 border-b border-white/[0.06] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-md bg-amber-400/10 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">Ask AI</div>
                    <div className="text-xs text-slate-400">Contextual suggestions adapt to your current page</div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* User query */}
                  <div className="flex justify-end">
                    <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-2.5 max-w-[80%]">
                      <p className="text-[12px] text-amber-300">Where are my pipelines stuck?</p>
                    </div>
                  </div>

                  {/* AI response */}
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-3">
                    <p className="text-[12px] text-slate-300 leading-relaxed">
                      I found 3 bottlenecks across your active roles:
                    </p>
                    <div className="space-y-2">
                      {[
                        { color: "rose", title: "Staff Engineer — Screen → Interview", desc: "14 candidates stuck in screening for 8+ days. Average time at this stage is 2 days. 3 hiring managers have outstanding review tasks." },
                        { color: "amber", title: "Product Manager — Interview → Offer", desc: "4 candidates completed all interviews but no offer decisions. 2 have competing timelines. Scorecards are complete." },
                        { color: "blue", title: "Design Lead — Sourcing", desc: "Pipeline has only 6 candidates total vs. target of 25. Pool \"Design Directors\" has 18 warm candidates matching criteria." },
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

                  {/* Follow-up */}
                  <div className="flex justify-end">
                    <div className="bg-amber-400/10 border border-amber-400/20 rounded-lg px-4 py-2.5">
                      <p className="text-[12px] text-amber-300">Draft outreach to the Design Directors pool</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ AI AGENTS & AUTOMATION ═══ */}
      <section className="bg-slate-950 py-28 relative overflow-hidden">
        <div className="absolute inset-0 grain" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-600/[0.06] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="max-w-2xl mb-16">
            <span className="text-xs font-semibold text-amber-400 tracking-[0.2em] uppercase block mb-4">
              25 AI Agents & Event-Driven Automation
            </span>
            <h2 className="font-display text-4xl sm:text-5xl text-white leading-[1] mb-5">
              Agents that work.
              <br />
              Workflows that <span className="bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">never break</span>.
            </h2>
            <p className="text-base text-slate-400 leading-relaxed max-w-lg">
              25 specialized AI agents handle screening, matching, interview prep,
              assessments, offers, and more. Event-driven triggers fire automatically
              on every database change — no manual intervention.
            </p>
          </div>

          {/* Agent grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            {[
              {
                category: "Screening & Scoring",
                color: "amber",
                agents: [
                  { name: "Candidate Intelligence", desc: "Profile enrichment & summary" },
                  { name: "Candidate Scorer", desc: "Pillar-based talent assessment" },
                  { name: "Candidate Comparer", desc: "Ranked multi-candidate analysis" },
                ],
              },
              {
                category: "Matching & Pools",
                color: "emerald",
                agents: [
                  { name: "Role-Candidate Matcher", desc: "Criteria-based fit scoring" },
                  { name: "Pool Candidate Matcher", desc: "Auto-assign to pools" },
                  { name: "Pool Insight Analyzer", desc: "Pool health & role matching" },
                ],
              },
              {
                category: "Interviews & Assessment",
                color: "blue",
                agents: [
                  { name: "Interview Prep", desc: "Questions, rubrics & risk flags" },
                  { name: "Interview Synthesizer", desc: "Multi-panel synthesis" },
                  { name: "Code Evaluator", desc: "Quality, correctness & efficiency" },
                  { name: "Personality Analyzer", desc: "Big Five trait indicators" },
                  { name: "Assessment Evaluator", desc: "Rubric-aware criterion scoring" },
                ],
              },
              {
                category: "Offers & Ops",
                color: "rose",
                agents: [
                  { name: "Offer Generator", desc: "AI comp packages" },
                  { name: "Close Risk Analyst", desc: "Risk scoring & checklist" },
                  { name: "Communication Drafter", desc: "Personalized outreach" },
                  { name: "Recruiter Briefing", desc: "Daily action summary" },
                  { name: "Role Wizard", desc: "Doc → structured role" },
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
                  <div className="space-y-3">
                    {group.agents.map((agent) => (
                      <div key={agent.name}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                          <span className="text-[12px] font-medium text-slate-300">{agent.name}</span>
                        </div>
                        <p className="text-xs text-slate-500 ml-3.5">{agent.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Automation strip */}
          <div className="grid lg:grid-cols-3 gap-4">
            {[
              {
                icon: Zap,
                title: "Event-Driven Triggers",
                desc: "40+ triggers fire on every insert, update, and delete. New candidate? Auto-score, auto-match, auto-enrich. Application moves to offer? Generate comp package.",
              },
              {
                icon: Workflow,
                title: "Sequential Task Chains",
                desc: "Triggers chain multiple agents: candidate intake runs intelligence → scoring → matching in sequence. Each step feeds the next.",
              },
              {
                icon: Eye,
                title: "Full Audit Trail",
                desc: "Every automation logged with input, output, timing, and status. Complete visibility into what ran, when, and why.",
              },
            ].map((f) => (
              <div key={f.title} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 hover:bg-white/[0.06] hover:border-amber-400/20 transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-md bg-amber-400/10 flex items-center justify-center">
                    <f.icon className="w-4 h-4 text-amber-400" />
                  </div>
                  <h3 className="text-sm font-medium text-white">{f.title}</h3>
                </div>
                <p className="text-[13px] text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400/20 to-transparent" />
      </section>

      {/* ═══ ANALYTICS & INTEGRATIONS ═══ */}
      <section className="bg-slate-50 py-28 border-y border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="grid lg:grid-cols-2 gap-16">
            {/* Analytics */}
            <div>
              <span className="text-xs font-semibold text-slate-500 tracking-[0.2em] uppercase block mb-4">
                Hiring Analytics
              </span>
              <h2 className="font-display text-4xl text-slate-900 leading-[1] mb-6">
                Every decision,
                <br />
                <span className="bg-gradient-to-r from-slate-900 to-amber-600 bg-clip-text text-transparent">backed by data</span>.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                Real-time pipeline velocity, stage-by-stage conversion, and
                AI-generated status reports per role. Combined with Ask AI for
                ad-hoc analytics in plain English.
              </p>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: LineChart, title: "Pipeline Velocity", desc: "Stage-by-stage conversion and time metrics" },
                  { icon: PieChart, title: "Source Effectiveness", desc: "Quality and volume per sourcing channel" },
                  { icon: Activity, title: "Bottleneck Detection", desc: "AI identifies where candidates get stuck" },
                  { icon: TrendingUp, title: "Role Status Reports", desc: "AI-generated pipeline health per role" },
                  { icon: Eye, title: "Interviewer Calibration", desc: "Panel consistency and drift detection" },
                  { icon: BarChart3, title: "Recruiter Briefings", desc: "Daily AI-generated action summaries" },
                ].map((item) => (
                  <div key={item.title} className="flex gap-3 p-3 bg-white rounded-lg border border-slate-200">
                    <item.icon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="text-[12px] font-semibold text-slate-900 mb-0.5">{item.title}</h4>
                      <p className="text-xs text-slate-400">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Integrations */}
            <div>
              <span className="text-xs font-semibold text-slate-500 tracking-[0.2em] uppercase block mb-4">
                Integrations
              </span>
              <h2 className="font-display text-4xl text-slate-900 leading-[1] mb-6">
                Connects to your
                <br />
                <span className="bg-gradient-to-r from-slate-900 to-amber-600 bg-clip-text text-transparent">calendar and email</span>.
              </h2>
              <p className="text-base text-slate-500 leading-relaxed mb-8">
                Native OAuth integrations with your calendar and email
                for seamless scheduling and communication.
              </p>

              <div className="space-y-3">
                {[
                  { icon: CalendarCheck, name: "Google Calendar", desc: "Real-time availability, auto-create events, panelist scheduling with conflict detection.", status: "Live" },
                  { icon: CalendarCheck, name: "Outlook Calendar", desc: "Same availability and scheduling features for Microsoft 365 organizations.", status: "Live" },
                  { icon: Mail, name: "Gmail", desc: "OAuth-based email integration for candidate outreach, follow-ups, and engagement campaigns.", status: "Live" },
                  { icon: Mail, name: "Outlook Email", desc: "Full email integration for Microsoft 365. Send, receive, and track candidate communications.", status: "Live" },
                ].map((item) => (
                  <div key={item.name} className="flex gap-4 p-4 bg-white rounded-lg border border-slate-200">
                    <div className="w-9 h-9 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="text-sm font-semibold text-slate-900">{item.name}</h4>
                        <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{item.status}</span>
                      </div>
                      <p className="text-[13px] text-slate-500 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PLATFORM TRUST ═══ */}
      <section className="bg-white py-16 border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
          <div className="text-center mb-10">
            <h3 className="font-display text-2xl text-slate-900">Enterprise-grade platform</h3>
            <p className="text-[13px] text-slate-500 mt-2">Security, audit trails, and reliability built into every layer.</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Users, title: "Multi-Tenant Isolation", desc: "Org-scoped data with role-based access" },
              { icon: Shield, title: "SSO Authentication", desc: "Google, GitHub & LinkedIn OAuth" },
              { icon: Eye, title: "AI Audit Trail", desc: "Every agent action logged & traceable" },
              { icon: Lock, title: "Encrypted Integrations", desc: "AES-256-GCM for third-party tokens" },
            ].map((f, i) => (
              <div key={i} className="text-center p-6">
                <div className="w-10 h-10 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-3">
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
