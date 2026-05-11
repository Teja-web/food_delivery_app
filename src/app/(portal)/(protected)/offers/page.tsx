import { FileText } from "lucide-react";
import { fetchPortalOffersDetail } from "@/actions/portal";
import { EmptyState } from "@/components/empty-state";
import { EyebrowHeading } from "@/components/portal/eyebrow-heading";
import { OffersClient } from "./OffersClient";

export default async function OffersPage() {
  const offers = await fetchPortalOffersDetail();

  const open = offers.filter(
    (o) =>
      o.status === "extended" ||
      o.status === "sent" ||
      o.status === "countered" ||
      o.status === "draft",
  );

  if (open.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EyebrowHeading accent="amber">Offers</EyebrowHeading>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">
          Your offers
        </h1>
        <div className="mt-8">
          <EmptyState
            icon={FileText}
            headline="No open offers"
            description="When an employer extends an offer, you'll see it here with a side-by-side comparison if you have more than one open."
            cta={{ label: "Browse roles", href: "/roles" }}
          />
        </div>
      </div>
    );
  }

  return <OffersClient offers={open} closed={offers.filter((o) => !open.includes(o))} />;
}
