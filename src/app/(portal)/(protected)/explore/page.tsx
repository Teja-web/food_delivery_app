import { Compass } from "lucide-react";
import { fetchCareerPaths } from "@/actions/portal";
import { EmptyState } from "@/components/empty-state";
import { EyebrowHeading } from "@/components/portal/eyebrow-heading";
import { ExplorePathsClient } from "./ExplorePathsClient";

export default async function ExplorePage() {
  const result = await fetchCareerPaths();

  if (!result || !result.paths.length) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EyebrowHeading accent="amber">Explore</EyebrowHeading>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
          Career paths
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Personalized paths based on your profile. Add some context first so
          the suggestions can be specific.
        </p>
        <div className="mt-8">
          <EmptyState
            icon={Compass}
            headline="Nothing to explore yet"
            description="Fill in your student profile — institution, projects, target functions — and we'll suggest concrete paths with growth actions."
            cta={{ label: "Complete your profile", href: "/profile" }}
          />
        </div>
      </div>
    );
  }

  return <ExplorePathsClient summary={result.summary} paths={result.paths} />;
}
