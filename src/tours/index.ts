import type { TourDefinition } from "@/components/tours";

export const tours: TourDefinition[] = [
  {
    tour: "recruit-workflow",
    type: "orientation",
    steps: [
      // -- Welcome --
      {
        icon: "👋",
        title: "Welcome to Dilliznt Recruit",
        content:
          "Let's walk through your talent intelligence platform — from opening a role to making a hire. This takes about two minutes.",
        side: "bottom",
        showControls: true,
        showSkip: true,
      },

      // -- Today --
      {
        icon: "☀️",
        title: "Your Daily Hub",
        content:
          "Start each day here. See your upcoming interviews, triage items that need attention, and an AI-generated daily briefing summarizing what matters today.",
        selector: "#tour-sidebar-today",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },

      // -- Ask AI / Search --
      {
        icon: "✨",
        title: "Ask AI Anything",
        content:
          "Search candidates, analyze pipelines, or ask questions in natural language. Press Cmd+K from anywhere to open the command palette.",
        selector: "#tour-search",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
        nextRoute: "/recruit/roles",
      },

      // -- Create a Role --
      {
        icon: "💼",
        title: "Create a Role",
        content:
          "Start by opening a new role. The AI wizard builds requirements, interview stages, and scoring criteria from a job description or brief.",
        selector: "#tour-add-role",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
        nextRoute: "/recruit/candidates",
        prevRoute: "/recruit/roles",
      },

      // -- Add Candidates --
      {
        icon: "👤",
        title: "Add Candidates",
        content:
          "Upload resumes or add candidates manually. AI extracts skills, experience, and generates a structured profile automatically.",
        selector: "#tour-add-candidate",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
        prevRoute: "/recruit/candidates",
      },

      // -- Pipeline + AI Matching --
      {
        icon: "🔄",
        title: "Pipeline & AI Matching",
        content:
          "Each role has a Pipeline tab showing candidates across stages. The Recommended tab surfaces AI-matched candidates — scored and ranked automatically from your talent pool.",
        selector: "#tour-sidebar-roles",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },

      // -- Assessments --
      {
        icon: "📝",
        title: "Assessments",
        content:
          "Send technical, coding, or aptitude assessments before interviews. AI scores responses against rubrics and flags candidates for review.",
        selector: "#tour-sidebar-assessments",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },

      // -- Schedule Interviews --
      {
        icon: "🎙️",
        title: "Schedule Interviews",
        content:
          "Set up interviews for pipeline candidates. Each interview gets AI-generated prep — focus areas, suggested questions, and a structured scorecard.",
        selector: "#tour-sidebar-interviews",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },

      // -- Conduct Interviews --
      {
        icon: "📋",
        title: "Conduct Interviews",
        content:
          "During interviews, AI transcribes in real-time and scores responses against your criteria. Interviewers submit structured scorecards with competency ratings and a verdict.",
        selector: "#tour-sidebar-interviews",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },

      // -- Make a Decision --
      {
        icon: "✅",
        title: "Make a Decision",
        content:
          "Review AI-generated panel summaries, compare candidates side-by-side, and advance the best fit to an offer — all from the role detail page.",
        selector: "#tour-sidebar-offers",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },

      // -- Talent Pools --
      {
        icon: "🏊",
        title: "Talent Pools",
        content:
          "Organize candidates into reusable pools — by skill, department, or source. When a new role opens, AI matches from your pools automatically.",
        selector: "#tour-sidebar-pools",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },

      // -- Insights --
      {
        icon: "📊",
        title: "Insights",
        content:
          "Track hiring velocity, pipeline health, source effectiveness, and bottlenecks — all in one dashboard.",
        selector: "#tour-sidebar-insights",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },

      // -- Done --
      {
        icon: "🚀",
        title: "You're all set!",
        content:
          "Start by creating a role — the AI handles matching, scoring, and insights from there. You can replay this tour anytime from Settings.",
        side: "bottom",
        showControls: true,
        showSkip: false,
      },
    ],
  },

  // -- Workflow: First role created --
  {
    tour: "first-role-created",
    type: "workflow",
    trigger: { event: "role.created", condition: "first-for-user" },
    steps: [
      {
        icon: "🎉",
        title: "Your first role is live!",
        content:
          "Great — the AI is already analyzing your role and matching candidates. Let's see what's happening.",
        side: "bottom",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "🔄",
        title: "Pipeline",
        content:
          "As candidates are added or matched, they appear here — organized by stage. You can advance them through screening, interviews, and offers.",
        selector: "#tour-role-tabs",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
      },
      {
        icon: "🎯",
        title: "AI-Matched Candidates",
        content:
          "Switch to the Recommended tab to see candidates the AI found from your database. Each is scored and ranked by fit — just click to add them to the pipeline.",
        selector: "#tour-role-tabs",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
      },
      {
        icon: "🎙️",
        title: "Interviews",
        content:
          "The Interviews tab tracks all scheduled and completed interviews for this role. You'll see panel health, scorecard status, and decision readiness.",
        selector: "#tour-role-tabs",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
      },
      {
        icon: "✅",
        title: "You're on your way!",
        content:
          "Add candidates to the pipeline, or wait for AI to match them. Next up: schedule interviews and let the AI handle prep and scoring.",
        side: "bottom",
        showControls: true,
        showSkip: false,
      },
    ],
  },

  // -- Workflow: First candidate added --
  {
    tour: "first-candidate-added",
    type: "workflow",
    trigger: { event: "candidate.created", condition: "first-for-user" },
    steps: [
      {
        icon: "🎉",
        title: "Your first candidate!",
        content:
          "AI is extracting their profile — skills, experience, and a talent grade. Let's see what you can do from here.",
        side: "bottom",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "⭐",
        title: "Talent Grade",
        content:
          "Each candidate gets an AI-generated talent grade (AAA to B) based on their profile strength, experience depth, and skill breadth.",
        selector: "#tour-candidate-grade",
        side: "left",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
      },
      {
        icon: "🔗",
        title: "Active Pipelines",
        content:
          "When a candidate is added to a role's pipeline, it appears here — showing stage, days in stage, and fit score.",
        selector: "#tour-candidate-pipelines",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
      },
      {
        icon: "🎯",
        title: "Matched Roles",
        content:
          "AI automatically finds roles that match this candidate. You can add them to a pipeline with one click, or dismiss if it's not a fit.",
        selector: "#tour-candidate-matches",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
      },
      {
        icon: "✅",
        title: "Profile complete!",
        content:
          "As you add more candidates, AI matches and ranks them across your open roles automatically.",
        side: "bottom",
        showControls: true,
        showSkip: false,
      },
    ],
  },

  // -- Workflow: First interview scheduled --
  {
    tour: "first-interview-scheduled",
    type: "workflow",
    trigger: { event: "interview.created", condition: "first-for-user" },
    steps: [
      {
        icon: "🎉",
        title: "Interview scheduled!",
        content:
          "AI is preparing everything — focus areas, suggested questions, and a structured scorecard. Here's what to expect.",
        side: "bottom",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "📖",
        title: "AI Interview Prep",
        content:
          "The Preparation tab has AI-generated questions — prioritized as must-ask or if-time-allows — with follow-ups and purpose statements for each.",
        selector: "#tour-interview-prep",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 8,
        pointerRadius: 8,
      },
      {
        icon: "🎤",
        title: "Live Transcription",
        content:
          "During the interview, AI transcribes the conversation in real-time. You can review and annotate the transcript afterward.",
        selector: "#tour-interview-info",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 8,
        pointerRadius: 8,
      },
      {
        icon: "📋",
        title: "Scorecards & Feedback",
        content:
          "After the interview, submit a scorecard — rate competencies 1-5, give a verdict from Strong No to Strong Yes. AI synthesizes all feedback into a panel summary.",
        selector: "#tour-interview-feedback",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 8,
        pointerRadius: 8,
      },
      {
        icon: "✅",
        title: "You're all set!",
        content:
          "After all interviews are complete, head back to the role's Pipeline tab to compare candidates and advance the best fit to an offer.",
        side: "bottom",
        showControls: true,
        showSkip: false,
      },
    ],
  },

  // -- Workflow: First offer created --
  {
    tour: "first-offer-created",
    type: "workflow",
    trigger: { event: "offer.created", condition: "first-for-user" },
    steps: [
      {
        icon: "🎉",
        title: "Offer sent!",
        content:
          "Your first offer is live. AI has generated a close plan to help you land the candidate. Let's walk through the offers workflow.",
        side: "bottom",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "📊",
        title: "Offer Tracking",
        content:
          "Filter offers by status — Active, Accepted, or Declined. Each active offer shows close plan progress and next steps.",
        selector: "#tour-offers-tabs",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
        nextRoute: "/recruit/offers",
      },
      {
        icon: "✅",
        title: "Close the deal",
        content:
          "Track acceptance, follow up on pending offers, and review your offer history. AI flags risks and suggests timing for follow-ups.",
        side: "bottom",
        showControls: true,
        showSkip: false,
      },
    ],
  },

  // -- Workflow: First assessment created --
  {
    tour: "first-assessment-created",
    type: "workflow",
    trigger: { event: "assessment.created", condition: "first-for-user" },
    steps: [
      {
        icon: "🎉",
        title: "Assessment created!",
        content:
          "Candidates in your pipeline will now receive this assessment automatically. Let's see how the evaluation works.",
        side: "bottom",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "📝",
        title: "Assessment Library",
        content:
          "Create assessments for different skills — technical, coding, case study, aptitude, or personality. Assign them to pipeline stages for automatic delivery.",
        selector: "#tour-new-assessment",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
        nextRoute: "/recruit/assessments",
      },
      {
        icon: "🤖",
        title: "AI Scoring",
        content:
          "When candidates submit, AI scores each response against your rubric — with evidence, confidence scores, and a hire recommendation. Results feed directly into pipeline decisions.",
        selector: "#tour-sidebar-assessments",
        side: "right",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 6,
      },
      {
        icon: "✅",
        title: "Fully automated!",
        content:
          "Assessment results are factored into candidate match scores and pipeline advancement decisions automatically.",
        side: "bottom",
        showControls: true,
        showSkip: false,
      },
    ],
  },

  // -- Workflow: Settings setup --
  {
    tour: "settings-setup",
    type: "workflow",
    steps: [
      {
        icon: "⚙️",
        title: "Configure Your Workspace",
        content:
          "Set up your organization to get the most out of Dilliznt. This covers team, departments, branding, and integrations.",
        side: "bottom",
        showControls: true,
        showSkip: true,
      },
      {
        icon: "👥",
        title: "Team & Departments",
        content:
          "Invite team members and define departments. This controls who can access roles, conduct interviews, and approve offers.",
        selector: "#tour-settings-nav",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
        nextRoute: "/recruit/settings/team",
      },
      {
        icon: "🔗",
        title: "Integrations",
        content:
          "Connect Google Calendar for interview scheduling, email for candidate outreach, and other tools your team uses.",
        selector: "#tour-settings-nav",
        side: "bottom",
        showControls: true,
        showSkip: true,
        pointerPadding: 4,
        pointerRadius: 8,
      },
      {
        icon: "✅",
        title: "You're configured!",
        content:
          "Your workspace is ready. Head back to Today to start recruiting.",
        side: "bottom",
        showControls: true,
        showSkip: false,
      },
    ],
  },
];
