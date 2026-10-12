'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { apiFetchPage } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import type { OfferStatus, OfferView } from '@/types/offer';

const formatPrice = (value: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

const STATUS_CLASSES: Record<OfferStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  COUNTERED: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-neutral-100 text-neutral-600',
};

const OffersPage = () => {
  const { user } = useAuth();
  const isSeller = user?.role === 'SELLER';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['offers', isSeller ? 'received' : 'mine'],
    queryFn: () => apiFetchPage<OfferView[]>(isSeller ? '/offers/received' : '/offers/mine'),
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-neutral-600">
          <Link href="/login" className="font-medium text-black underline">
            Log in
          </Link>{' '}
          to see your offers.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-bold text-neutral-900">{isSeller ? 'Offers Received' : 'My Offers'}</h1>

      {isLoading && <p className="mt-6 text-sm text-neutral-600">Loading…</p>}
      {isError && <p className="mt-6 text-sm text-red-600">Something went wrong loading offers.</p>}
      {!isLoading && !isError && data?.data.length === 0 && (
        <p className="mt-6 text-sm text-neutral-600">
          {isSeller ? 'No offers received yet.' : "You haven't made any offers yet."}
        </p>
      )}

      <div className="mt-6 divide-y divide-neutral-100">
        {data?.data.map((offer) => (
          <Link
            key={offer.id}
            href={`/offers/${offer.id}`}
            className="flex items-center justify-between gap-4 py-4 hover:bg-neutral-50"
          >
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-neutral-100">
                {offer.listing.images[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={offer.listing.images[0].url}
                    alt={offer.listing.title}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-900">{offer.listing.title}</p>
                <p className="text-xs text-neutral-500">
                  {offer.quantity} units at {formatPrice(offer.price)} / unit
                </p>
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASSES[offer.status]}`}>
              {offer.status}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default OffersPage;
