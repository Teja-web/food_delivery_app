# Candidate Flow — Today's Reality and Where to Take It

## What the candidate actually experiences today

Tracing the code from `/auth/sign-in?mode=candidate` through to offer:

1. **No public landing.** `src/app/page.tsx` doesn't exist. The only entry points are `/auth/sign-in`, magic-link interview slots (`/portal/interview/[token]`), and (presumably) public assessment links via `startPublicAssessment`. There is no `/jobs` or `/opportunities` for someone who isn't yet a candidate.
2. **Sign-in is the only on-ramp.** `UnifiedSignIn` handles all roles; `?mode=candidate` is just a hint. After auth, `requirePortalCandidateSession()` enforces role and `app/portal/page.tsx` redirects to `/portal/dashboard` — **which doesn't exist**. Candidate lands on whatever tab they last hit.
3. **Roles are *delivered*, not browsed.** `RolesPage` calls `fetchPortalOpportunities()` + `fetchPortalCandidateMatches()` — what shows up is AI-scored against the candidate's resume/profile. There's no free browse, no filtering by location/comp/title outside the matched set, no concept of "save for later" beyond `expressInterestInRole`.
4. **Profile is the gate.** `RolesPage` checks `profileCompleteness >= 50 || hasResume` to even count someone as having a profile. No resume → no useful matches. New candidates with thin profiles see a sparse portal.
5. **Coach is rich; entry is buried.** `CoachClient` has nice typed bubble cards (`interview-alert`, `interview-join`, `offer`, `opportunity-check`, `growth`, `celebration`) — but it's a peer tab, not the front door. Most of what the candidate needs to triage *is* in coach, just not framed as the home.
6. **Interview & offer paths work well in isolation.** Magic-link slot picker (`/portal/interview/[token]`) is unauth, clean. `roles/[roleId]/offer` exists. `roles/[roleId]/results` shows interview feedback. These are good once you're in flight.
7. **No onboarding.** `ProfilePage` falls back to "No profile found. Please complete onboarding." — there's no onboarding to fall back *to*.

## Does it make sense from a candidate's POV?

**For an in-flight candidate already in an active loop** — yes. They got a magic link, picked a slot, did Prep, took the interview, saw results. The vertical flow is solid.

**For everyone else — no.** Specifically:
- A **cold candidate** who heard about the platform can't see what's on offer without signing up first. Top-of-funnel is closed.
- A **passive candidate** can't "browse" or get a sense of the market. Discovery requires resume → matching → signal. No window-shopping.
- A **new sign-up** with a thin profile lands on a near-empty portal. The matching engine has nothing to chew on. Activation is bad.
- A **student / entry-level user** has no path. The model assumes "current title", "years of experience", "company", and matches against role criteria built for hires-with-history. The product implicitly shouts "come back when you're senior."
- A **returning candidate** can't see "what's next" at a glance because there's no dashboard. They have to remember the IA.

The flow is shaped for the **middle of the funnel** (active candidate + warm match) and weak at both ends (top-of-funnel discovery, bottom-of-funnel ongoing engagement).

## On your two suggestions

### Anonymized opportunities on the public page — yes, high value

This is the cleanest top-of-funnel fix in the product. A `/opportunities` (or `/jobs`) page that:

- Shows real, live roles **with org identity blurred** until sign-up: "Series B fintech, NYC", "Top-3 Indian retailer, Bengaluru", "$140k–$170k", seniority + key skills.
- Is filterable (location, comp, level, function) without auth.
- Each card has "See full match" → sign-up flow → resume parse → reveal org + score + apply.

What makes this fit the existing system:
- `org_candidates` already supports a candidate not bound to any org (`addedByOrgId = NULL`, per the vendor-and-attribution-plan).
- `ensurePortalCandidate` (Phase 2 of that plan) creates portal-only candidates with `organizationId = NULL`. The unbound-candidate primitive is in the codebase already.
- Roles already have descriptions, comp, location, profile JSON. We need a `publicVisibility` flag (`anonymized` / `public` / `private`) on the role and a serializer that strips org name + redacts business-case text.
- Candidate matching already works on the candidate side; we just need to run a score *after* sign-up against the candidate they just created.

This is also a natural place for a **lightweight assessment-first signal**: "Skip the resume — take a 10-minute role quiz, we'll show you what fits." Hooks `startPublicAssessment` into the discovery loop. Good for students and people without polished resumes.

