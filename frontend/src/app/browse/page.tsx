'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, apiFetchPage } from '@/lib/api-client';
import { ListingCard } from '@/components/listings/ListingCard';
import { PriceRangeDropdown } from '@/components/listings/PriceRangeDropdown';
import type { BrowseSort, Category, Condition, ListingCard as ListingCardData, SellingMethod } from '@/types/listing';

const SORT_OPTIONS: { value: BrowseSort; label: string }[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'ending_soon', label: 'Ending Soon' },
];

const PAGE_SIZE = 12;

const BrowsePage = () => {
  const [queryInput, setQueryInput] = useState('');
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [condition, setCondition] = useState<Condition | ''>('');
  const [sellingMethod, setSellingMethod] = useState<SellingMethod | ''>('');
  const [location, setLocation] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState<BrowseSort>('newest');
  const [page, setPage] = useState(1);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<Category[]>('/categories', { auth: false }),
  });

  // No backend endpoint for "distinct locations" exists, so this is a best-effort list built
  // from whatever listings are out there right now, independent of the filters below it (so
  // picking a filter doesn't shrink this dropdown's own options).
  const { data: locationOptions } = useQuery({
    queryKey: ['listingLocations'],
    queryFn: async () => {
      const { data } = await apiFetchPage<ListingCardData[]>('/listings?pageSize=50&sort=newest', {
        auth: false,
      });
      return Array.from(new Set(data.map((listing) => listing.location))).sort();
    },
  });

  const filters = { q, categoryId, condition, sellingMethod, location, minPrice, maxPrice, sort, page };

  const { data, isLoading, isError } = useQuery({
    queryKey: ['listings', filters],
    queryFn: () => {
      const params = new URLSearchParams({ sort, page: String(page), pageSize: String(PAGE_SIZE) });
      if (q) params.set('q', q);
      if (categoryId) params.set('categoryId', categoryId);
      if (condition) params.set('condition', condition);
      if (sellingMethod) params.set('sellingMethod', sellingMethod);
      if (location) params.set('location', location);
      if (minPrice) params.set('minPrice', minPrice);
      if (maxPrice) params.set('maxPrice', maxPrice);
      return apiFetchPage<ListingCardData[]>(`/listings?${params}`, { auth: false });
    },
  });

  const resetToFirstPage = () => setPage(1);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQ(queryInput);
    resetToFirstPage();
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <p className="text-xs font-semibold tracking-wide text-neutral-500">BUSINESS STOCK</p>
      <h1 className="mt-2 text-3xl font-bold text-neutral-900">Browse Available Stock</h1>
      <p className="mt-2 text-neutral-600">Find the best deals from verified businesses around the world.</p>

      <form onSubmit={handleSearchSubmit} className="mt-6 flex gap-2">
        <input
          type="text"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Search for products, categories or keywords"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-black focus:ring-1 focus:ring-black"
        />
        <button type="submit" className="rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800">
          Search
        </button>
      </form>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <select
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            resetToFirstPage();
          }}
          className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">Category</option>
          {categories?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={condition}
          onChange={(e) => {
            setCondition(e.target.value as Condition | '');
            resetToFirstPage();
          }}
          className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">Condition</option>
          <option value="NEW">New</option>
          <option value="USED">Used</option>
        </select>

        <select
          value={sellingMethod}
          onChange={(e) => {
            setSellingMethod(e.target.value as SellingMethod | '');
            resetToFirstPage();
          }}
          className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">Selling Method</option>
          <option value="OFFER">Offer</option>
          <option value="AUCTION">Auction</option>
        </select>

        <select
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            resetToFirstPage();
          }}
          className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          <option value="">Location</option>
          {locationOptions?.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>

        <PriceRangeDropdown
          minPrice={minPrice}
          maxPrice={maxPrice}
          onMinPriceChange={(value) => {
            setMinPrice(value);
            resetToFirstPage();
          }}
          onMaxPriceChange={(value) => {
            setMaxPrice(value);
            resetToFirstPage();
          }}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          {isLoading ? 'Loading…' : `${data?.meta.total ?? 0} products found`}
        </p>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as BrowseSort);
            resetToFirstPage();
          }}
          className="rounded-md border border-neutral-300 px-2 py-2 text-sm"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {isError && <p className="mt-6 text-sm text-red-600">Something went wrong loading listings.</p>}

      {!isLoading && !isError && data?.data.length === 0 && (
        <p className="mt-6 text-sm text-neutral-600">No listings match your filters.</p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {data?.data.map((listing) => <ListingCard key={listing.id} listing={listing} />)}
      </div>

      {data && data.meta.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setPage((p) => p - 1)}
            disabled={page <= 1}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:text-neutral-400"
          >
            Prev
          </button>
          <span className="text-sm text-neutral-600">
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.meta.totalPages}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:text-neutral-400"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default BrowsePage;
