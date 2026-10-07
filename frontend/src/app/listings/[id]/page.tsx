'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/Button';
import { OfferModal } from '@/components/listings/OfferModal';
import type { ListingDetail } from '@/types/listing';

const CONDITION_LABELS: Record<ListingDetail['condition'], string> = {
  NEW: 'New',
  USED: 'Used',
};

const HANDOVER_LABELS: Record<ListingDetail['handoverMethod'], string> = {
  PICKUP: 'Pickup from seller',
  SELLER_DELIVERY: 'Seller delivers to buyer',
  BUYER_PICKUP: 'Buyer arranges pickup',
};

const formatPrice = (value: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

type Tab = 'description' | 'shipping' | 'seller';

const ListingDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('description');
  const [activeImage, setActiveImage] = useState(0);
  const [isOfferOpen, setIsOfferOpen] = useState(false);

  const {
    data: listing,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => apiFetch<ListingDetail>(`/listings/${id}`, { auth: false }),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-neutral-600">Loading…</div>;
  }
  if (isError || !listing) {
    return <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-red-600">Listing not found.</div>;
  }

  const isAuction = listing.sellingMethod === 'AUCTION';
  const canMakeOffer = !isAuction && user?.role === 'BUYER';

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-xs text-neutral-500">
        <Link href="/browse" className="hover:text-black">
          Browse Stock
        </Link>{' '}
        / {listing.category.name}
      </p>

      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
            {listing.images[activeImage] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.images[activeImage].url}
                alt={listing.title}
                className="h-full w-full object-cover"
              />
            )}
          </div>
          {listing.images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {listing.images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  className={`h-16 w-16 overflow-hidden rounded-md border-2 ${
                    index === activeImage ? 'border-black' : 'border-transparent'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            {listing.quantityAvailable} units available
          </span>
          <h1 className="mt-3 text-2xl font-bold text-neutral-900">{listing.title}</h1>

          <dl className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <dt className="text-neutral-500">Starting Price</dt>
              <dd className="font-medium text-neutral-900">{formatPrice(listing.startingPrice)}</dd>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <dt className="text-neutral-500">Condition</dt>
              <dd className="font-medium text-neutral-900">{CONDITION_LABELS[listing.condition]}</dd>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <dt className="text-neutral-500">Location</dt>
              <dd className="font-medium text-neutral-900">{listing.location}</dd>
            </div>
            <div className="flex justify-between border-b border-neutral-100 pb-2">
              <dt className="text-neutral-500">Quantity Available</dt>
              <dd className="font-medium text-neutral-900">{listing.quantityAvailable} units</dd>
            </div>
            <div className="flex justify-between pb-2">
              <dt className="text-neutral-500">Selling Method</dt>
              <dd className="font-medium text-neutral-900">{isAuction ? 'Auction' : 'Make an Offer'}</dd>
            </div>
          </dl>

          <div className="mt-6">
            {isAuction ? (
              <Link href={`/auctions/${listing.auction?.id}`}>
                <Button type="button" className="w-full">
                  View Auction
                </Button>
              </Link>
            ) : user ? (
              canMakeOffer ? (
                <Button type="button" className="w-full" onClick={() => setIsOfferOpen(true)}>
                  Make an Offer
                </Button>
              ) : (
                <p className="text-sm text-neutral-500">Only buyers can make offers.</p>
              )
            ) : (
              <Link href="/login">
                <Button type="button" className="w-full">
                  Log in to make an offer
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex gap-6 border-b border-neutral-200">
          {(['description', 'shipping', 'seller'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${
                activeTab === tab ? 'border-black text-neutral-900' : 'border-transparent text-neutral-500'
              }`}
            >
              {tab === 'description' ? 'Description' : tab === 'shipping' ? 'Shipping Info' : 'Seller Info'}
            </button>
          ))}
        </div>

        <div className="mt-4 text-sm text-neutral-700">
          {activeTab === 'description' && <p className="whitespace-pre-line">{listing.description}</p>}
          {activeTab === 'shipping' && (
            <p>
              {HANDOVER_LABELS[listing.handoverMethod]}, from {listing.location}.
            </p>
          )}
          {activeTab === 'seller' && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">
                  {listing.seller.businessProfile?.companyName ?? 'Unknown seller'}
                  {listing.seller.businessProfile?.isVerified && (
                    <span className="ml-2 text-xs text-green-700">Verified Business</span>
                  )}
                </p>
                <p className="text-neutral-500">{listing.seller.businessProfile?.location}</p>
              </div>
              <Link href={`/sellers/${listing.seller.id}`}>
                <Button type="button" variant="secondary">
                  View Profile
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {isOfferOpen && <OfferModal listing={listing} onClose={() => setIsOfferOpen(false)} />}
    </div>
  );
};

export default ListingDetailPage;
