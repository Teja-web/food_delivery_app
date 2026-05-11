"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { editAssessment, addAssessmentQuestion, editAssessmentQuestion, removeAssessmentQuestion, generateAssessmentQuestions } from "@/actions/assessments";
import type { SerializedAssessmentDetail, SerializedQuestion } from "../serialize";
import { QUESTION_TYPES } from "../serialize";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const QUESTION_TYPE_LABELS: Record<string, string> = {
  SHORT_TEXT: "Short Text",
  LONG_TEXT: "Long Text",
  MCQ: "Multiple Choice",
  MULTI_SELECT: "Multi Select",
  CODING_SNIPPET: "Coding",
  SCALE: "Scale",
  BOOLEAN: "Yes/No",
};

interface Props extends SerializedAssessmentDetail {}

export default function AssessmentEditClient(props: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(props.title);
  const [description, setDescription] = useState(props.description ?? "");
  const [status, setStatus] = useState(props.status);
  const [visibility, setVisibility] = useState(props.visibility);
  const [questions, setQuestions] = useState<SerializedQuestion[]>(props.questions);
  const [saving, setSaving] = useState(false);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionType, setNewQuestionType] = useState<string>("SHORT_TEXT");
  const [newQuestionOptions, setNewQuestionOptions] = useState<string[]>([""]);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);

  // Editing question state
  const [editingQuestionText, setEditingQuestionText] = useState("");
  const [editingQuestionType, setEditingQuestionType] = useState("");
  const [editingQuestionWeight, setEditingQuestionWeight] = useState(1);
  const [editingQuestionRubric, setEditingQuestionRubric] = useState<{ label: string; weight: number }[]>([]);
  const [editingQuestionOptions, setEditingQuestionOptions] = useState<string[]>([]);
  const [savingQuestion, setSavingQuestion] = useState(false);

  const needsOptions = (type: string) => type === "MCQ" || type === "MULTI_SELECT";

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateAssessmentQuestions({
        assessmentId: props.id,
        title: title,
        type: props.type,
        description: description,
        instructions: instructions.trim() || null,
      });
      if (result.success && result.questions) {
        // Update local state immediately with generated questions
        const newQuestions = result.questions.map((q: any, idx: number) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          order: idx,
          weight: q.weight ?? 1,
          options: q.options ?? null,
          correctAnswer: q.correctAnswer ?? null,
          rubric: q.rubric ?? null,
        }));
        setQuestions([...questions, ...newQuestions]);
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to generate questions:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (andClose = false) => {
    setSaving(true);
    try {
      await editAssessment(props.id, {
        title,
        description: description || undefined,
        status,
        visibility,
      });
      if (andClose) {
        router.push(`/recruit/assessments/${props.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to save:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestionText.trim()) return;
    setAddingQuestion(true);
    try {
      const optionsToSave = needsOptions(newQuestionType)
        ? newQuestionOptions.filter((o) => o.trim()).map((o) => o.trim())
        : null;
      const q = await addAssessmentQuestion({
        assessmentId: props.id,
        text: newQuestionText.trim(),
        type: newQuestionType,
        order: questions.length,
        weight: 1,
        options: optionsToSave && optionsToSave.length > 0 ? optionsToSave : null,
      });
      setQuestions([...questions, {
        id: (q as any).id,
        text: newQuestionText.trim(),
        type: newQuestionType,
        order: questions.length,
        weight: 1,
        options: optionsToSave && optionsToSave.length > 0 ? optionsToSave : null,
        correctAnswer: null,
        rubric: null,
      }]);
      setNewQuestionText("");
      setNewQuestionType("SHORT_TEXT");
      setNewQuestionOptions([""]);
    } catch (err) {
      console.error("Failed to add question:", err);
    } finally {
      setAddingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      await removeAssessmentQuestion(questionId);
      setQuestions(questions.filter((q) => q.id !== questionId));
      setExpandedQuestion(null);
    } catch (err) {
      console.error("Failed to delete question:", err);
    }
  };

  const handleExpandQuestion = (questionId: string) => {
    if (expandedQuestion === questionId) {
      setExpandedQuestion(null);
    } else {
      const q = questions.find((q) => q.id === questionId);
      if (q) {
        setEditingQuestionText(q.text);
        setEditingQuestionType(q.type);
        const existingOptions = Array.isArray(q.options) ? (q.options as string[]) : [];
        setEditingQuestionOptions(existingOptions.length > 0 ? existingOptions : [""]);
        const rubric = (q.rubric as { label: string; weight: number }[]) ?? [];
        setEditingQuestionRubric(rubric);
        // If rubric exists, weight is sum of rubric weights; otherwise use stored weight
        setEditingQuestionWeight(rubric.length > 0 ? rubric.reduce((sum, r) => sum + r.weight, 0) : q.weight);
      }
      setExpandedQuestion(questionId);
    }
  };

  // Calculate total weight from rubric criteria
  const calculateRubricWeight = (rubric: { label: string; weight: number }[]) => {
    if (rubric.length === 0) return editingQuestionWeight;
    return rubric.reduce((sum, r) => sum + r.weight, 0);
  };

  const addRubricCriterion = () => {
    const updated = [...editingQuestionRubric, { label: "", weight: 1 }];
    setEditingQuestionRubric(updated);
    setEditingQuestionWeight(calculateRubricWeight(updated));
  };

  const updateRubricCriterion = (index: number, field: "label" | "weight", value: string | number) => {
    const updated = [...editingQuestionRubric];
    updated[index] = { ...updated[index], [field]: value };
    setEditingQuestionRubric(updated);
    if (field === "weight") {
      setEditingQuestionWeight(calculateRubricWeight(updated));
    }
  };

  const removeRubricCriterion = (index: number) => {
    const updated = editingQuestionRubric.filter((_, i) => i !== index);
    setEditingQuestionRubric(updated);
    setEditingQuestionWeight(updated.length > 0 ? calculateRubricWeight(updated) : 1);
  };

  const handleSaveQuestion = async (questionId: string) => {
    setSavingQuestion(true);
    try {
      const rubricToSave = editingQuestionRubric.filter((r) => r.label.trim());
      const optionsToSave = needsOptions(editingQuestionType)
        ? editingQuestionOptions.filter((o) => o.trim()).map((o) => o.trim())
        : null;
      await editAssessmentQuestion(questionId, {
        text: editingQuestionText,
        type: editingQuestionType,
        weight: editingQuestionWeight,
        rubric: rubricToSave.length > 0 ? rubricToSave : null,
        options: optionsToSave && optionsToSave.length > 0 ? optionsToSave : null,
      });
      setQuestions(questions.map((q) =>
        q.id === questionId
          ? { ...q, text: editingQuestionText, type: editingQuestionType, weight: editingQuestionWeight, rubric: rubricToSave.length > 0 ? rubricToSave : null, options: optionsToSave && optionsToSave.length > 0 ? optionsToSave : null }
          : q
      ));
      setExpandedQuestion(null);
    } catch (err) {
      console.error("Failed to save question:", err);
    } finally {
      setSavingQuestion(false);
    }
  };

  const toggleStatus = async () => {
    const newStatus = status === "draft" ? "active" : "draft";
    setStatus(newStatus);
    try {
      await editAssessment(props.id, { status: newStatus });
      router.refresh();
    } catch (err) {
      console.error("Failed to update status:", err);
      setStatus(status);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="space-y-6">
          <Link
            href={`/recruit/assessments/${props.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to assessment
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Edit3 className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Edit Assessment
                </span>
              </div>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent font-display text-2xl font-bold tracking-tight text-foreground border-none focus:outline-none focus:ring-0 p-0"
                placeholder="Assessment title"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                onClick={() => handleSave(true)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <Label className="text-xs font-semibold text-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Describe what this assessment evaluates..."
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
            <div className="mt-3 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span>Type: <span className="font-medium text-foreground capitalize">{props.type ?? "Other"}</span></span>
              <span>Created: {props.createdAt}</span>
              <span>Updated: {props.updatedAt}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <Label className="text-xs font-semibold text-foreground">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <Label className="text-xs font-semibold text-foreground">Visibility</Label>
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public - All candidates can see</SelectItem>
                  <SelectItem value="private">Private - Only assigned candidates</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">
                Questions ({questions.length})
              </h2>
              {!showInstructions && (
                <div className="flex items-stretch rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
                  <Button
                    variant="unstyled"
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <Loader2 size={15} className="shrink-0 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} className="shrink-0" />
                        Generate with AI
                      </>
                    )}
                  </Button>
                  <Button
                    variant="unstyled"
                    onClick={() => setShowInstructions(true)}
                    disabled={generating}
                    title="Add instructions before generating"
                    className="flex items-center gap-1 border-l border-amber-200 px-2.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    <Plus size={13} className="shrink-0" />
                    Instructions
                  </Button>
                </div>
              )}
            </div>

            {showInstructions && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/40 overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-amber-200/70 bg-amber-50/70 px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={13} className="shrink-0 text-amber-700" />
                    <p className="text-xs font-semibold text-amber-900">
                      AI question generator
                    </p>
                    <span className="text-[11px] font-normal text-amber-700/70">
                      — instructions are recruiter-only, not saved, not shown to candidate
                    </span>
                  </div>
                  <Button
                    variant="unstyled"
                    onClick={() => setShowInstructions(false)}
                    disabled={generating}
                    title="Hide instructions"
                    className="flex h-6 w-6 items-center justify-center rounded-md text-amber-700/70 hover:bg-amber-100 hover:text-amber-900 transition-colors disabled:opacity-50"
                  >
                    <X size={13} />
                  </Button>
                </div>
                <div className="p-4">
                  <Textarea
                    rows={6}
                    placeholder={`Steer how the AI generates questions. Example:\n\nGenerate 8 LONG_TEXT questions, one per area below, in this order:\n1. Workflow breakdown\n2. Components/modules\n3. Pseudo-code\n4. Assumptions\n5. Edge cases\n…\n\nPhrase each as an interviewer prompt. Include a 2-3 criterion rubric per question.`}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="w-full resize-none border-amber-200/80 bg-white/60 focus:bg-white"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-[11px] text-amber-800/70">
                      The candidate sees the assessment description as their problem statement. These instructions only steer this one generation run.
                    </p>
                    <Button
                      variant="unstyled"
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                    >
                      {generating ? (
                        <>
                          <Loader2 size={15} className="shrink-0 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles size={15} className="shrink-0" />
                          Generate with AI
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {questions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
                <Sparkles size={15} className="mx-auto h-8 w-8 text-amber-400/50" />
                <p className="mt-2 text-sm font-medium text-foreground">No questions yet</p>
                <p className="text-xs text-muted-foreground">
                  Click "Generate with AI" to auto-create questions, or add manually below
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <div
                      className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                      onClick={() => handleExpandQuestion(q.id)}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-0.5 shrink-0 cursor-grab" />
                      <span className="text-xs font-medium text-muted-foreground w-6 mt-0.5 shrink-0">{idx + 1}.</span>
                      <span className="flex-1 text-sm text-foreground truncate">{q.text.split("\n")[0].replace(/\*\*/g, "").replace(/[`#~]/g, "")}</span>
                      <div className="flex items-center gap-2 shrink-0 mt-0.5">
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {(() => {
                            const rubric = q.rubric as { label: string; weight: number }[] | null;
                            const weight = rubric && rubric.length > 0 ? rubric.reduce((sum, r) => sum + r.weight, 0) : q.weight;
                            return `${weight} pt${weight !== 1 ? "s" : ""}`;
                          })()}
                        </span>
                        {expandedQuestion === q.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    {expandedQuestion === q.id && (
                      <div className="border-t border-border bg-secondary/20 px-4 py-4 space-y-4">
                        <div>
                          <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Question Text
                          </Label>
                          <Textarea
                            value={editingQuestionText}
                            onChange={(e) => setEditingQuestionText(e.target.value)}
                            rows={4}
                            placeholder="Supports markdown and code blocks with ```"
                            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                          />
                        </div>
                        <div className="flex items-end gap-4">
                          <div>
                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Type
                            </Label>
                            <Select value={editingQuestionType} onValueChange={setEditingQuestionType}>
                              <SelectTrigger className="mt-1 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {QUESTION_TYPES.map((t) => (
                                  <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t] ?? t}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Weight {editingQuestionRubric.length > 0 && <span className="font-normal">(auto)</span>}
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={100}
                              value={editingQuestionWeight}
                              onChange={(e) => setEditingQuestionWeight(Math.max(1, parseInt(e.target.value) || 1))}
                              disabled={editingQuestionRubric.length > 0}
                              className={cn(
                                "mt-1 w-20 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary",
                                editingQuestionRubric.length > 0 && "opacity-60 cursor-not-allowed"
                              )}
                            />
                          </div>
                          {editingQuestionRubric.length > 0 && (
                            <p className="text-[10px] text-muted-foreground pb-2">Sum of rubric weights</p>
                          )}
                        </div>

                        {/* Answer Options for MCQ / Multi Select */}
                        {needsOptions(editingQuestionType) && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                Answer Options
                              </Label>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); setEditingQuestionOptions([...editingQuestionOptions, ""]); }}
                                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                              >
                                <Plus className="h-3 w-3" />
                                Add option
                              </Button>
                            </div>
                            {editingQuestionOptions.map((opt, i) => (
                              <div key={i} className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{String.fromCharCode(65 + i)}.</span>
                                <Input
                                  type="text"
                                  placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                  value={opt}
                                  onChange={(e) => {
                                    const updated = [...editingQuestionOptions];
                                    updated[i] = e.target.value;
                                    setEditingQuestionOptions(updated);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                {editingQuestionOptions.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={(e) => { e.stopPropagation(); setEditingQuestionOptions(editingQuestionOptions.filter((_, j) => j !== i)); }}
                                    className="text-muted-foreground hover:text-red-600"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Rubric Criteria */}
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                              Rubric Criteria
                            </Label>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); addRubricCriterion(); }}
                              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                            >
                              <Plus className="h-3 w-3" />
                              Add criterion
                            </Button>
                          </div>
                          {editingQuestionRubric.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No rubric criteria defined</p>
                          ) : (
                            <div className="space-y-2">
                              {editingQuestionRubric.map((criterion, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <Input
                                    type="text"
                                    placeholder="Criterion label"
                                    value={criterion.label}
                                    onChange={(e) => updateRubricCriterion(i, "label", e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                  <Input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={criterion.weight}
                                    onChange={(e) => updateRubricCriterion(i, "weight", Math.max(1, parseInt(e.target.value) || 1))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary text-center"
                                  />
                                  <span className="text-[10px] text-muted-foreground">wt</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={(e) => { e.stopPropagation(); removeRubricCriterion(i); }}
                                    className="text-muted-foreground hover:text-red-600"
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <Button
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(q.id); }}
                            className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                          <Button
                            variant="default"
                            onClick={(e) => { e.stopPropagation(); handleSaveQuestion(q.id); }}
                            disabled={savingQuestion || !editingQuestionText.trim()}
                            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {savingQuestion ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Save className="h-3 w-3" />
                            )}
                            Save
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-semibold text-foreground mb-3">Add Question</p>
              <div className="space-y-3">
                <Textarea
                  placeholder="Enter question text... (supports markdown, code blocks with ```)"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
                <div className="flex items-center gap-3">
                  <Select value={newQuestionType} onValueChange={(v) => { setNewQuestionType(v); if (needsOptions(v) && newQuestionOptions.length === 0) setNewQuestionOptions([""]); }}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{QUESTION_TYPE_LABELS[t] ?? t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="default"
                    onClick={handleAddQuestion}
                    disabled={addingQuestion || !newQuestionText.trim()}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {addingQuestion ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Plus className="h-3 w-3" />
                    )}
                    Add
                  </Button>
                </div>
                {needsOptions(newQuestionType) && (
                  <div className="rounded-lg border border-border bg-secondary/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Answer Options
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setNewQuestionOptions([...newQuestionOptions, ""])}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                      >
                        <Plus className="h-3 w-3" />
                        Add option
                      </Button>
                    </div>
                    {newQuestionOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{String.fromCharCode(65 + i)}.</span>
                        <Input
                          type="text"
                          placeholder={`Option ${String.fromCharCode(65 + i)}`}
                          value={opt}
                          onChange={(e) => {
                            const updated = [...newQuestionOptions];
                            updated[i] = e.target.value;
                            setNewQuestionOptions(updated);
                          }}
                          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        {newQuestionOptions.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setNewQuestionOptions(newQuestionOptions.filter((_, j) => j !== i))}
                            className="text-muted-foreground hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
