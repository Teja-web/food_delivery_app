"use client";

import { useState, useTransition } from "react";
import { Check, GraduationCap, Plus, Save, X } from "lucide-react";
import { updateStudentProfile } from "@/actions/portal";
import {
  DEGREE_TYPES,
  type DegreeType,
  type StudentProfile,
} from "@/domain/portal/student-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  initial: Partial<StudentProfile>;
}

export function StudentProfileSection({ initial }: Props) {
  const [institution, setInstitution] = useState(initial.institution ?? "");
  const [country, setCountry] = useState(initial.institutionCountry ?? "");
  const [degree, setDegree] = useState<DegreeType | "">(
    (initial.degree as DegreeType) ?? "",
  );
  const [major, setMajor] = useState(initial.major ?? "");
  const [graduation, setGraduation] = useState(initial.expectedGraduation ?? "");
  const [gpaValue, setGpaValue] = useState(initial.gpa?.value?.toString() ?? "");
  const [gpaScale, setGpaScale] = useState(initial.gpa?.scale?.toString() ?? "4.0");
  const [coursework, setCoursework] = useState<string[]>(initial.coursework ?? []);
  const [projects, setProjects] = useState(initial.projects ?? []);
  const [internships, setInternships] = useState(initial.internships ?? []);
  const [targetFunctions, setTargetFunctions] = useState<string[]>(
    initial.targetFunctions ?? [],
  );
  const [targetLocations, setTargetLocations] = useState<string[]>(
    initial.targetLocations ?? [],
  );

  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    const gpa =
      gpaValue && gpaScale
        ? { value: Number(gpaValue), scale: Number(gpaScale) }
        : undefined;

    startTransition(async () => {
      try {
        await updateStudentProfile({
          institution: institution || undefined,
          institutionCountry: country || undefined,
          degree: degree || undefined,
          major: major || undefined,
          expectedGraduation: graduation || undefined,
          gpa,
          coursework,
          projects,
          internships,
          targetFunctions,
          targetLocations,
        });
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-amber-600" />
        <h2 className="font-display text-base font-semibold text-foreground">
          Student profile
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Institution" required>
          <Input
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="MIT"
          />
        </Field>
        <Field label="Country" hint="ISO-2 (US, IN, GB, …)" required>
          <Input
            value={country}
            onChange={(e) => setCountry(e.target.value.slice(0, 2).toUpperCase())}
            placeholder="US"
            maxLength={2}
          />
        </Field>
        <Field label="Degree" required>
          <select
            value={degree}
            onChange={(e) => setDegree(e.target.value as DegreeType)}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus:border-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-200"
          >
            <option value="">— Select —</option>
            {DEGREE_TYPES.map((d) => (
              <option key={d} value={d}>
                {humanize(d)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Major" required>
          <Input
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder="Computer Science"
          />
        </Field>
        <Field label="Expected graduation" hint="YYYY-MM" required>
          <Input
            value={graduation}
            onChange={(e) => setGraduation(e.target.value)}
            placeholder="2027-05"
            pattern="\d{4}-(0[1-9]|1[0-2])"
          />
        </Field>
        <Field label="GPA" hint="optional · value / scale">
          <div className="flex items-center gap-1">
            <Input
              value={gpaValue}
              onChange={(e) => setGpaValue(e.target.value)}
              placeholder="3.7"
              type="number"
              step="0.01"
            />
            <span className="text-xs text-muted-foreground">/</span>
            <Input
              value={gpaScale}
              onChange={(e) => setGpaScale(e.target.value)}
              placeholder="4.0"
              type="number"
              step="0.1"
            />
          </div>
        </Field>
      </div>

      <div className="mt-5 space-y-5">
        <ChipListField
          label="Coursework"
          values={coursework}
          onChange={setCoursework}
          placeholder="CS340 Distributed Systems"
        />
        <ProjectsField projects={projects} onChange={setProjects} />
        <InternshipsField internships={internships} onChange={setInternships} />
        <ChipListField
          label="Target functions"
          values={targetFunctions}
          onChange={setTargetFunctions}
          placeholder="Software Engineering"
        />
        <ChipListField
          label="Target locations"
          values={targetLocations}
          onChange={setTargetLocations}
          placeholder="SF Bay Area"
        />
      </div>

      {error && <p className="mt-3 text-xs text-rose-600">{error}</p>}

      <div className="mt-5 flex items-center justify-end gap-3">
        {savedAt && (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Saved
          </span>
        )}
        <Button onClick={save} disabled={pending} className="gap-1.5">
          <Save className="h-3.5 w-3.5" />
          {pending ? "Saving..." : "Save student profile"}
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-semibold text-foreground">
        {label}
        {required && <span className="text-rose-500">*</span>}
        {hint && <span className="ml-1 font-normal text-muted-foreground">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}

function ChipListField({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  function add() {
    const v = draft.trim();
    if (!v) return;
    if (values.includes(v)) return;
    onChange([...values, v]);
    setDraft("");
  }
  function remove(v: string) {
    onChange(values.filter((x) => x !== v));
  }
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-foreground">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px]"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              className="text-muted-foreground hover:text-rose-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <Button
          type="button"
          onClick={add}
          variant="ghost"
          size="icon-sm"
          aria-label={`Add ${label}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ProjectsField({
  projects,
  onChange,
}: {
  projects: StudentProfile["projects"];
  onChange: (next: StudentProfile["projects"]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    role: "",
    tech: "",
    url: "",
  });

  function add() {
    if (!draft.title.trim() || !draft.description.trim() || !draft.role.trim()) return;
    onChange([
      ...projects,
      {
        title: draft.title,
        description: draft.description,
        role: draft.role,
        tech: draft.tech.split(",").map((s) => s.trim()).filter(Boolean),
        url: draft.url || undefined,
      },
    ]);
    setDraft({ title: "", description: "", role: "", tech: "", url: "" });
    setShowForm(false);
  }
  function remove(i: number) {
    onChange(projects.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground">Projects</label>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline"
          >
            <Plus className="h-3 w-3" /> Add project
          </button>
        )}
      </div>
      <div className="space-y-2">
        {projects.map((p, i) => (
          <div key={i} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  {p.role}
                  {p.tech?.length ? ` · ${p.tech.join(", ")}` : ""}
                </p>
                <p className="mt-1 text-xs">{p.description}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-rose-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {showForm && (
        <div className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50/30 p-3">
          <Input
            placeholder="Title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Your role"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            />
            <Input
              placeholder="Tech (comma-separated)"
              value={draft.tech}
              onChange={(e) => setDraft({ ...draft, tech: e.target.value })}
            />
          </div>
          <Textarea
            rows={2}
            placeholder="One-line description"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
          <Input
            placeholder="URL (optional)"
            value={draft.url}
            onChange={(e) => setDraft({ ...draft, url: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-muted-foreground"
            >
              Cancel
            </button>
            <Button type="button" onClick={add} size="sm">
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function InternshipsField({
  internships,
  onChange,
}: {
  internships: StudentProfile["internships"];
  onChange: (next: StudentProfile["internships"]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ org: "", role: "", period: "", summary: "" });

  function add() {
    if (!draft.org.trim() || !draft.role.trim() || !draft.period.trim()) return;
    onChange([...internships, { ...draft, summary: draft.summary || undefined }]);
    setDraft({ org: "", role: "", period: "", summary: "" });
    setShowForm(false);
  }
  function remove(i: number) {
    onChange(internships.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-semibold text-foreground">Internships</label>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline"
          >
            <Plus className="h-3 w-3" /> Add internship
          </button>
        )}
      </div>
      <div className="space-y-2">
        {internships.map((i, idx) => (
          <div key={idx} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {i.role} · {i.org}
                </p>
                <p className="text-xs text-muted-foreground">{i.period}</p>
                {i.summary && <p className="mt-1 text-xs">{i.summary}</p>}
              </div>
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-muted-foreground hover:text-rose-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      {showForm && (
        <div className="mt-2 space-y-2 rounded-xl border border-amber-200 bg-amber-50/30 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Organization"
              value={draft.org}
              onChange={(e) => setDraft({ ...draft, org: e.target.value })}
            />
            <Input
              placeholder="Role"
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            />
          </div>
          <Input
            placeholder="Period (Jun 2024 – Aug 2024)"
            value={draft.period}
            onChange={(e) => setDraft({ ...draft, period: e.target.value })}
          />
          <Textarea
            rows={2}
            placeholder="What you did (optional)"
            value={draft.summary}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-xs text-muted-foreground"
            >
              Cancel
            </button>
            <Button type="button" onClick={add} size="sm">
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
