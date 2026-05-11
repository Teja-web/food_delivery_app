import { listUpcomingInterviews, listPastInterviews } from "@/actions/interviews";
import InterviewsClient from "./InterviewsList";
import { serializeListInterview } from "./serialize";

const PAGE_SIZE = 25;

export default async function InterviewsPage() {
  const [upcomingResult, pastResult] = await Promise.all([
    listUpcomingInterviews({ offset: 0, limit: PAGE_SIZE }),
    listPastInterviews({ offset: 0, limit: PAGE_SIZE }),
  ]);

  return (
    <InterviewsClient
      upcoming={upcomingResult.items.map((iv: any) => serializeListInterview(iv))}
      upcomingTotal={upcomingResult.total}
      past={pastResult.items.map((iv: any) => serializeListInterview(iv))}
      pastTotal={pastResult.total}
    />
  );
}
