import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from '@/test-utils';
import ListingDetailPage from './page';
import { useAuth } from '@/context/auth-context';
import { apiFetch } from '@/lib/api-client';
import { useParams } from 'next/navigation';
import type { ListingDetail } from '@/types/listing';

vi.mock('@/context/auth-context');
vi.mock('next/navigation');
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseParams = vi.mocked(useParams);

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
  seller: {
    id: 'seller-1',
    businessProfile: { companyName: 'TechSupply Ltd', logoUrl: null, location: 'Dubai, UAE', isVerified: true },
  },
};

const asUser = (id: string, role: 'BUYER' | 'SELLER') => ({
  user: { id, email: `${id}@x.com`, role, isEmailVerified: true, createdAt: '', companyName: null },
  applySession: vi.fn(),
  logout: vi.fn(),
});

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedUseParams.mockReturnValue({ id: 'listing-1' });
  mockedUseAuth.mockReturnValue({ user: null, applySession: vi.fn(), logout: vi.fn() });
});

test('shows the per-unit price and the total for quantity available', async () => {
  mockedApiFetch.mockResolvedValueOnce(baseListing);
  renderWithQueryClient(<ListingDetailPage />);

  expect(await screen.findByText('$25.00')).toBeInTheDocument();
  expect(screen.getByText('/ unit')).toBeInTheDocument();
  expect(screen.getByText('$12,500.00')).toBeInTheDocument();
  expect(screen.getByText('Total (500 available)')).toBeInTheDocument();
});

test('an auction listing links to its dedicated Auction View page', async () => {
  mockedApiFetch.mockResolvedValueOnce({
    ...baseListing,
    sellingMethod: 'AUCTION',
    auction: {
      id: 'auction-1',
      startingBid: '500',
      minIncrement: '10',
      currentBid: null,
      startAt: '2026-10-01T00:00:00.000Z',
      endAt: '2026-12-01T00:00:00.000Z',
      status: 'ACTIVE',
    },
  } satisfies ListingDetail);
  renderWithQueryClient(<ListingDetailPage />);

  const link = await screen.findByText('View Auction');
  expect(link.closest('a')).toHaveAttribute('href', '/auctions/auction-1');
});

test('prompts login for an offer listing when logged out', async () => {
  mockedApiFetch.mockResolvedValueOnce(baseListing);
  renderWithQueryClient(<ListingDetailPage />);
  expect(await screen.findByText('Log in to make an offer')).toBeInTheDocument();
});

test('tells a seller they cannot make offers', async () => {
  mockedUseAuth.mockReturnValue(asUser('someone-else', 'SELLER'));
  mockedApiFetch.mockResolvedValueOnce(baseListing);
  renderWithQueryClient(<ListingDetailPage />);
  expect(await screen.findByText('Only buyers can make offers.')).toBeInTheDocument();
});

test('a buyer can open the offer modal', async () => {
  mockedUseAuth.mockReturnValue(asUser('buyer-1', 'BUYER'));
  mockedApiFetch.mockResolvedValueOnce(baseListing);
  renderWithQueryClient(<ListingDetailPage />);
  const user = userEvent.setup();

  // "Make an Offer" also appears as the Selling Method value in the info table, so the button
  // needs disambiguating by role.
  await user.click(await screen.findByRole('button', { name: 'Make an Offer' }));
  expect(screen.getByRole('heading', { name: 'Make an Offer' })).toBeInTheDocument();
});

test('switches between Description, Shipping Info, and Seller Info tabs', async () => {
  mockedApiFetch.mockResolvedValueOnce(baseListing);
  renderWithQueryClient(<ListingDetailPage />);
  const user = userEvent.setup();

  expect(await screen.findByText('Mixed phone cases.')).toBeInTheDocument();

  await user.click(screen.getByText('Shipping Info'));
  expect(screen.getByText('Pickup from seller, from Dubai, UAE.')).toBeInTheDocument();

  await user.click(screen.getByText('Seller Info'));
  expect(screen.getByText('TechSupply Ltd')).toBeInTheDocument();
  expect(screen.getByText('Verified Business')).toBeInTheDocument();
});
