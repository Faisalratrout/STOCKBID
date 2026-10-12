import { screen } from '@testing-library/react';
import { renderWithQueryClient } from '@/test-utils';
import OffersPage from './page';
import { useAuth } from '@/context/auth-context';
import { apiFetchPage } from '@/lib/api-client';
import type { OfferView } from '@/types/offer';

vi.mock('@/context/auth-context');
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetchPage: vi.fn() };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedApiFetchPage = vi.mocked(apiFetchPage);

const makeOffer = (overrides: Partial<OfferView> = {}): OfferView => ({
  id: 'offer-1',
  listingId: 'listing-1',
  buyerId: 'buyer-1',
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
    sellerId: 'seller-1',
    status: 'ACTIVE',
    sellingMethod: 'OFFER',
    startingPrice: '25',
    quantityAvailable: 500,
    images: [],
  },
  buyer: { id: 'buyer-1', businessProfile: { companyName: 'RetailCo', logoUrl: null } },
  order: null,
  ...overrides,
});

beforeEach(() => {
  mockedApiFetchPage.mockReset();
});

test('prompts to log in when there is no user', () => {
  mockedUseAuth.mockReturnValue({ user: null, applySession: vi.fn(), logout: vi.fn() });
  renderWithQueryClient(<OffersPage />);
  expect(screen.getByText('Log in')).toBeInTheDocument();
});

test('shows "My Offers" and fetches /offers/mine for a buyer', async () => {
  mockedUseAuth.mockReturnValue({
    user: { id: 'buyer-1', email: 'b@x.com', role: 'BUYER', isEmailVerified: true, createdAt: '', companyName: null },
    applySession: vi.fn(),
    logout: vi.fn(),
  });
  mockedApiFetchPage.mockResolvedValueOnce({
    data: [makeOffer()],
    meta: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
  });

  renderWithQueryClient(<OffersPage />);

  expect(screen.getByText('My Offers')).toBeInTheDocument();
  expect(await screen.findByText('iPhone Cases (Mixed Colors)')).toBeInTheDocument();
  expect(mockedApiFetchPage).toHaveBeenCalledWith('/offers/mine');
});

test('shows "Offers Received" and fetches /offers/received for a seller', async () => {
  mockedUseAuth.mockReturnValue({
    user: { id: 'seller-1', email: 's@x.com', role: 'SELLER', isEmailVerified: true, createdAt: '', companyName: null },
    applySession: vi.fn(),
    logout: vi.fn(),
  });
  mockedApiFetchPage.mockResolvedValueOnce({
    data: [],
    meta: { page: 1, pageSize: 12, total: 0, totalPages: 1 },
  });

  renderWithQueryClient(<OffersPage />);

  expect(screen.getByText('Offers Received')).toBeInTheDocument();
  expect(await screen.findByText('No offers received yet.')).toBeInTheDocument();
  expect(mockedApiFetchPage).toHaveBeenCalledWith('/offers/received');
});

test('shows a status badge for each offer', async () => {
  mockedUseAuth.mockReturnValue({
    user: { id: 'buyer-1', email: 'b@x.com', role: 'BUYER', isEmailVerified: true, createdAt: '', companyName: null },
    applySession: vi.fn(),
    logout: vi.fn(),
  });
  mockedApiFetchPage.mockResolvedValueOnce({
    data: [makeOffer({ status: 'ACCEPTED' })],
    meta: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
  });

  renderWithQueryClient(<OffersPage />);
  expect(await screen.findByText('ACCEPTED')).toBeInTheDocument();
});
