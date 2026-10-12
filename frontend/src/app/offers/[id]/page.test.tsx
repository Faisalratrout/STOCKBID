import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from '@/test-utils';
import OfferDetailPage from './page';
import { useAuth } from '@/context/auth-context';
import { apiFetch } from '@/lib/api-client';
import { useParams, useRouter } from 'next/navigation';
import type { OfferDetail, OfferView } from '@/types/offer';

vi.mock('@/context/auth-context');
vi.mock('next/navigation');
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseParams = vi.mocked(useParams);
const mockedUseRouter = vi.mocked(useRouter);
const mockPush = vi.fn();

const SELLER_ID = 'seller-1';
const BUYER_ID = 'buyer-1';

const baseOffer: OfferView = {
  id: 'offer-1',
  listingId: 'listing-1',
  buyerId: BUYER_ID,
  quantity: 50,
  price: '22.5',
  message: null,
  status: 'PENDING',
  parentOfferId: null,
  createdBySellerCounter: false,
  createdAt: '2026-10-07T00:00:00.000Z',
  updatedAt: '2026-10-07T00:00:00.000Z',
  listing: {
    id: 'listing-1',
    title: 'iPhone Cases (Mixed Colors)',
    sellerId: SELLER_ID,
    status: 'ACTIVE',
    sellingMethod: 'OFFER',
    startingPrice: '25',
    quantityAvailable: 500,
    images: [],
  },
  buyer: { id: BUYER_ID, businessProfile: { companyName: 'RetailCo', logoUrl: null } },
  order: null,
};

const asUser = (id: string, role: 'BUYER' | 'SELLER') => ({
  user: { id, email: `${id}@x.com`, role, isEmailVerified: true, createdAt: '', companyName: null },
  applySession: vi.fn(),
  logout: vi.fn(),
});

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockPush.mockReset();
  mockedUseParams.mockReturnValue({ id: 'offer-1' });
  mockedUseRouter.mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
});

test("seller sees Accept/Reject/Counter when it's their turn", async () => {
  mockedUseAuth.mockReturnValue(asUser(SELLER_ID, 'SELLER'));
  mockedApiFetch.mockResolvedValueOnce({ ...baseOffer, history: [] } satisfies OfferDetail);

  renderWithQueryClient(<OfferDetailPage />);

  expect(await screen.findByText('Accept')).toBeInTheDocument();
  expect(screen.getByText('Reject')).toBeInTheDocument();
  expect(screen.getByText('Counter')).toBeInTheDocument();
  expect(screen.queryByText('Waiting for a response.')).not.toBeInTheDocument();
});

test('buyer (the creator) sees "waiting" and Withdraw, not response actions', async () => {
  mockedUseAuth.mockReturnValue(asUser(BUYER_ID, 'BUYER'));
  mockedApiFetch.mockResolvedValueOnce({ ...baseOffer, history: [] } satisfies OfferDetail);

  renderWithQueryClient(<OfferDetailPage />);

  expect(await screen.findByText('Waiting for a response.')).toBeInTheDocument();
  expect(screen.getByText('Withdraw Offer')).toBeInTheDocument();
  expect(screen.queryByText('Accept')).not.toBeInTheDocument();
});

test('clicking Accept calls the accept endpoint', async () => {
  mockedUseAuth.mockReturnValue(asUser(SELLER_ID, 'SELLER'));
  mockedApiFetch.mockResolvedValueOnce({ ...baseOffer, history: [] } satisfies OfferDetail);
  mockedApiFetch.mockResolvedValueOnce(undefined);
  mockedApiFetch.mockResolvedValueOnce({ ...baseOffer, status: 'ACCEPTED', history: [] } satisfies OfferDetail);

  renderWithQueryClient(<OfferDetailPage />);
  const user = userEvent.setup();

  await user.click(await screen.findByText('Accept'));

  expect(mockedApiFetch).toHaveBeenCalledWith('/offers/offer-1/accept', { method: 'POST' });
});

test('opens the counter form and submits it, then navigates to the new offer', async () => {
  mockedUseAuth.mockReturnValue(asUser(SELLER_ID, 'SELLER'));
  mockedApiFetch.mockResolvedValueOnce({ ...baseOffer, history: [] } satisfies OfferDetail);
  const counterResult: OfferView = {
    ...baseOffer,
    id: 'offer-2',
    price: '24',
    parentOfferId: 'offer-1',
    createdBySellerCounter: true,
  };
  mockedApiFetch.mockResolvedValueOnce(counterResult);

  renderWithQueryClient(<OfferDetailPage />);
  const user = userEvent.setup();

  await user.click(await screen.findByText('Counter'));
  await user.type(screen.getByLabelText(/Quantity/), '50');
  await user.type(screen.getByLabelText(/Your Counter/), '24');
  await user.click(screen.getByText('Send Counter'));

  expect(mockedApiFetch).toHaveBeenCalledWith('/offers/offer-1/counter', {
    method: 'POST',
    body: { quantity: 50, price: 24, message: undefined },
  });
  expect(mockPush.mock.calls[0]).toEqual(['/offers/offer-2']);
});

test('shows the order-created message for an accepted offer', async () => {
  mockedUseAuth.mockReturnValue(asUser(BUYER_ID, 'BUYER'));
  mockedApiFetch.mockResolvedValueOnce({
    ...baseOffer,
    status: 'ACCEPTED',
    order: { id: 'order-1' },
    history: [],
  } satisfies OfferDetail);

  renderWithQueryClient(<OfferDetailPage />);

  expect(await screen.findByText('An order was created from this offer.')).toBeInTheDocument();
  expect(screen.queryByText('Accept')).not.toBeInTheDocument();
});

test('renders the negotiation history with correct labels, oldest first', async () => {
  mockedUseAuth.mockReturnValue(asUser(SELLER_ID, 'SELLER'));
  const parent: OfferView = { ...baseOffer, id: 'offer-0', status: 'COUNTERED' };
  const current: OfferView = {
    ...baseOffer,
    id: 'offer-1',
    parentOfferId: 'offer-0',
    createdBySellerCounter: true,
    price: '24',
  };
  mockedApiFetch.mockResolvedValueOnce({ ...current, history: [parent] } satisfies OfferDetail);

  renderWithQueryClient(<OfferDetailPage />);

  await screen.findByText('Seller countered');
  const labels = screen.getAllByText(/Buyer offered|Seller countered/);
  expect(labels.map((el) => el.textContent)).toEqual(['Buyer offered', 'Seller countered']);
});
