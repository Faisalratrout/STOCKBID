import Link from 'next/link';
import type { ListingCard as ListingCardData } from '@/types/listing';

const CONDITION_LABELS: Record<ListingCardData['condition'], string> = {
  NEW: 'New',
  USED: 'Used',
};

const formatPrice = (value: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

export const ListingCard = ({ listing }: { listing: ListingCardData }) => {
  const isAuction = listing.sellingMethod === 'AUCTION';
  const price = isAuction ? listing.auction?.currentBid ?? listing.startingPrice : listing.startingPrice;

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="block overflow-hidden rounded-md border border-neutral-200 transition-colors hover:border-neutral-400"
    >
      <div className="aspect-square bg-neutral-100">
        {listing.images[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={listing.images[0].url} alt={listing.title} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="space-y-2 p-3">
        <h3 className="text-sm font-medium text-neutral-900">{listing.title}</h3>
        <p className="text-xs text-neutral-500">
          {listing.quantityAvailable} units &bull; {CONDITION_LABELS[listing.condition]}
        </p>
        <p className="text-sm font-semibold text-neutral-900">{formatPrice(price)}</p>

        <span className="block w-full rounded-md bg-black px-3 py-2 text-center text-xs font-medium text-white">
          {isAuction ? 'Place Bid' : 'Make an Offer'}
        </span>

        <p className="text-xs text-neutral-500">{listing.location}</p>
      </div>
    </Link>
  );
};
