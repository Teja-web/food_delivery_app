# Assessment Exercise Library

Reformatted for the new-assessment form. Each entry has:

- **Title** — paste into the title field
- **Description** — paste into the description field (candidate sees this as the problem statement)
- **Instructions** — paste into the "Add instructions" panel before clicking "Generate with AI" (recruiter-only, not saved, not shown to candidate)

All exercises are designed for `interview_rubric` type (prompts read aloud in a live interview, transcript scored against the rubric). For async written assessments, use `case_study` type — same content works.

---

## 1. Multi-Channel Lead Assignment & Escalation Workflow

### Title
```
Multi-Channel Lead Assignment & Escalation Workflow
```

### Description
```
A company receives inbound leads from multiple channels including website forms, WhatsApp, referrals, and paid advertising campaigns. The organization wants to automate lead intake, assignment, duplicate detection, prioritization, and escalation handling.

The system should intelligently route leads to the appropriate sales teams based on geography, lead type, and urgency while ensuring operational visibility and response-time accountability.

The company also wants to explore where AI and automation can improve efficiency and decision-making.

## Business Rules
- Leads arrive from: Website, WhatsApp, Referral, Paid Ads
- Enterprise leads should go to senior sales reps
- Leads from India should route to the India team
- Duplicate leads should not create new records
- High-priority leads should trigger Slack/email alerts
- Unassigned leads older than 30 minutes should escalate
```

### Instructions
```
Generate 8 LONG_TEXT questions, one per area below, in this order:

1. Workflow breakdown and logic flow
2. System components/modules involved
3. Pseudo-code or decision logic for routing
4. Assumptions the candidate is making
5. Edge cases and failure scenarios
6. AI and automation opportunities
7. Suggested alerts/escalation mechanisms
8. How they would track system reliability and auditability

Phrase each question as an interviewer prompt to read aloud. Do not restate the scenario — candidates can see it. For each question, include a rubric with 2-3 criteria specific to that deliverable. Weight pseudo-code and edge cases higher (3); weight assumptions and AI opportunities lower (1).
```

---

## 2. AI-Powered Support Ticket Classification & Routing System

### Title
```
AI-Powered Support Ticket Classification & Routing System
```

### Description
```
A company receives a high volume of customer support tickets through email, chat, and web forms. They want to implement an AI-assisted support triage system that can automatically categorize, prioritize, and route tickets to the correct internal teams.

The business also wants escalation workflows for urgent or negative customer interactions while maintaining human oversight where required.

## Requirements
- Incoming support tickets should be categorized using AI
- Tickets should be prioritized automatically
- Tickets should be routed to the correct teams
- Tickets with negative sentiment should be escalated
```

### Instructions
```
Generate 10 LONG_TEXT questions, one per area below, in this order:

1. Ticket lifecycle/workflow design
2. AI classification and prioritization logic
3. Routing and escalation rules
4. Confidence threshold handling
5. Human fallback/override logic
6. Pseudo-code or workflow logic
7. Failure scenarios and edge cases
8. Areas where AI should be used
9. Areas where AI should NOT be used
10. Auditability and monitoring considerations

Phrase each question as an interviewer prompt to read aloud. Do not restate the scenario. Include a 2-3 criterion rubric per question. Weight the AI-boundary questions (8 and 9) and confidence-threshold question (4) higher — they are the strongest signal of judgment.
```

---

## 3. AI-Based Document Intake, Validation & Summary Workflow

### Title
```
AI-Based Document Intake, Validation & Summary Workflow
```

### Description
```
A founder wants to build a system where users upload documents, AI extracts key information, identifies missing or incomplete fields, and automatically generates a draft summary for internal review.

The business requirements are intentionally high-level and ambiguous. Your task is to translate the business intent into a structured implementation plan and workflow.

## Founder Requirement
> "We need a system where clients upload documents, AI extracts information, flags missing fields, and creates a draft summary automatically."
```

