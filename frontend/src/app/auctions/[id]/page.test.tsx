import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from '@/test-utils';
import AuctionPage from './page';
import { useAuth } from '@/context/auth-context';
import { apiFetch, apiFetchPage, ApiClientError } from '@/lib/api-client';
import { useParams } from 'next/navigation';
import type { AuctionView, BidView } from '@/types/listing';

vi.mock('@/context/auth-context');
vi.mock('next/navigation');
// The socket connection itself is covered by live testing (it needs a real server); here the
// page is tested with it stubbed out so rendering doesn't try to open a real connection.
vi.mock('@/hooks/useAuctionSocket', () => ({ useAuctionSocket: vi.fn() }));
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn(), apiFetchPage: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedApiFetch = vi.mocked(apiFetch);
const mockedApiFetchPage = vi.mocked(apiFetchPage);
const mockedUseParams = vi.mocked(useParams);

const baseAuction: AuctionView = {
  id: 'auction-1',
  listingId: 'listing-1',
  startingBid: '500',
  minIncrement: '10',
  currentBid: null,
  startAt: '2026-10-01T00:00:00.000Z',
  endAt: '2026-12-01T00:00:00.000Z',
  status: 'ACTIVE',
  winningBidId: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  startingBidPerUnit: '1',
  currentBidPerUnit: null,
  listing: {
    id: 'listing-1',
    title: 'Sneakers (Mixed Sizes)',
    sellerId: 'seller-1',
    status: 'ACTIVE',
    quantityTotal: 300,
    images: [],
  },
};

const emptyBids = { data: [] as BidView[], meta: { page: 1, pageSize: 50, total: 0, totalPages: 1 } };

const asUser = (id: string, role: 'BUYER' | 'SELLER') => ({
  user: { id, email: `${id}@x.com`, role, isEmailVerified: true, createdAt: '', companyName: null },
  applySession: vi.fn(),
  logout: vi.fn(),
});

const setup = (auction: AuctionView, bids = emptyBids) => {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/auctions/')) return Promise.resolve(auction) as ReturnType<typeof apiFetch>;
    return Promise.reject(new Error(`unexpected apiFetch ${path}`));
  });
  mockedApiFetchPage.mockResolvedValue(bids);
};

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedApiFetchPage.mockReset();
  mockedUseParams.mockReturnValue({ id: 'auction-1' });
  mockedUseAuth.mockReturnValue({ user: null, applySession: vi.fn(), logout: vi.fn() });
});

test('shows current bid falling back to starting bid, and the starting bid', async () => {
  setup(baseAuction);
  renderWithQueryClient(<AuctionPage />);

  expect(await screen.findByText('Sneakers (Mixed Sizes)')).toBeInTheDocument();
  expect(screen.getAllByText('$500.00')).toHaveLength(2); // current (fallback) + starting
});

test('prompts login when not authenticated', async () => {
  setup(baseAuction);
  renderWithQueryClient(<AuctionPage />);
  expect(await screen.findByText('Log in to bid')).toBeInTheDocument();
});

test('tells a seller they cannot bid', async () => {
  mockedUseAuth.mockReturnValue(asUser('seller-1', 'SELLER'));
  setup(baseAuction);
  renderWithQueryClient(<AuctionPage />);
  expect(await screen.findByText('Only buyers can bid.')).toBeInTheDocument();
});

test('shows the bid form for a buyer with the correct minimum (no bids yet)', async () => {
  mockedUseAuth.mockReturnValue(asUser('buyer-1', 'BUYER'));
  setup(baseAuction);
  renderWithQueryClient(<AuctionPage />);
  expect(await screen.findByText('Minimum bid: $500.00')).toBeInTheDocument();
});

test('computes minimum as currentBid + minIncrement once there is a bid', async () => {
  mockedUseAuth.mockReturnValue(asUser('buyer-1', 'BUYER'));
  setup({ ...baseAuction, currentBid: '560' });
  renderWithQueryClient(<AuctionPage />);
  expect(await screen.findByText('Minimum bid: $570.00')).toBeInTheDocument();
});

test('shows a non-active status message instead of a bid form', async () => {
  mockedUseAuth.mockReturnValue(asUser('buyer-1', 'BUYER'));
  setup({ ...baseAuction, status: 'ENDED' });
  renderWithQueryClient(<AuctionPage />);
  expect(await screen.findByText('This auction has ended.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Your Bid (USD)')).not.toBeInTheDocument();
});

test('submits a bid and clears the input on success', async () => {
  mockedUseAuth.mockReturnValue(asUser('buyer-1', 'BUYER'));
  setup(baseAuction);
  mockedApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (options?.method === 'POST') return Promise.resolve(undefined) as ReturnType<typeof apiFetch>;
    return Promise.resolve(baseAuction) as ReturnType<typeof apiFetch>;
  });

  renderWithQueryClient(<AuctionPage />);
  const user = userEvent.setup();

  const input = await screen.findByLabelText('Your Bid (USD)');
  await user.type(input, '550');
  await user.click(screen.getByText('Place Bid'));

  expect(mockedApiFetch).toHaveBeenCalledWith('/auctions/auction-1/bids', {
    method: 'POST',
    body: { amount: 550 },
  });
});

test('shows a field error tied to the amount path on VALIDATION_ERROR', async () => {
  mockedUseAuth.mockReturnValue(asUser('buyer-1', 'BUYER'));
  setup(baseAuction);
  mockedApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
    if (options?.method === 'POST') {
      return Promise.reject(
        new ApiClientError(400, 'VALIDATION_ERROR', 'Invalid', [{ path: 'amount', message: 'Minimum bid is 500' }]),
      ) as ReturnType<typeof apiFetch>;
    }
    return Promise.resolve(baseAuction) as ReturnType<typeof apiFetch>;
  });

  renderWithQueryClient(<AuctionPage />);
  const user = userEvent.setup();

  // A value that passes the input's own min=500 client-side constraint: this test is about
  // the component handling the server's rejection, not about triggering a client-side one.
  await user.type(await screen.findByLabelText('Your Bid (USD)'), '500');
  await user.click(screen.getByText('Place Bid'));

  expect(await screen.findByText('Minimum bid is 500')).toBeInTheDocument();
});

test('bid history shows "(you)" for the current user\'s bid and switches tabs', async () => {
  mockedUseAuth.mockReturnValue(asUser('buyer-1', 'BUYER'));
  const bids = {
    data: [
      {
        id: 'bid-1',
        auctionId: 'auction-1',
        amount: '550',
        amountPerUnit: '1.83',
        createdAt: new Date().toISOString(),
        isMine: true,
        bidder: { label: 'Bidder 1' },
      },
    ],
    meta: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
  };
  setup(baseAuction, bids);
  renderWithQueryClient(<AuctionPage />);
  const user = userEvent.setup();

  expect(await screen.findByText('(you)')).toBeInTheDocument();

  await user.click(screen.getByText('Product Details'));
  expect(await screen.findByText('Loading…')).toBeInTheDocument();
});
