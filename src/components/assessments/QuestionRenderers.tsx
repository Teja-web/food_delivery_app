"use client";

import { Check } from "lucide-react";
import { CodeEditor } from "@/components/assessments/CodeEditor";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/* -- Types --------------------------------------------------- */

export interface Question {
  id: string;
  text: string;
  type: string;
  order: number | null;
  options: unknown;
}

type Variant = "portal" | "live";

interface RendererProps {
  question: Question;
  value: string;
  onChange: (v: string) => void;
  variant?: Variant;
  readOnly?: boolean;
}

/* -- Style helpers ------------------------------------------- */

function inputClass(variant: Variant, readOnly?: boolean) {
  const base = "w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-colors";
  const disabled = readOnly ? " opacity-70 cursor-not-allowed" : "";
  if (variant === "live") {
    return `${base} border-white/10 bg-neutral-800 text-neutral-100 placeholder:text-neutral-500 focus:ring-blue-500/30 focus:border-blue-500/50 focus:bg-neutral-800 focus-visible:bg-neutral-800${disabled}`;
  }
  return `${base} border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:ring-primary/20 focus:border-primary${disabled}`;
}

function optionClass(variant: Variant, selected: boolean) {
  if (variant === "live") {
    return `flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
      selected
        ? "border-blue-500/50 bg-blue-500/10"
        : "border-white/10 hover:border-white/20"
    }`;
  }
  return `flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
    selected
      ? "border-primary bg-primary/5"
      : "border-border hover:border-primary/40"
  }`;
}

function dotClass(variant: Variant, selected: boolean) {
  if (variant === "live") {
    return `flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
      selected ? "border-blue-500 bg-blue-500" : "border-neutral-600"
    }`;
  }
  return `flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
    selected ? "border-primary bg-primary" : "border-muted-foreground/30"
  }`;
}

function checkboxClass(variant: Variant, selected: boolean) {
  if (variant === "live") {
    return `flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
      selected ? "border-blue-500 bg-blue-500" : "border-neutral-600"
    }`;
  }
  return `flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
    selected ? "border-primary bg-primary" : "border-muted-foreground/30"
  }`;
}

function textClass(variant: Variant) {
  return variant === "live" ? "text-sm text-neutral-200" : "text-sm text-foreground";
}

function mutedClass(variant: Variant) {
  return variant === "live" ? "text-xs text-neutral-500" : "text-xs text-muted-foreground";
}

function buttonClass(variant: Variant, selected: boolean) {
  if (variant === "live") {
    return `flex-1 rounded-lg border py-3 text-sm font-medium transition-colors justify-center ${
      selected
        ? "border-blue-500 bg-blue-500 text-white"
        : "border-white/10 hover:border-white/20 text-neutral-300"
    }`;
  }
  return `flex-1 rounded-lg border py-3 text-sm font-medium transition-colors justify-center ${
    selected
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border hover:border-primary/40"
  }`;
}

/* -- Renderers ----------------------------------------------- */

function ShortTextQuestion({ question, value, onChange, variant = "portal", readOnly }: RendererProps) {
  return (
    <Input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer..."
      className={inputClass(variant, readOnly)}
      readOnly={readOnly}
    />
  );
}

function LongTextQuestion({ question, value, onChange, variant = "portal", readOnly }: RendererProps) {
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type your answer..."
      rows={6}
      className={`${inputClass(variant, readOnly)} resize-none`}
      readOnly={readOnly}
    />
  );
}

function MCQQuestion({ question, value, onChange, variant = "portal", readOnly }: RendererProps) {
  const options = (question.options as string[]) ?? [];
  return (
    <div className="space-y-2">
      {options.map((opt, idx) => (
        <Label
          key={idx}
          className={optionClass(variant, value === opt)}
        >
          <div className={dotClass(variant, value === opt)}>
            {value === opt && <Check className="h-3 w-3 text-white" />}
          </div>
          <span className={textClass(variant)}>{opt}</span>
          <Input
            type="radio"
            name={`q-${question.id}`}
            value={opt}
            checked={value === opt}
            onChange={() => !readOnly && onChange(opt)}
            className="sr-only"
            disabled={readOnly}
          />
        </Label>
      ))}
    </div>
  );
}

function MultiSelectQuestion({ question, value, onChange, variant = "portal", readOnly }: RendererProps) {
  const options = (question.options as string[]) ?? [];
  const selected = value ? value.split("|||") : [];

  const toggle = (opt: string) => {
    if (readOnly) return;
    const newSelected = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(newSelected.join("|||"));
  };

  return (
    <div className="space-y-2">
      <p className={`${mutedClass(variant)} mb-2`}>Select all that apply</p>
      {options.map((opt, idx) => (
        <Label
          key={idx}
          className={optionClass(variant, selected.includes(opt))}
        >
          <div className={checkboxClass(variant, selected.includes(opt))}>
            {selected.includes(opt) && <Check className="h-3 w-3 text-white" />}
          </div>
          <span className={textClass(variant)}>{opt}</span>
          <Input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            className="sr-only"
            disabled={readOnly}
          />
        </Label>
      ))}
    </div>
  );
}

function ScaleQuestion({ question, value, onChange, variant = "portal", readOnly }: RendererProps) {
  const opts = question.options as { min?: number; max?: number; labels?: string[] } | null;
  const min = opts?.min ?? 1;
  const max = opts?.max ?? 5;
  const labels = opts?.labels ?? [];
  const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-2">
        {range.map((n) => (
          <Button
            key={n}
            type="button"
            variant="unstyled"
            onClick={() => !readOnly && onChange(String(n))}
            disabled={readOnly}
            className={buttonClass(variant, value === String(n))}
          >
            {n}
          </Button>
        ))}
      </div>
      {labels.length >= 2 && (
        <div className={`flex justify-between ${mutedClass(variant)}`}>
          <span>{labels[0]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

function BooleanQuestion({ question, value, onChange, variant = "portal", readOnly }: RendererProps) {
  return (
    <div className="flex gap-3">
      {["Yes", "No"].map((opt) => (
        <Button
          key={opt}
          type="button"
          variant="unstyled"
          onClick={() => !readOnly && onChange(opt)}
          disabled={readOnly}
          className={buttonClass(variant, value === opt)}
        >
          {opt}
        </Button>
      ))}
    </div>
  );
}

function CodingSnippetQuestion({ question, value, onChange, variant = "portal", readOnly }: RendererProps) {
  return (
    <div className="min-h-[250px] h-[300px]">
      <CodeEditor
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        variant={variant}
        placeholder="// Write your code here..."
      />
    </div>
  );
}

/* -- Dispatcher ---------------------------------------------- */

export function renderQuestion(
  question: Question,
  value: string,
  onChange: (v: string) => void,
  variant: Variant = "portal",
  readOnly = false,
) {
  const props = { question, value, onChange, variant, readOnly };
  switch (question.type) {
    case "SHORT_TEXT":
      return <ShortTextQuestion {...props} />;
    case "LONG_TEXT":
      return <LongTextQuestion {...props} />;
    case "MCQ":
      return <MCQQuestion {...props} />;
    case "MULTI_SELECT":
      return <MultiSelectQuestion {...props} />;
    case "SCALE":
      return <ScaleQuestion {...props} />;
    case "BOOLEAN":
      return <BooleanQuestion {...props} />;
    case "CODING_SNIPPET":
      return <CodingSnippetQuestion {...props} />;
    default:
      return <LongTextQuestion {...props} />;
  }
}
