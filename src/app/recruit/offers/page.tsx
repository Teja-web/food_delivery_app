import { listInProgressOffers, listClosedWonOffers, listClosedLostOffers } from "@/actions/offers";
import OffersClient from "./OffersList";
import { serializeListOffer } from "./serialize";

const PAGE_SIZE = 25;

export default async function OffersPage() {
  const [inProgressResult, closedWonResult, closedLostResult] = await Promise.all([
    listInProgressOffers({ offset: 0, limit: PAGE_SIZE }),
    listClosedWonOffers({ offset: 0, limit: PAGE_SIZE }),
    listClosedLostOffers({ offset: 0, limit: PAGE_SIZE }),
  ]);

  return (
    <OffersClient
      inProgress={inProgressResult.items.map((o: any) => serializeListOffer(o))}
      inProgressTotal={inProgressResult.total}
      closedWon={closedWonResult.items.map((o: any) => serializeListOffer(o))}
      closedWonTotal={closedWonResult.total}
      closedLost={closedLostResult.items.map((o: any) => serializeListOffer(o))}
      closedLostTotal={closedLostResult.total}
    />
  );
}
