import { listCandidates, listCandidateActivePipelines } from "@/actions/candidates";
import { serializeCandidatesList } from "./serialize";
import CandidatesClient from "./CandidatesList";

export default async function CandidatesPage() {
  const [{ items: candidateRows, total }, pipelineMap] = await Promise.all([
    listCandidates({ limit: 25 }),
    listCandidateActivePipelines(),
  ]);

  const props = serializeCandidatesList(candidateRows, pipelineMap, total);

  return (
    <CandidatesClient
      candidates={props.candidates}
      total={props.total}
      counts={props.counts}
    />
  );
}
