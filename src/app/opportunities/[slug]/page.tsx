import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Briefcase, Building2, Calendar, MapPin, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { getPublicOpportunity } from "@/operations/public";
import { fetchReferralForLanding } from "@/actions/referrals";
import type { PublicRoleDTO } from "@/lib/anonymize";
import { formatPublicComp, formatRelativeDate } from "@/lib/anonymize/format";
import {
  jobPostingJsonLd,
  metaDescription,
  opportunityUrl,
} from "@/lib/anonymize/seo";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string }>;
}

export async function generateMetadata({ params }: { params: PageProps["params"] }): Promise<Metadata> {
  const { slug } = await params;
  const dto = await getPublicOpportunity(slug);
  if (!dto) return { title: "Not found" };

  const description = metaDescription(dto);
  const url = opportunityUrl(slug);

  return {
    title: `${dto.title} — Dilliznt`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: dto.title,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: dto.title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const { ref } = await searchParams;

  // Reveal-via-referral is gated on auth: the referrer's social signal
  // substitutes for k-anonymity *only* once the recipient has skin in the
  // game (an account). Without this, a leaked referral URL — Slack
  // screenshot, email forward — would expose org name + comp + description
  // to anyone clicking. Public-visibility roles don't need the gate (they're
  // already public).
  const session = await auth.api.getSession({ headers: await headers() });
  const referral = ref ? await fetchReferralForLanding(ref) : null;
  const reveal = Boolean(referral) && Boolean(session?.user);
  const dto = await getPublicOpportunity(slug, { reveal });
  if (!dto) notFound();

  // The referrer banner shows for any valid token (so the recipient knows
  // who referred them) but the *content reveal* only happens when reveal=true.
  const showRevealCta = Boolean(referral) && !session?.user;

  const jsonLd = jobPostingJsonLd(dto);

  const cbTarget = `/opportunities/${slug}?ref=${ref ?? ""}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      {referral && <ReferralBanner referral={referral} />}
      {showRevealCta && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-medium text-amber-900">
            Sign in to unlock the full role
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Your referrer thought you'd be a great fit. Sign in or create an
            account to see the company name, full description, and exact
            compensation.
          </p>
          <Link
            href={`/auth/sign-in?mode=candidate&callbackUrl=${encodeURIComponent(cbTarget)}`}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-95"
          >
            Sign in to unlock
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
      <script
        type="application/ld+json"
        // Only DTO fields enter this string; the DTO has already been
        // through `publicizeRole`, so no leak risk.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/opportunities"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All opportunities
      </Link>

      <article className="mt-6 rounded-2xl border border-border bg-card p-8">
        <DetailHeader dto={dto} />

        <div className="mt-6 grid grid-cols-1 gap-3 border-y border-border py-5 sm:grid-cols-3">
          {dto.visibility === "anonymized" ? (
            <>
              <Stat label="Industry" value={humanize(dto.industry)} />
              <Stat label="Stage" value={humanizeStage(dto.stage)} />
              <Stat label="Company size" value={dto.size ?? "—"} />
            </>
          ) : (
            <>
              <Stat label="Company" value={dto.orgName ?? "—"} icon={Building2} />
              <Stat label="Location" value={dto.location ?? "—"} icon={MapPin} />
              <Stat
                label="Type"
                value={dto.employmentType ? humanize(dto.employmentType) : "—"}
                icon={Briefcase}
              />
            </>
          )}
        </div>

        {dto.skills.length > 0 && (
          <Section title="Required skills">
            <div className="flex flex-wrap gap-1.5">
              {dto.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
          </Section>
        )}

        {dto.visibility === "public" && dto.description && (
          <Section title="About the role">
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
              {dto.description}
            </p>
          </Section>
        )}

        {dto.visibility === "anonymized" && (
          <Section title="About the role">
            <p className="text-sm text-muted-foreground">
              Detailed responsibilities and the hiring company are revealed when
              you sign up and apply.
            </p>
          </Section>
        )}

        {dto.visibility === "public" && dto.orgWebsite && (
          <Section title="Company">
            <a
              href={dto.orgWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-amber-700 hover:underline"
            >
              {dto.orgWebsite.replace(/^https?:\/\//, "")}
            </a>
          </Section>
        )}

        <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          Posted {formatRelativeDate(dto.postedAt)}
        </div>
      </article>

      {/* Sticky CTA */}
      <div className="sticky bottom-4 mt-6">
        <Link
          href={
            ref
              ? `/opportunities/claim?slug=${dto.slug}&ref=${encodeURIComponent(ref)}`
              : `/opportunities/claim?slug=${dto.slug}`
          }
          className="flex items-center justify-center gap-2 rounded-2xl bg-foreground px-6 py-3.5 text-sm font-semibold text-background shadow-lg transition-opacity hover:opacity-95"
        >
          Sign up to apply
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {dto.visibility === "anonymized" && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Sign-up reveals the company and full role details.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────── helpers ─────────── */

function DetailHeader({ dto }: { dto: PublicRoleDTO }) {
  const compBand = formatPublicComp(dto);
  const eyebrow =
    dto.visibility === "anonymized" ? dto.publicLabel : dto.orgName ?? "Open role";
  return (
    <>
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600">
        {eyebrow}
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
        {dto.title}
      </h1>
      {compBand && (
        <p className="mt-3 text-base font-semibold text-foreground">{compBand}</p>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: typeof Briefcase;
}) {
  return (
    <div>
      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function ReferralBanner({
  referral,
}: {
  referral: { issuedByName: string | null; message: string | null };
}) {
  const who = referral.issuedByName ?? "Someone you know";
  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
          <Sparkles className="h-4 w-4 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">
            Referred to you
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {who} thought you'd be a fit.
          </p>
          {referral.message && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-white/70 p-3 text-sm italic text-foreground">
              "{referral.message}"
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeStage(s: string): string {
  if (s === "series_a") return "Series A";
  if (s === "series_b") return "Series B";
  if (s === "series_c_plus") return "Series C+";
  if (s === "pre_seed_seed") return "Pre-seed / Seed";
  if (s === "late_private") return "Late-stage private";
  if (s === "bootstrapped_profitable") return "Bootstrapped";
  if (s === "government_nonprofit") return "Government / Non-profit";
  return humanize(s);
}

