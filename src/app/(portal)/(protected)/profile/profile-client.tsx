"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Heart,
  Loader2 as Loader,
  MapPin,
  Pencil,
  Shield,
  Sparkles,
  Star,
  Target,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { editPortalProfile, uploadPortalResume, deactivatePortalProfile, reactivatePortalProfile } from "@/actions/portal";
import { EntityActivity } from "@/components/shared/entity-activity";
import { useEntityEvent } from "@/hooks/use-entity-event";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/* -- Types --------------------------------------------------- */

interface ProfileData {
  candidateId: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  company: string;
  location: string;
  yearsExperience: number;
  resumeUploaded: boolean;
  resumeUrl: string | null;
  completeness: number;
  skills: string[];
  summary: string;
  languages: string[];
  certifications: string[];
  about: string | null;
  topStrengths: string[];
  growthAreas: string[];
  status: string;
}

/* -- Chip Input --------------------------------------------- */

function ChipInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      if (!values.includes(input.trim())) {
        onChange([...values, input.trim()]);
      }
      setInput("");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground"
          >
            {v}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onChange(values.filter((x) => x !== v))}
              className="ml-0.5 text-muted-foreground hover:text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </Button>
          </span>
        ))}
      </div>
      <Input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
      />
    </div>
  );
}

/* -- Component ----------------------------------------------- */

type UploadStatus = "idle" | "uploading" | "extracting" | "success" | "error";

