"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Loader2, Sparkles, Brain, Calculator, FileText, Lock, Globe } from "lucide-react";
import { addAssessment, addAssessmentQuestion } from "@/actions/assessments";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// --- Starter Templates -------------------------------------------------------

interface QuestionTemplate {
  text: string;
  type: "SHORT_TEXT" | "MCQ" | "CODING_SNIPPET" | "SCALE";
  order: number;
  weight: number;
  options?: string[];
  correctAnswer?: string;
  rubric?: { label: string; weight: number; reverse?: boolean }[];
}

interface AssessmentTemplate {
  slug: string;
  title: string;
  description: string;
  type: "personality" | "aptitude" | "technical" | "coding" | "case_study" | "interview_rubric";
  config?: { framework: string; dimensions: string[] };
  questions: QuestionTemplate[];
}

const ASSESSMENT_TEMPLATES: AssessmentTemplate[] = [
  {
    slug: "ocean-big-five",
    title: "Big Five Personality (OCEAN)",
    description: "Likert-scale inventory measuring Openness, Conscientiousness, Extraversion, Agreeableness, and Emotional Stability (10 items, 2 per trait).",
    type: "personality",
    config: { framework: "big_five", dimensions: ["Openness", "Conscientiousness", "Extraversion", "Agreeableness", "Emotional Stability"] },
    questions: [
      // Openness
      { text: "I enjoy trying new and unfamiliar experiences.", type: "SCALE", order: 0, weight: 1, rubric: [{ label: "Openness", weight: 1 }] },
      { text: "I prefer sticking with methods I already know work well.", type: "SCALE", order: 1, weight: 1, rubric: [{ label: "Openness", weight: 1, reverse: true }] },
      // Conscientiousness
      { text: "I keep a detailed to-do list and follow through on commitments.", type: "SCALE", order: 2, weight: 1, rubric: [{ label: "Conscientiousness", weight: 1 }] },
      { text: "I sometimes leave tasks unfinished when something more interesting comes up.", type: "SCALE", order: 3, weight: 1, rubric: [{ label: "Conscientiousness", weight: 1, reverse: true }] },
      // Extraversion
      { text: "I feel energized after spending time with a large group of people.", type: "SCALE", order: 4, weight: 1, rubric: [{ label: "Extraversion", weight: 1 }] },
      { text: "I prefer working alone rather than in a group setting.", type: "SCALE", order: 5, weight: 1, rubric: [{ label: "Extraversion", weight: 1, reverse: true }] },
      // Agreeableness
      { text: "I go out of my way to make others feel comfortable and included.", type: "SCALE", order: 6, weight: 1, rubric: [{ label: "Agreeableness", weight: 1 }] },
      { text: "I find it difficult to trust others until they prove themselves.", type: "SCALE", order: 7, weight: 1, rubric: [{ label: "Agreeableness", weight: 1, reverse: true }] },
      // Emotional Stability
      { text: "I stay calm and collected even when facing tight deadlines or criticism.", type: "SCALE", order: 8, weight: 1, rubric: [{ label: "Emotional Stability", weight: 1 }] },
      { text: "I tend to worry about things that might go wrong.", type: "SCALE", order: 9, weight: 1, rubric: [{ label: "Emotional Stability", weight: 1, reverse: true }] },
    ],
  },
  {
    slug: "disc-profile",
    title: "DISC Behavioral Profile",
    description: "Likert-scale assessment of Dominance, Influence, Steadiness, and Conscientiousness behavioral styles (12 items, 3 per dimension).",
    type: "personality",
    config: { framework: "disc", dimensions: ["Dominance", "Influence", "Steadiness", "Conscientiousness"] },
    questions: [
      // Dominance
      { text: "I prefer to take charge and make decisions quickly.", type: "SCALE", order: 0, weight: 1, rubric: [{ label: "Dominance", weight: 1 }] },
      { text: "I enjoy competing and winning.", type: "SCALE", order: 1, weight: 1, rubric: [{ label: "Dominance", weight: 1 }] },
      { text: "I am direct and to the point when communicating.", type: "SCALE", order: 2, weight: 1, rubric: [{ label: "Dominance", weight: 1 }] },
      // Influence
      { text: "I enjoy persuading others and building enthusiasm for ideas.", type: "SCALE", order: 3, weight: 1, rubric: [{ label: "Influence", weight: 1 }] },
      { text: "I thrive in collaborative, social work environments.", type: "SCALE", order: 4, weight: 1, rubric: [{ label: "Influence", weight: 1 }] },
      { text: "I am optimistic and tend to see the positive side of situations.", type: "SCALE", order: 5, weight: 1, rubric: [{ label: "Influence", weight: 1 }] },
      // Steadiness
      { text: "I value consistency and prefer a predictable work environment.", type: "SCALE", order: 6, weight: 1, rubric: [{ label: "Steadiness", weight: 1 }] },
      { text: "I am patient and willing to listen to others before responding.", type: "SCALE", order: 7, weight: 1, rubric: [{ label: "Steadiness", weight: 1 }] },
      { text: "I dislike sudden changes and prefer gradual transitions.", type: "SCALE", order: 8, weight: 1, rubric: [{ label: "Steadiness", weight: 1 }] },
      // Conscientiousness
      { text: "I pay close attention to details and double-check my work.", type: "SCALE", order: 9, weight: 1, rubric: [{ label: "Conscientiousness", weight: 1 }] },
      { text: "I prefer following established procedures over improvising.", type: "SCALE", order: 10, weight: 1, rubric: [{ label: "Conscientiousness", weight: 1 }] },
      { text: "I set high standards for the quality of my output.", type: "SCALE", order: 11, weight: 1, rubric: [{ label: "Conscientiousness", weight: 1 }] },
    ],
  },
  {
    slug: "general-aptitude",
    title: "General Aptitude Test",
    description: "Measures logical reasoning, numerical ability, pattern recognition, and verbal comprehension (12 items with progressive difficulty).",
    type: "aptitude",
    questions: [
      // Logical reasoning
      { text: "If all roses are flowers and some flowers fade quickly, which statement is definitely true?", type: "MCQ", order: 0, weight: 1, options: ["All roses fade quickly", "Some roses fade quickly", "No roses fade quickly", "Some flowers are roses"], correctAnswer: "Some flowers are roses" },
      { text: "If no managers are interns, and some interns are students, which must be true?", type: "MCQ", order: 1, weight: 1, options: ["No managers are students", "Some students are not managers", "All students are interns", "Some managers are students"], correctAnswer: "Some students are not managers" },
      { text: "Statement: 'All successful projects had clear goals.' Which weakens this claim?", type: "MCQ", order: 2, weight: 1, options: ["A project with clear goals failed", "A successful project had unclear goals", "Most projects fail regardless", "Goals change over time"], correctAnswer: "A successful project had unclear goals" },
      // Numerical ability
      { text: "What comes next in the sequence: 2, 6, 12, 20, 30, ?", type: "MCQ", order: 3, weight: 1, options: ["40", "42", "36", "38"], correctAnswer: "42" },
      { text: "If a product costs $80 after a 20% discount, what was the original price?", type: "MCQ", order: 4, weight: 1, options: ["$96", "$100", "$104", "$90"], correctAnswer: "$100" },
      { text: "A company's revenue grew 50% in Year 1 then declined 30% in Year 2. What is the net change from the original?", type: "MCQ", order: 5, weight: 1, options: ["+20%", "+5%", "-5%", "+10%"], correctAnswer: "+5%" },
      // Pattern recognition
      { text: "If 5 machines produce 5 widgets in 5 minutes, how long for 100 machines to produce 100 widgets?", type: "MCQ", order: 6, weight: 1, options: ["100 minutes", "5 minutes", "20 minutes", "1 minute"], correctAnswer: "5 minutes" },
      { text: "What comes next: 1, 1, 2, 3, 5, 8, ?", type: "MCQ", order: 7, weight: 1, options: ["11", "13", "10", "12"], correctAnswer: "13" },
      { text: "A train travels 240 km in 3 hours. At 20 km/h faster, how long is the same journey?", type: "MCQ", order: 8, weight: 1, options: ["2 hours", "2.4 hours", "2.5 hours", "2.2 hours"], correctAnswer: "2.4 hours" },
      // Verbal comprehension
      { text: "BOOK is to READING as FORK is to:", type: "MCQ", order: 9, weight: 1, options: ["Drawing", "Eating", "Cooking", "Cutting"], correctAnswer: "Eating" },
      { text: "Which word does NOT belong: Apple, Banana, Carrot, Mango?", type: "MCQ", order: 10, weight: 1, options: ["Apple", "Banana", "Carrot", "Mango"], correctAnswer: "Carrot" },
      { text: "ARCHITECT is to BLUEPRINT as COMPOSER is to:", type: "MCQ", order: 11, weight: 1, options: ["Orchestra", "Score", "Music", "Instrument"], correctAnswer: "Score" },
    ],
  },
  {
    slug: "mbti-indicator",
    title: "MBTI-Style Type Indicator",
    description: "Forced-choice assessment of four preference dimensions: E/I, S/N, T/F, J/P (8 items, 2 per dimension).",
    type: "personality",
    config: { framework: "mbti", dimensions: ["Extraversion/Introversion", "Sensing/Intuition", "Thinking/Feeling", "Judging/Perceiving"] },
    questions: [
      // E/I dimension
      { text: "At a work event, I am more likely to:", type: "MCQ", order: 0, weight: 1, options: ["Initiate conversations with people I haven't met", "Wait for others to approach me or stick with people I know"], rubric: [{ label: "Extraversion", weight: 1 }] },
      { text: "When solving a problem, I prefer to:", type: "MCQ", order: 1, weight: 1, options: ["Talk it through with others immediately", "Think it over privately before discussing"], rubric: [{ label: "Extraversion", weight: 1 }] },
      // S/N dimension
      { text: "When starting a new project, I focus first on:", type: "MCQ", order: 2, weight: 1, options: ["Concrete facts, details, and what has worked before", "The big picture, possibilities, and novel approaches"], rubric: [{ label: "Intuition", weight: 1 }] },
      { text: "I am more drawn to information that is:", type: "MCQ", order: 3, weight: 1, options: ["Practical, specific, and immediately useful", "Theoretical, abstract, and future-oriented"], rubric: [{ label: "Intuition", weight: 1 }] },
      // T/F dimension
      { text: "When giving feedback to a colleague, I prioritize:", type: "MCQ", order: 4, weight: 1, options: ["Being truthful and logical, even if it's uncomfortable", "Being tactful and considering their feelings"], rubric: [{ label: "Feeling", weight: 1 }] },
      { text: "When making a tough decision, I rely more on:", type: "MCQ", order: 5, weight: 1, options: ["Objective criteria and logical analysis", "Personal values and impact on people involved"], rubric: [{ label: "Feeling", weight: 1 }] },
      // J/P dimension
      { text: "I prefer my work schedule to be:", type: "MCQ", order: 6, weight: 1, options: ["Structured with clear plans and deadlines set in advance", "Flexible with room to adapt as things develop"], rubric: [{ label: "Perceiving", weight: 1 }] },
      { text: "When a deadline is far away, I tend to:", type: "MCQ", order: 7, weight: 1, options: ["Start early and work steadily toward completion", "Wait for inspiration or pressure before diving in"], rubric: [{ label: "Perceiving", weight: 1 }] },
    ],
  },
];

