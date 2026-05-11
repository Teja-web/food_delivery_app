import { notFound } from "next/navigation";
import { fetchOfferDetail } from "@/actions/offers";
import { serializeOfferDetail } from "./serialize";
import OfferDetailClient from "./OfferDetailClient";

export default async function OfferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offer = await fetchOfferDetail(id);
  if (!offer) notFound();

  const data = serializeOfferDetail(offer as any);

  return <OfferDetailClient offer={data} />;
}
