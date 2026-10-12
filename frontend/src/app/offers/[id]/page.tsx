'use client';

import { useState, type SubmitEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { OfferDetail, OfferStatus, OfferView } from '@/types/offer';

const formatPrice = (value: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value));

const STATUS_CLASSES: Record<OfferStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  COUNTERED: 'bg-blue-100 text-blue-800',
  ACCEPTED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  EXPIRED: 'bg-neutral-100 text-neutral-600',
};

// A pending offer is always waiting on exactly one party, same logic as
// backend/src/services/offer.service.ts:turnOwnerId/creatorId.
const turnOwnerId = (offer: OfferView) => (offer.createdBySellerCounter ? offer.buyerId : offer.listing.sellerId);
const creatorId = (offer: OfferView) => (offer.createdBySellerCounter ? offer.listing.sellerId : offer.buyerId);

const entryLabel = (entry: OfferView) => {
  if (entry.createdBySellerCounter) return 'Seller countered';
  return entry.parentOfferId ? 'Buyer countered' : 'Buyer offered';
};

const OfferEntry = ({ entry, isCurrent }: { entry: OfferView; isCurrent: boolean }) => (
  <div className={`rounded-md border p-3 ${isCurrent ? 'border-black' : 'border-neutral-200'}`}>
    <div className="flex items-center justify-between">
      <p className="text-sm font-medium text-neutral-900">{entryLabel(entry)}</p>
      <span className="text-xs text-neutral-500">{new Date(entry.createdAt).toLocaleString()}</span>
    </div>
    <p className="mt-1 text-sm text-neutral-700">
      {entry.quantity} units at {formatPrice(entry.price)} / unit ({formatPrice(String(Number(entry.price) * entry.quantity))} total)
    </p>
    {entry.message && <p className="mt-1 text-sm text-neutral-600">&ldquo;{entry.message}&rdquo;</p>}
  </div>
);

const OfferDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [isCountering, setIsCountering] = useState(false);
  const [counterQuantity, setCounterQuantity] = useState('');
  const [counterPrice, setCounterPrice] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: offer,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['offer', id],
    queryFn: () => apiFetch<OfferDetail>(`/offers/${id}`),
  });

  if (isLoading) return <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-neutral-600">Loading…</div>;
  if (isError || !offer) {
    return <div className="mx-auto max-w-2xl px-6 py-10 text-sm text-red-600">Offer not found.</div>;
  }

  const isPending = offer.status === 'PENDING';
  const isMyTurn = user?.id === turnOwnerId(offer);
  const amCreator = user?.id === creatorId(offer);
  const timeline = [...offer.history, offer];

  const handleAction = async (action: 'accept' | 'reject' | 'withdraw') => {
    setFormError('');
    setIsSubmitting(true);
    try {
      await apiFetch(`/offers/${id}/${action}`, { method: 'POST' });
      await refetch();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCounterSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setIsSubmitting(true);

    try {
      const newOffer = await apiFetch<OfferView>(`/offers/${id}/counter`, {
        method: 'POST',
        body: {
          quantity: Number(counterQuantity),
          price: Number(counterPrice),
          message: counterMessage || undefined,
        },
      });
      router.push(`/offers/${newOffer.id}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'VALIDATION_ERROR') {
        const details = err.details as { path: string; message: string }[] | undefined;
        const next: Record<string, string> = {};
        for (const issue of details ?? []) next[issue.path] = issue.message;
        setFieldErrors(next);
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
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="text-xs text-neutral-500">
        <Link href="/offers" className="hover:text-black">
          {user?.role === 'SELLER' ? 'Offers Received' : 'My Offers'}
        </Link>
      </p>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">
          <Link href={`/listings/${offer.listing.id}`} className="hover:underline">
            {offer.listing.title}
          </Link>
        </h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASSES[offer.status]}`}>
          {offer.status}
        </span>
      </div>

      <div className="mt-6 space-y-3">
        {timeline.map((entry) => (
          <OfferEntry key={entry.id} entry={entry} isCurrent={entry.id === offer.id} />
        ))}
      </div>

      {offer.status === 'ACCEPTED' && offer.order && (
        <p className="mt-4 text-sm text-green-700">An order was created from this offer.</p>
      )}
      {offer.status === 'COUNTERED' && (
        <p className="mt-4 text-sm text-neutral-500">
          This offer was countered. Check your offers list for the follow-up negotiation.
        </p>
      )}

      {isPending && (
        <div className="mt-6">
          {isMyTurn && !isCountering && (
            <div className="flex gap-3">
              <Button
                type="button"
                isLoading={isSubmitting}
                className="flex-1"
                onClick={() => handleAction('accept')}
              >
                Accept
              </Button>
              <Button
                type="button"
                variant="secondary"
                isLoading={isSubmitting}
                className="flex-1"
                onClick={() => handleAction('reject')}
              >
                Reject
              </Button>
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsCountering(true)}>
                Counter
              </Button>
            </div>
          )}

          {isMyTurn && isCountering && (
            <form onSubmit={handleCounterSubmit} className="space-y-4">
              <Input
                label={`Quantity (Max ${offer.listing.quantityAvailable})`}
                type="number"
                min={1}
                max={offer.listing.quantityAvailable}
                value={counterQuantity}
                onChange={(e) => setCounterQuantity(e.target.value)}
                error={fieldErrors.quantity}
                required
              />
              <Input
                label="Your Counter (USD per unit)"
                type="number"
                step="0.01"
                min={0.01}
                value={counterPrice}
                onChange={(e) => setCounterPrice(e.target.value)}
                error={fieldErrors.price}
                required
              />
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-800">Message (Optional)</label>
                <textarea
                  value={counterMessage}
                  onChange={(e) => setCounterMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="flex gap-3">
                <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsCountering(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={isSubmitting} className="flex-1">
                  Send Counter
                </Button>
              </div>
            </form>
          )}

          {amCreator && (
            <div>
              <p className="text-sm text-neutral-500">Waiting for a response.</p>
              <Button
                type="button"
                variant="secondary"
                isLoading={isSubmitting}
                className="mt-2"
                onClick={() => handleAction('withdraw')}
              >
                Withdraw Offer
              </Button>
            </div>
          )}

          {formError && !isCountering && <p className="mt-3 text-sm text-red-600">{formError}</p>}
        </div>
      )}
    </div>
  );
};

export default OfferDetailPage;