### Instructions
```
Generate 10 LONG_TEXT questions, one per area below, in this order:

1. Workflow breakdown
2. Key modules/components required
3. Data flow between components
4. AI processing stages
5. Pseudo-code or process logic
6. Assumptions and constraints
7. Edge cases and operational risks
8. Suggested AI prompts the candidate would use
9. Human review/approval stages
10. Recommended implementation sequence/phases

Phrase each question as an interviewer prompt to read aloud. The brief is intentionally vague — questions should probe how the candidate handles ambiguity and which assumptions they surface. Include a 2-3 criterion rubric per question. Weight assumptions (6), edge cases (7), and AI prompts (8) higher.
```

---

## 4. Manual Operations Workflow Redesign & Automation Strategy

### Title
```
Manual Operations Workflow Redesign & Automation Strategy
```

### Description
```
A team currently manages requests manually through emails, spreadsheets, and WhatsApp communication. This process is slow, error-prone, and difficult to track.

The company wants a redesigned operational workflow with automation opportunities and AI-assisted improvements where appropriate.

## Current Workflow
The team currently:
- Receives requests via email
- Copies data into spreadsheets manually
- Assigns work manually
- Follows up using WhatsApp
```

### Instructions
```
Generate 9 LONG_TEXT questions, one per area below, in this order:

1. Problems in the current workflow
2. Proposed future-state workflow
3. Automation opportunities
4. AI opportunities
5. Process logic or pseudo-code
6. Suggested tools/systems
7. Exception handling
8. Metrics/KPIs to measure success
9. Risks and implementation considerations

Phrase each question as an interviewer prompt to read aloud. Include a 2-3 criterion rubric per question. Weight future-state design (2), AI opportunities (4), and KPIs (8) higher — they reveal whether the candidate thinks beyond just "automate the current steps".
```

---

## 5. AI Prompt Engineering for Product Requirement Generation

### Title
```
AI Prompt Engineering for Product Requirement Generation
```

### Description
```
A company wants to use AI to automatically generate Product Requirement Documents (PRDs) from stakeholder meeting transcripts.

The goal is not only to create a prompt, but to design a reliable workflow that produces structured, reviewable, and high-quality outputs.

## Objective
Generate a product requirement draft from a stakeholder conversation transcript.
```

### Instructions
```
Generate 8 LONG_TEXT questions, one per area below, in this order:

1. The AI prompt the candidate would use
2. Required inputs/context
3. Expected output structure
4. Validation and quality-checking approach
5. Risks and failure scenarios
6. Iteration/improvement strategy
7. Human review workflow
8. Prompt modularization strategy

Phrase each question as an interviewer prompt to read aloud. This is a prompt-engineering exercise — questions should test how the candidate thinks about reliability, structure, and failure modes of LLM outputs. Include a 2-3 criterion rubric per question. Weight the actual prompt (1), validation (4), and failure modes (5) highest.
```

---

## 6. Leave Approval Workflow Design with Edge Case Handling

### Title
```
Leave Approval Workflow Design with Edge Case Handling
```

### Description
```
A company wants to digitize and automate its employee leave approval process. The workflow should support multiple leave types, approvals, escalations, and policy exceptions.

The primary goal of this exercise is to evaluate systems thinking and edge-case awareness.

## Scenarios to consider
- Manager unavailable
- Overlapping leave requests
- Timezone/date conflicts
- Half-day leave handling
- Policy exceptions
- Approval delegation
- Leave cancellation/modification
- Emergency leave situations
```

### Instructions
```
Generate 7 LONG_TEXT questions, one per area below, in this order:

1. Workflow states and transitions
2. Approval logic
3. Pseudo-code or process logic
4. Edge cases and exception handling
5. Escalation mechanisms
6. Audit and tracking considerations
7. Assumptions and constraints

Phrase each question as an interviewer prompt to read aloud. This exercise prioritizes systems thinking and edge-case coverage — weight the edge-case question (4) at 5 and the escalation question (5) at 3. For the edge-case rubric, explicitly list the 8 scenarios from the description as criteria so the interviewer can check coverage.
```
