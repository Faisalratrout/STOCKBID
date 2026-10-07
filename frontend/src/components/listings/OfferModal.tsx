'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { ListingDetail } from '@/types/listing';

interface OfferModalProps {
  listing: ListingDetail;
  onClose: () => void;
}

export const OfferModal = ({ listing, onClose }: OfferModalProps) => {
  const [quantity, setQuantity] = useState('1');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const quantityNum = Number(quantity) || 0;
  const priceNum = Number(pricePerUnit) || 0;
  const total = quantityNum * priceNum;

  const handleSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError('');
    setIsSubmitting(true);

    try {
      await apiFetch('/offers', {
        method: 'POST',
        body: { listingId: listing.id, quantity: quantityNum, price: priceNum, message: message || undefined },
      });
      setSubmitted(true);
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Make an Offer</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-neutral-500 hover:text-black">
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-neutral-700">Your offer has been sent to the seller.</p>
            <Button type="button" onClick={onClose} className="w-full">
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="flex items-center gap-3 rounded-md border border-neutral-200 p-2">
              {listing.images[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={listing.images[0].url} alt={listing.title} className="h-12 w-12 rounded object-cover" />
              )}
              <div>
                <p className="text-sm font-medium text-neutral-900">{listing.title}</p>
                <p className="text-xs text-neutral-500">{listing.quantityAvailable} units available</p>
              </div>
            </div>

            <Input
              label={`Quantity You Want (Max ${listing.quantityAvailable})`}
              type="number"
              min={1}
              max={listing.quantityAvailable}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              error={fieldErrors.quantity}
              required
            />

            <Input
              label="Your Offer (USD per unit)"
              type="number"
              step="0.01"
              min={0.01}
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
              error={fieldErrors.price}
              required
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-800">Message to Seller (Optional)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
              />
            </div>

            {quantityNum > 0 && priceNum > 0 && (
              <p className="text-sm text-neutral-600">
                You are offering ${priceNum.toFixed(2)} per unit — ${total.toFixed(2)} total for {quantityNum} units.
              </p>
            )}

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
                Cancel
              </Button>
              <Button type="submit" isLoading={isSubmitting} className="flex-1">
                Submit Offer
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
