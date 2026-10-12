import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from '@/test-utils';
import BrowsePage from './page';
import { apiFetch, apiFetchPage } from '@/lib/api-client';
import type { Category, ListingCard } from '@/types/listing';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn(), apiFetchPage: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const mockedApiFetchPage = vi.mocked(apiFetchPage);

const categories: Category[] = [{ id: 'cat-1', name: 'Electronics', slug: 'electronics' }];

const makeListing = (overrides: Partial<ListingCard> = {}): ListingCard => ({
  id: 'listing-1',
  title: 'iPhone Cases (Mixed Colors)',
  condition: 'NEW',
  quantityAvailable: 500,
  location: 'Dubai, UAE',
  sellingMethod: 'OFFER',
  startingPrice: '25',
  status: 'ACTIVE',
  expiresAt: null,
  createdAt: '2026-10-07T00:00:00.000Z',
  category: categories[0],
  images: [],
  auction: null,
  ...overrides,
});

// The page fires two different apiFetchPage calls (the location-options sample and the main
// filtered listing search); tell them apart by the querystring, same as the real endpoint would.
const setupListings = (listings: ListingCard[], total = listings.length) => {
  mockedApiFetch.mockResolvedValue(categories);
  mockedApiFetchPage.mockImplementation((path: string) => {
    if (path.includes('pageSize=50')) {
      return Promise.resolve({
        data: listings,
        meta: { page: 1, pageSize: 50, total, totalPages: 1 },
      }) as ReturnType<typeof apiFetchPage>;
    }
    return Promise.resolve({
      data: listings,
      meta: { page: 1, pageSize: 12, total, totalPages: Math.ceil(total / 12) || 1 },
    }) as ReturnType<typeof apiFetchPage>;
  });
};

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockedApiFetchPage.mockReset();
});

test('loads categories and listings, showing the total count', async () => {
  setupListings([makeListing()], 1);
  renderWithQueryClient(<BrowsePage />);

  expect(await screen.findByText('1 products found')).toBeInTheDocument();
  expect(screen.getByText('iPhone Cases (Mixed Colors)')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Electronics' })).toBeInTheDocument();
});

test('submitting a search sends q and resets to page 1', async () => {
  setupListings([makeListing()], 1);
  renderWithQueryClient(<BrowsePage />);
  const user = userEvent.setup();

  await screen.findByText('1 products found');
  await user.type(screen.getByPlaceholderText('Search for products, categories or keywords'), 'cases');
  await user.click(screen.getByText('Search'));

  const lastCall = mockedApiFetchPage.mock.calls.at(-1)?.[0] as string;
  expect(lastCall).toContain('q=cases');
  expect(lastCall).toContain('page=1');
});

test('changing the condition filter refetches with that condition', async () => {
  setupListings([makeListing()], 1);
  renderWithQueryClient(<BrowsePage />);
  const user = userEvent.setup();

  await screen.findByText('1 products found');
  await user.selectOptions(screen.getByDisplayValue('Condition'), 'USED');

  const lastCall = mockedApiFetchPage.mock.calls.at(-1)?.[0] as string;
  expect(lastCall).toContain('condition=USED');
});

test('shows an empty state when nothing matches', async () => {
  setupListings([], 0);
  renderWithQueryClient(<BrowsePage />);
  expect(await screen.findByText('No listings match your filters.')).toBeInTheDocument();
});

test('shows an error message when the listings request fails', async () => {
  mockedApiFetch.mockResolvedValue(categories);
  mockedApiFetchPage.mockRejectedValue(new Error('network down'));
  renderWithQueryClient(<BrowsePage />);
  expect(await screen.findByText('Something went wrong loading listings.')).toBeInTheDocument();
});

test('pagination: Prev is disabled on page 1, Next advances the page', async () => {
  setupListings([makeListing()], 30); // 30 total / 12 per page = 3 pages
  renderWithQueryClient(<BrowsePage />);
  const user = userEvent.setup();

  await screen.findByText('Page 1 of 3');
  expect(screen.getByText('Prev')).toBeDisabled();

  await user.click(screen.getByText('Next'));
  const lastCall = mockedApiFetchPage.mock.calls.at(-1)?.[0] as string;
  expect(lastCall).toContain('page=2');
});