Watchouts:
- Org name redaction has to be cryptographically real on the API, not just CSS. (Treat the role's `orgName` like PII for unauth callers.)
- Some orgs won't want even anonymized listing. Default to off; opt-in per role or per org.
- Comp redaction tier — `"$140k–$170k"` bands by region, not exact numbers, until apply.

### A campus / student / early-career module — yes, but it's a parallel product surface

This isn't a feature on the existing portal — it's a different shape of user with a different model. Calling it `/campus` (or candidate-portal *modes*) keeps it honest:

**What's different about the student user**:
- No resume, no current title, no years-experience. Profile is `institution`, `graduation`, `GPA`, `coursework`, `projects`, `internships`, `clubs`, `target functions`.
- Time horizon is months/semesters, not weeks. Cadence matches coznt's learner portal, not recruit's candidate portal.
- They don't know what they want yet. Discovery is "what could I be?" not "what fits my CV?"
- Skills are *acquired*, not *measured*. Learning loops are first-class.
- Roles are different shapes: internships, new-grad rotations, apprenticeships, return-offers — not lateral hires.

**What this would look like as a build-out** (in priority order):

1. **A separate role type / surface** — `roles.kind = 'internship' | 'new_grad' | 'apprenticeship'`, with their own match criteria (skills + projects + coursework rather than experience + title). Students see only these.
2. **Career path explorer** — interactive tree: "I'm a CS sophomore → roles I could target (SWE intern, ML intern, Product Analyst) → skills each requires → gap analysis → recommended path." Pulls heavily from the role-criteria data we already generate.
3. **Skill-gap → learning loop** — this is the direct port of coznt's *Tutor + Practice* pattern. Once we know the gap, we generate quizzes, scenario drills, and progress tracking *inside* the candidate portal. Reuses our `generate()` + Zod-schema agent infrastructure.
4. **Project-as-portfolio** — students don't have job histories; they have projects. Treat projects as first-class profile entities (title, repo link, description, tech stack, role, evaluators). Match on these.
5. **Campus partnerships** — universities as a new org type. Each university can list its students, surface curated roles, and get analytics. The vendor-attribution work already in flight (`addedByOrgId`) generalizes cleanly: a university is a kind of source-org with its own candidate pool.
6. **Asynchronous practice interviews** — record-yourself prep with AI feedback. Solves the "I have no interview scheduled, but I want to practice" gap. We have `useVoicePrep` and `SpeechInput` already; just unbind them from a real interview row.
7. **Cohort features** — "your peers from {college} who also applied to {role}", "the most-applied roles for new-grad SWEs". Social proof that experienced candidates don't need but students do.

What's the smallest first cut? **A `kind = 'internship'` flag on roles + a student-shaped profile + the career-path explorer.** That gives campus users a reason to be in the product without having to ship the full learning loop on day one. The learning loop is the moat, but the explorer is the hook.

## Other gaps worth naming

- **No public job board / SEO surface.** Even leaving anonymization aside, every public job listing is also a free SEO acquisition channel. Nothing today competes there.
- **No referral path.** "A friend referred you to {role}" with a token-link, prefill, light auth. Common pattern, missing here.
- **No mobile app / mobile-optimized chat.** Coach is the natural mobile home; today's `max-w-3xl` already trends mobile-friendly. A real PWA + push notifications would compound interview-day engagement.
- **No "save search" / alerts.** Candidate sets criteria once; gets pinged when matching roles open. Currently every visit is a cold pull.
- **Offers UX is per-role** (`roles/[roleId]/offer`). Candidates with multiple in-flight offers have no comparison surface.

## What to build first

If this becomes a roadmap, three slices in order:

1. **Public `/opportunities` page** with anonymized listings + assessment-first sign-up. Top-of-funnel and the cheapest meaningful change — most plumbing already exists.
2. **Real `/dashboard` home** (covered in `candidate-portal-vs-learner-portal.md`). Activation and "what's next" for everyone past sign-up.
3. **Campus module v1** — `kind = 'internship'`, student profile shape, career-path explorer. New audience, new product surface, but built on the same engine. Once the explorer is in, the learning loop becomes the obvious next slice and it leans heavily on coznt's tutor/practice patterns.
