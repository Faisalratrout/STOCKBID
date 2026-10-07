'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch, apiFetchPage, ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { AuctionView, BidView, ListingDetail } from '@/types/listing';

const formatPrice = (value: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

const formatRelativeTime = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const pad = (n: number) => String(n).padStart(2, '0');

// Ticks a plain setInterval countdown to endAt — same idea as a FSO timer exercise, just
// deriving hours/minutes/seconds from a target Date instead of counting up from zero.
const useCountdown = (endAt: string | undefined) => {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    if (!endAt) return;
    const target = new Date(endAt).getTime();
    const tick = () => setRemainingMs(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endAt]);

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { label: `${pad(hours)} : ${pad(minutes)} : ${pad(seconds)}`, isOver: remainingMs <= 0 };
};

type Tab = 'bids' | 'product' | 'seller';

const AuctionPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('bids');
  const [bidAmount, setBidAmount] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Polling instead of the socket events the backend emits (emitNewBid/emitOutbid) — real-time
  // push via Socket.IO is a new concept with no FSO equivalent, so it's deferred rather than
  // built silently. This keeps the bid box and history reasonably fresh in the meantime.
  const {
    data: auction,
    isLoading,
    isError,
    refetch: refetchAuction,
  } = useQuery({
    queryKey: ['auction', id],
    queryFn: () => apiFetch<AuctionView>(`/auctions/${id}`),
    refetchInterval: 5000,
  });

  const { data: bids, refetch: refetchBids } = useQuery({
    queryKey: ['auction-bids', id],
    queryFn: () => apiFetchPage<BidView[]>(`/auctions/${id}/bids`),
    refetchInterval: 5000,
  });

  const { data: listing } = useQuery({
    queryKey: ['listing', auction?.listing.id],
    queryFn: () => apiFetch<ListingDetail>(`/listings/${auction?.listing.id}`, { auth: false }),
    enabled: Boolean(auction?.listing.id),
  });

  const { label: countdown } = useCountdown(auction?.endAt);

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-neutral-600">Loading…</div>;
  }
  if (isError || !auction) {
    return <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-red-600">Auction not found.</div>;
  }

  const minimumBid = auction.currentBid
    ? Number(auction.currentBid) + Number(auction.minIncrement)
    : Number(auction.startingBid);

  const canBid = auction.status === 'ACTIVE' && user?.role === 'BUYER';

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setFieldError('');
    setFormError('');
    setIsSubmitting(true);

    try {
      await apiFetch(`/auctions/${id}/bids`, { method: 'POST', body: { amount: Number(bidAmount) } });
      setBidAmount('');
      refetchAuction();
      refetchBids();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'VALIDATION_ERROR') {
        const details = err.details as { path: string; message: string }[] | undefined;
        setFieldError(details?.find((d) => d.path === 'amount')?.message ?? '');
      } else if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="grid gap-10 lg:grid-cols-2">
        <div className="aspect-square overflow-hidden rounded-md bg-neutral-100">
          {auction.listing.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={auction.listing.images[0].url}
              alt={auction.listing.title}
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{auction.listing.title}</h1>
          <p className="mt-1 text-sm text-neutral-500">{auction.listing.quantityTotal} units</p>

          <div className="mt-4 flex justify-between text-sm">
            <div>
              <p className="text-neutral-500">Current Bid</p>
              <p className="text-xl font-semibold text-neutral-900">
                {formatPrice(auction.currentBid ?? auction.startingBid)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-neutral-500">Starting Bid</p>
              <p className="text-xl font-semibold text-neutral-900">{formatPrice(auction.startingBid)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-md bg-neutral-900 px-4 py-3 text-center text-2xl font-semibold tracking-widest text-white">
            {countdown}
          </div>

          <div className="mt-6">
            {auction.status !== 'ACTIVE' ? (
              <p className="text-sm text-neutral-500">
                {auction.status === 'ENDED'
                  ? 'This auction has ended.'
                  : auction.status === 'CANCELLED'
                    ? 'This auction was cancelled.'
                    : "This auction hasn't started yet."}
              </p>
            ) : !user ? (
              <Link href="/login">
                <Button type="button" className="w-full">
                  Log in to bid
                </Button>
              </Link>
            ) : !canBid ? (
              <p className="text-sm text-neutral-500">Only buyers can bid.</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input
                  label="Your Bid (USD)"
                  type="number"
                  step="0.01"
                  min={minimumBid}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  error={fieldError}
                  required
                />
                <p className="text-xs text-neutral-500">Minimum bid: {formatPrice(String(minimumBid))}</p>
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                <Button type="submit" isLoading={isSubmitting} className="w-full">
                  Place Bid
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex gap-6 border-b border-neutral-200">
          {(['bids', 'product', 'seller'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-1 py-2 text-sm font-medium ${
                activeTab === tab ? 'border-black text-neutral-900' : 'border-transparent text-neutral-500'
              }`}
            >
              {tab === 'bids' ? 'Bid History' : tab === 'product' ? 'Product Details' : 'Seller Info'}
            </button>
          ))}
        </div>

        <div className="mt-4 text-sm text-neutral-700">
          {activeTab === 'bids' && (
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs text-neutral-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Bidder</th>
                  <th className="pb-2">Bid</th>
                  <th className="pb-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {bids?.data.map((bid, index) => (
                  <tr key={bid.id} className="border-t border-neutral-100">
                    <td className="py-2">{index + 1}</td>
                    <td className="py-2">
                      {bid.bidder.companyName ?? bid.bidder.label}
                      {bid.isMine && <span className="ml-2 text-xs text-neutral-500">(you)</span>}
                    </td>
                    <td className="py-2">{formatPrice(bid.amount)}</td>
                    <td className="py-2 text-neutral-500">{formatRelativeTime(bid.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activeTab === 'bids' && bids?.data.length === 0 && (
            <p className="py-4 text-neutral-500">No bids yet.</p>
          )}

          {activeTab === 'product' && (
            <p className="whitespace-pre-line">{listing?.description ?? 'Loading…'}</p>
          )}

          {activeTab === 'seller' && (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-neutral-900">
                  {listing?.seller.businessProfile?.companyName ?? 'Loading…'}
                  {listing?.seller.businessProfile?.isVerified && (
                    <span className="ml-2 text-xs text-green-700">Verified Business</span>
                  )}
                </p>
                <p className="text-neutral-500">{listing?.seller.businessProfile?.location}</p>
              </div>
              {listing && (
                <Link href={`/sellers/${listing.seller.id}`}>
                  <Button type="button" variant="secondary">
                    View Profile
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuctionPage;