const TYPE_OPTIONS = [
  { value: "technical", label: "Technical", description: "Technical knowledge and problem-solving" },
  { value: "coding", label: "Coding", description: "Programming skills and code quality" },
  { value: "personality", label: "Personality", description: "Behavioral traits and work style" },
  { value: "aptitude", label: "Aptitude", description: "Cognitive abilities and reasoning" },
  { value: "case_study", label: "Case Study", description: "Real-world scenario analysis (written response)" },
  { value: "interview_rubric", label: "Interview Rubric", description: "Prompts read aloud in a live interview, graded from the transcript against a rubric — no submission. Must be attached to an interview." },
] as const;

type AssessmentType = typeof TYPE_OPTIONS[number]["value"];

function getTemplateIcon(type: string) {
  switch (type) {
    case "personality": return <Brain className="h-4 w-4" />;
    case "aptitude": return <Calculator className="h-4 w-4" />;
    default: return <FileText className="h-4 w-4" />;
  }
}

export default function NewAssessmentPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<AssessmentTemplate | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<AssessmentType>("technical");
  const [visibility, setVisibility] = useState<"private" | "public">("public");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTemplateSelect = (template: AssessmentTemplate) => {
    setSelectedTemplate(template);
    setTitle(template.title);
    setDescription(template.description);
    setType(template.type);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Assessment title is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Create the assessment
      const assessment = await addAssessment({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        visibility,
        status: "draft",
        ...(selectedTemplate?.config ? { config: selectedTemplate.config } : {}),
      });

      const assessmentId = (assessment as any).id;

      // If using a template, add the questions
      if (selectedTemplate) {
        for (const q of selectedTemplate.questions) {
          await addAssessmentQuestion({
            assessmentId,
            text: q.text,
            type: q.type,
            order: q.order,
            weight: q.weight,
            options: q.options ?? null,
            correctAnswer: q.correctAnswer ?? null,
            rubric: q.rubric ?? null,
          });
        }
      }

      router.push(`/recruit/assessments/${assessmentId}`);
    } catch (err) {
      console.error("Failed to create assessment:", err);
      setError(err instanceof Error ? err.message : "Failed to create assessment");
      setSubmitting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-8">
          <Link
            href="/recruit/assessments"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Assessments
          </Link>

          <div>
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <ClipboardCheck className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">
                New Assessment
              </span>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Create an assessment
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Start from a proven template or create a custom assessment from scratch.
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="flex items-center gap-2 p-1 rounded-lg border border-border bg-card w-fit">
            <Button
              type="button"
              variant="pill"
              onClick={() => { setMode("template"); setSelectedTemplate(null); }}
              className="px-4 py-2 text-xs"
              data-active={mode === "template" || undefined}
            >
              Start from template
            </Button>
            <Button
              type="button"
              variant="pill"
              onClick={() => { setMode("custom"); setSelectedTemplate(null); setTitle(""); setDescription(""); }}
              className="px-4 py-2 text-xs"
              data-active={mode === "custom" || undefined}
            >
              Create custom
            </Button>
          </div>

          {mode === "template" && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-foreground">Choose a template</p>
              <div className="grid grid-cols-2 gap-3">
                {ASSESSMENT_TEMPLATES.map((template) => (
                  <Button
                    key={template.slug}
                    type="button"
                    variant="unstyled"
                    onClick={() => handleTemplateSelect(template)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-all",
                      selectedTemplate?.slug === template.slug
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50 hover:bg-secondary/30"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        template.type === "personality" ? "bg-purple-100 text-purple-600" :
                        template.type === "aptitude" ? "bg-cyan-100 text-cyan-600" :
                        "bg-blue-100 text-blue-600"
                      )}>
                        {getTemplateIcon(template.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{template.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {template.questions.length} questions
                        </p>
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {(mode === "custom" || selectedTemplate) && (
              <div className="rounded-xl border border-border bg-card p-6 space-y-5">
                <div>
                  <Label className="text-xs font-semibold text-foreground">
                    Assessment title
                  </Label>
                  <Input
                    type="text"
                    placeholder="e.g. Senior Engineer Technical Screen"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus={mode === "custom"}
                  />
                </div>

                {mode === "custom" && (
                  <div>
                    <Label className="text-xs font-semibold text-foreground">
                      Assessment type
                    </Label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {TYPE_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          variant="unstyled"
                          onClick={() => setType(option.value)}
                          className={cn(
                            "rounded-lg border px-3 py-2.5 text-left transition-colors",
                            type === option.value
                              ? "border-primary bg-primary/5 ring-1 ring-primary"
                              : "border-border hover:bg-secondary/50"
                          )}
                        >
                          <p className="text-xs font-semibold text-foreground">{option.label}</p>
                          <p className="text-[10px] text-muted-foreground">{option.description}</p>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs font-semibold text-foreground">
                    Description
                  </Label>
                  <Textarea
                    rows={3}
                    placeholder="Describe what this assessment evaluates and when to use it."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3">
                  <div className="flex items-center gap-3">
                    {visibility === "private" ? (
                      <Lock className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        {visibility === "private" ? "Private" : "Public"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {visibility === "private"
                          ? "Only assigned candidates can see this assessment"
                          : "All candidates in the pipeline can see this assessment"}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="unstyled"
                    onClick={() => setVisibility(visibility === "private" ? "public" : "private")}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                      visibility === "private" ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        visibility === "private" ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </Button>
                </div>

                {selectedTemplate && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                    <p className="text-xs font-medium text-amber-800">
                      <Sparkles className="inline h-3 w-3 mr-1" />
                      {selectedTemplate.questions.length} questions will be added from the template
                    </p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs text-red-700">{error}</p>
              </div>
            )}

            {(mode === "custom" || selectedTemplate) && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Link
                  href="/recruit/assessments"
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
                >
                  Cancel
                </Link>
                <Button
                  type="submit"
                  disabled={submitting || !title.trim()}
                  className="rounded-lg px-4 py-2 text-xs"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="h-3 w-3" />
                      {selectedTemplate ? "Create from template" : "Create assessment"}
                    </>
                  )}
                </Button>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
