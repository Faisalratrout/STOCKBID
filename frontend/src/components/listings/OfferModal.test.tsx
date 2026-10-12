import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfferModal } from './OfferModal';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import type { ListingDetail } from '@/types/listing';

// Mocking the API client module is new ground beyond FSO's own tests: their components never
// fetch data themselves (a parent passes data/callbacks as props), so their tests never need to
// fake a network call. Here OfferModal calls apiFetch directly, so the test replaces the whole
// module with vi.fn()s and controls what each call resolves or rejects with.
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

const baseListing: ListingDetail = {
  id: 'listing-1',
  sellerId: 'seller-1',
  title: 'iPhone Cases (Mixed Colors)',
  description: 'Mixed phone cases.',
  condition: 'NEW',
  quantityTotal: 500,
  quantityAvailable: 500,
  location: 'Dubai, UAE',
  sellingMethod: 'OFFER',
  startingPrice: '25',
  handoverMethod: 'PICKUP',
  status: 'ACTIVE',
  expiresAt: null,
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  category: { id: 'cat-1', name: 'Electronics', slug: 'electronics' },
  images: [],
  auction: null,
  seller: { id: 'seller-1', businessProfile: null },
};

beforeEach(() => {
  mockedApiFetch.mockReset();
});

test('renders the listing summary', () => {
  render(<OfferModal listing={baseListing} onClose={() => {}} />);
  expect(screen.getByText('iPhone Cases (Mixed Colors)')).toBeInTheDocument();
  expect(screen.getByText('500 units available')).toBeInTheDocument();
});

test('shows the computed total once quantity and price are filled', async () => {
  render(<OfferModal listing={baseListing} onClose={() => {}} />);
  const user = userEvent.setup();

  await user.clear(screen.getByLabelText(/Quantity You Want/));
  await user.type(screen.getByLabelText(/Quantity You Want/), '50');
  await user.type(screen.getByLabelText(/Your Offer/), '22.50');

  expect(screen.getByText(/\$22\.50 per unit \(\$1125\.00 total for 50 units\)/)).toBeInTheDocument();
});

test('submits the offer with the listing id, quantity, and per-unit price', async () => {
  mockedApiFetch.mockResolvedValueOnce(undefined);
  render(<OfferModal listing={baseListing} onClose={() => {}} />);
  const user = userEvent.setup();

  await user.clear(screen.getByLabelText(/Quantity You Want/));
  await user.type(screen.getByLabelText(/Quantity You Want/), '50');
  await user.type(screen.getByLabelText(/Your Offer/), '22.5');
  await user.click(screen.getByText('Submit Offer'));

  expect(mockedApiFetch).toHaveBeenCalledWith('/offers', {
    method: 'POST',
    body: { listingId: 'listing-1', quantity: 50, price: 22.5, message: undefined },
  });
  expect(await screen.findByText('Your offer has been sent to the seller.')).toBeInTheDocument();
});

test('shows a field error on VALIDATION_ERROR', async () => {
  mockedApiFetch.mockRejectedValueOnce(
    new ApiClientError(400, 'VALIDATION_ERROR', 'Invalid', [{ path: 'price', message: 'Price too low' }]),
  );
  render(<OfferModal listing={baseListing} onClose={() => {}} />);
  const user = userEvent.setup();

  // A value that passes the input's own min=0.01 client-side constraint: this test is about
  // the component handling the server's rejection, not about triggering a client-side one.
  await user.type(screen.getByLabelText(/Your Offer/), '5');
  await user.click(screen.getByText('Submit Offer'));

  expect(await screen.findByText('Price too low')).toBeInTheDocument();
});

test('Cancel calls onClose', async () => {
  const onClose = vi.fn();
  render(<OfferModal listing={baseListing} onClose={onClose} />);
  const user = userEvent.setup();

  await user.click(screen.getByText('Cancel'));
  expect(onClose.mock.calls).toHaveLength(1);
});