export function ProfileClient({ profile }: { profile: ProfileData }) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>(profile.resumeUploaded ? "success" : "idle");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploading = uploadStatus === "uploading" || uploadStatus === "extracting";
  const [isPending, startTransition] = useTransition();

  // Edit states
  const [editingHeader, setEditingHeader] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editPhone, setEditPhone] = useState(profile.phone);
  const [editLocation, setEditLocation] = useState(profile.location);

  const [editingSkills, setEditingSkills] = useState(false);
  const [editSkills, setEditSkills] = useState(profile.skills);

  const [editingPrefs, setEditingPrefs] = useState(false);
  const [editAbout, setEditAbout] = useState(profile.about ?? "");

  const router = useRouter();

  // Auto-refresh when candidate profile is updated by background AI processing
  useEntityEvent("candidate", profile.candidateId);

  const MAX_RESUME_SIZE = 2 * 1024 * 1024; // 2 MB

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFileName(file.name);
    setUploadError(null);
    if (file.size > MAX_RESUME_SIZE) {
      setUploadStatus("error");
      setUploadError("File too large — max 2 MB. Try a smaller file or a different format.");
      return;
    }
    setUploadStatus("uploading");
    try {
      const formData = new FormData();
      formData.append("resume", file);
      await uploadPortalResume(formData);
      setUploadStatus("success");
      await router.refresh();
    } catch (err) {
      setUploadStatus("error");
      setUploadError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    }
  };

  const [headerError, setHeaderError] = useState<string | null>(null);

  const saveHeader = () => {
    setHeaderError(null);
    startTransition(async () => {
      try {
        await editPortalProfile({
          name: editName,
          phone: editPhone || null,
          location: editLocation || null,
        });
        setEditingHeader(false);
      } catch {
        setHeaderError("Failed to save. Please try again.");
      }
    });
  };

  const saveSkills = () => {
    startTransition(async () => {
      await editPortalProfile({ tags: editSkills });
      setEditingSkills(false);
    });
  };

  const savePreferences = () => {
    startTransition(async () => {
      await editPortalProfile({ about: editAbout });
      setEditingPrefs(false);
    });
  };

  const initials = profile.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const hasAbout = Boolean(profile.about?.trim());

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="space-y-8">
          {/* -- Header ----------------------------------------- */}
          <div className="flex items-start justify-between gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "80ms", animationFillMode: "both" }}>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-primary-foreground">
                {initials}
              </div>
              {editingHeader ? (
                <div className="space-y-2">
                  <Input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="block rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground focus:border-ring focus:outline-none"
                    placeholder="Full name"
                  />
                  <Input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="block rounded-lg border border-border px-3 py-1 text-xs text-foreground focus:border-ring focus:outline-none"
                    placeholder="Phone"
                  />
                  <Input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="block rounded-lg border border-border px-3 py-1 text-xs text-foreground focus:border-ring focus:outline-none"
                    placeholder="Location"
                  />
                  {headerError && (
                    <p className="text-xs text-destructive">{headerError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={saveHeader} disabled={isPending} variant="default" className="rounded-lg px-3 py-1 text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                      {isPending ? "Saving..." : "Save"}
                    </Button>
                    <Button onClick={() => { setEditingHeader(false); setHeaderError(null); }} variant="soft" className="rounded-lg px-3 py-1 text-xs">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
                      {profile.name}
                    </h1>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                      profile.status === "active"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : profile.status === "inactive"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : profile.status === "hired"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-secondary text-muted-foreground border border-border"
                    }`}>
                      {profile.status}
                    </span>
                  </div>
                  {(profile.title || profile.company) && (
                    <p className="text-sm text-muted-foreground">
                      {profile.title}{profile.title && profile.company ? " at " : ""}{profile.company}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {profile.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {profile.location}
                      </span>
                    )}
                    {profile.yearsExperience > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {profile.yearsExperience} years exp
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {!editingHeader && (
              <Button onClick={() => setEditingHeader(true)} variant="soft" size="icon-sm" className="rounded-lg">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {/* -- Profile completeness --------------------------- */}
          <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "120ms", animationFillMode: "both" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Profile strength</span>
              </div>
              <span className="text-metric text-lg text-foreground">{profile.completeness}%</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="bar-animate h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${profile.completeness}%` }} />
            </div>
            {profile.completeness < 100 && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/60 px-3 py-2.5">
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[7px]">&#10022;</div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Complete your profile to help your coach surface roles you&apos;ll actually want — not just roles you&apos;re qualified for.
                </p>
              </div>
            )}
          </div>

          {/* -- Resume ----------------------------------------- */}
          <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "160ms", animationFillMode: "both" }}>
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Resume</h2>
            </div>
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-lg bg-amber-50/60 px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50">
                    <Loader className="h-5 w-5 animate-spin text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {uploadFileName ?? "Resume"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {uploadStatus === "uploading"
                        ? "Reading your resume..."
                        : "Analyzing your profile..."}
                    </p>
                  </div>
                </div>
                <EntityActivity entries={[]} entityId={profile.candidateId} />
              </div>
            )}
            {uploadStatus === "error" && (
              <div className="mb-3 flex items-center gap-3 rounded-lg bg-red-50 px-4 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
                  <X className="h-5 w-5 text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {uploadFileName ?? "Resume"}
                  </p>
                  <p className="text-[11px] text-red-600">{uploadError}</p>
                </div>
                <Label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary">
                  Try again
                  <Input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeUpload} />
                </Label>
              </div>
            )}
            {!uploading && uploadStatus !== "error" && profile.resumeUploaded ? (
              <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {uploadStatus === "success" && uploadFileName ? uploadFileName : "Resume uploaded"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {uploadStatus === "success" ? "Successfully processed" : "Your skills and experience have been extracted"}
                    </p>
                  </div>
                </div>
                <Label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary">
                  <Upload className="h-3 w-3" />
                  Replace
                  <Input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeUpload} disabled={uploading} />
                </Label>
              </div>
            ) : !uploading && uploadStatus !== "error" ? (
              <Label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border py-8 transition-colors hover:border-border hover:bg-secondary/50">
                <Upload className="h-6 w-6 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Drop your resume here or click to upload</p>
                <p className="text-[11px] text-muted-foreground/60">PDF, DOCX, DOC — max 2 MB</p>
                <span className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Upload resume</span>
                <Input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeUpload} />
              </Label>
            ) : null}
            {profile.summary && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-emerald-100 bg-emerald-50/30 p-3">
                <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[7px]">&#10022;</div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From your resume</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{profile.summary}</p>
                </div>
              </div>
            )}
          </div>

          {/* -- Strengths & Growth --------------------------- */}
          {(profile.topStrengths.length > 0 || profile.growthAreas.length > 0) && (
            <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "180ms", animationFillMode: "both" }}>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Coach insights</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {profile.topStrengths.length > 0 && (
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <Star className="h-3.5 w-3.5" />
                      Top strengths
                    </p>
                    <div className="space-y-1.5">
                      {profile.topStrengths.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400" />
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {profile.growthAreas.length > 0 && (
                  <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                      <Target className="h-3.5 w-3.5" />
                      Growth areas
                    </p>
                    <div className="space-y-1.5">
                      {profile.growthAreas.map((g, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                          {g}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* -- Skills ----------------------------------------- */}
          <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "200ms", animationFillMode: "both" }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Skills</h2>
              </div>
              {!editingSkills && (
                <Button onClick={() => { setEditSkills(profile.skills); setEditingSkills(true); }} variant="soft" size="icon-sm" className="rounded-lg">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {editingSkills ? (
              <div>
                <ChipInput values={editSkills} onChange={setEditSkills} placeholder="Add a skill and press Enter" />
                <div className="mt-3 flex gap-2">
                  <Button onClick={saveSkills} disabled={isPending} variant="default" className="rounded-lg px-3 py-1 text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                    {isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button onClick={() => setEditingSkills(false)} variant="soft" className="rounded-lg px-3 py-1 text-xs">Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                {profile.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((skill) => (
                      <span key={skill} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No skills added yet. Click edit to add your skills.</p>
                )}
                {(profile.languages.length > 0 || profile.certifications.length > 0) && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {profile.languages.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Languages</p>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.languages.map((lang) => (
                            <span key={lang} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{lang}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {profile.certifications.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Certifications</p>
                        <div className="flex flex-wrap gap-1.5">
                          {profile.certifications.map((cert) => (
                            <span key={cert} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">{cert}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* -- Career Preferences ----------------------------- */}
          <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "240ms", animationFillMode: "both" }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">About</h2>
              </div>
              {!editingPrefs && (
                <Button onClick={() => setEditingPrefs(true)} variant="soft" size="icon-sm" className="rounded-lg">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            {editingPrefs ? (
              <div className="space-y-3">
                <Textarea
                  value={editAbout}
                  onChange={(e) => setEditAbout(e.target.value)}
                  rows={5}
                  placeholder={"For example:\n• Target roles: Staff Engineer, Engineering Manager\n• Industries: fintech, healthtech\n• Work style: remote, hybrid, or onsite\n• Salary expectations\n• Values: work-life balance, impact, mentorship\n• Dealbreakers: no equity, mandatory RTO\n• Anything else that matters to you"}
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none"
                />
                <div className="flex gap-2">
                  <Button onClick={savePreferences} disabled={isPending} variant="default" size="auto" className="rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50">
                    {isPending ? "Saving..." : "Save"}
                  </Button>
                  <Button onClick={() => { setEditingPrefs(false); setEditAbout(profile.about ?? ""); }} variant="soft" size="auto" className="rounded-lg px-3 py-1.5 text-xs">Cancel</Button>
                </div>
              </div>
            ) : hasAbout ? (
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{profile.about}</p>
            ) : (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50/60 px-3 py-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Tell your coach about yourself — what you&apos;re looking for, target roles,
                  industries, work style, salary expectations, values, or anything else.
                </p>
              </div>
            )}
          </div>

          {/* -- Profile visibility ----------------------------- */}
          <div className="rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "280ms", animationFillMode: "both" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Profile visibility</h2>
              </div>
            </div>
            {profile.status === "active" ? (
              <div className="mt-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your profile is visible to recruiters and included in job matching. Deactivating hides you from all searches and matching.
                </p>
                <Button
                  variant="unstyled"
                  onClick={async () => {
                    if (!confirm("Deactivate your profile? You will be hidden from all recruiter searches and job matching. You can reactivate anytime.")) return;
                    startTransition(async () => {
                      await deactivatePortalProfile();
                      router.refresh();
                    });
                  }}
                  disabled={isPending}
                  className="mt-3 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {isPending ? "Updating..." : "Deactivate profile"}
                </Button>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Your profile is deactivated. Recruiters cannot see you and you won&apos;t be matched to new roles.
                </p>
                <Button
                  onClick={async () => {
                    startTransition(async () => {
                      await reactivatePortalProfile();
                      router.refresh();
                    });
                  }}
                  disabled={isPending}
                  variant="default"
                  className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {isPending ? "Updating..." : "Reactivate profile"}
                </Button>
              </div>
            )}
          </div>

          {/* -- Coach note ------------------------------------- */}
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-card/50 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: "300ms", animationFillMode: "both" }}>
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[10px]">&#10022;</div>
            <div>
              <p className="text-sm font-semibold text-foreground">Your profile powers everything</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                The more I know about what you want — not just what you can do —
                the better I can match you to roles, coach your interviews, and
                spot patterns in your growth. Think of this page as telling your
                coach who you really are.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
