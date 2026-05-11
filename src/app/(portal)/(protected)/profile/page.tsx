import { fetchPortalProfile, fetchPortalAdvisory } from "@/actions/portal";
import { profileCompleteness } from "@/domain/portal/profile";
import type { StudentProfile } from "@/domain/portal/student-profile";
import { ProfileClient } from "./profile-client";
import { KindToggle } from "./KindToggle";
import { StudentProfileSection } from "./StudentProfileSection";

export default async function ProfilePage() {
  const profile = await fetchPortalProfile();

  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-stone-500">No profile found. Please complete onboarding.</p>
      </div>
    );
  }

  const candidateProfile = (profile.candidate.profile ?? {}) as Record<string, unknown>;
  const skills = (profile.candidate.skills as string[] | null) ?? [];
  const completeness = profileCompleteness(profile.candidate);

  // Advisory profile insights from recommendations table
  const advisoryResult = await fetchPortalAdvisory();
  const advisoryData = (advisoryResult?.advisory ?? {}) as Record<string, unknown>;
  const insights = (advisoryData?.profileInsights ?? null) as {
    topStrengths: string[];
    growthAreas: string[];
  } | null;

  const profileData = {
    candidateId: profile.primaryCandidateId,
    name: profile.candidate.name ?? "",
    email: profile.candidate.email ?? "",
    title: profile.candidate.title ?? "",
    company: profile.candidate.company ?? "",
    phone: profile.candidate.phone ?? "",
    location: profile.candidate.location ?? "",
    yearsExperience: (candidateProfile.totalYearsExperience as number) ?? 0,
    resumeUploaded: Boolean(profile.candidate.resumeUrl || profile.candidate.resumeText),
    resumeUrl: profile.candidate.resumeUrl ?? null,
    completeness: completeness.percentage,
    skills,
    summary: (candidateProfile.summary as string) ?? "",
    languages: (candidateProfile.languages as string[]) ?? [],
    certifications: (candidateProfile.certifications as string[]) ?? [],
    about: profile.candidate.about ?? null,
    topStrengths: insights?.topStrengths ?? [],
    growthAreas: insights?.growthAreas ?? [],
    status: profile.candidate.status ?? "active",
  };

  const candidateKind = (profile.candidate.kind ?? "professional") as
    | "professional"
    | "student"
    | "early_career";
  const studentProfile = (candidateProfile.studentProfile ?? {}) as Partial<StudentProfile>;
  const isStudentish = candidateKind === "student" || candidateKind === "early_career";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <KindToggle initialKind={candidateKind} />
      {isStudentish && <StudentProfileSection initial={studentProfile} />}
      <ProfileClient profile={profileData} />
    </div>
  );
}
