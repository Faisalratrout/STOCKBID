import { render, screen } from '@testing-library/react';
import { ListingCard } from './ListingCard';
import type { ListingCard as ListingCardData } from '@/types/listing';

const baseListing: ListingCardData = {
  id: 'f8260047-efb0-41d0-b16d-da9da453f00b',
  title: 'iPhone Cases (Mixed Colors)',
  condition: 'NEW',
  quantityAvailable: 500,
  location: 'Dubai, UAE',
  sellingMethod: 'OFFER',
  startingPrice: '25',
  status: 'ACTIVE',
  expiresAt: null,
  createdAt: '2026-10-07T00:00:00.000Z',
  category: { id: 'cat-1', name: 'Electronics', slug: 'electronics' },
  images: [],
  auction: null,
};

test('renders listing title, quantity, condition, price and location', () => {
  render(<ListingCard listing={baseListing} />);

  expect(screen.getByText('iPhone Cases (Mixed Colors)')).toBeInTheDocument();
  expect(screen.getByText(/500 units/)).toBeInTheDocument();
  expect(screen.getByText(/New/)).toBeInTheDocument();
  expect(screen.getByText('$25.00')).toBeInTheDocument();
  expect(screen.getByText('Dubai, UAE')).toBeInTheDocument();
});

test('links to the listing detail page', () => {
  render(<ListingCard listing={baseListing} />);

  expect(screen.getByRole('link')).toHaveAttribute(
    'href',
    '/listings/f8260047-efb0-41d0-b16d-da9da453f00b',
  );
});

test('shows "Make an Offer" for an offer listing', () => {
  render(<ListingCard listing={baseListing} />);
  expect(screen.getByText('Make an Offer')).toBeInTheDocument();
});

test('shows "Place Bid" and the current bid for an auction listing', () => {
  const auctionListing: ListingCardData = {
    ...baseListing,
    sellingMethod: 'AUCTION',
    auction: { currentBid: '550', endAt: '2026-12-01T00:00:00.000Z', status: 'ACTIVE' },
  };
  render(<ListingCard listing={auctionListing} />);

  expect(screen.getByText('Place Bid')).toBeInTheDocument();
  expect(screen.getByText('$550.00')).toBeInTheDocument();
});

test('falls back to the starting price when an auction has no bids yet', () => {
  const auctionListing: ListingCardData = {
    ...baseListing,
    sellingMethod: 'AUCTION',
    auction: { currentBid: null, endAt: '2026-12-01T00:00:00.000Z', status: 'ACTIVE' },
  };
  render(<ListingCard listing={auctionListing} />);

  expect(screen.getByText('$25.00')).toBeInTheDocument();
});
