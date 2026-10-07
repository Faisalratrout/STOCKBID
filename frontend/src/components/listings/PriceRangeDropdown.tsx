'use client';

import { useEffect, useRef, useState } from 'react';

interface PriceRangeDropdownProps {
  minPrice: string;
  maxPrice: string;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
}

export const PriceRangeDropdown = ({
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
}: PriceRangeDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // A native <select> closes itself on an outside click for free; a custom dropdown like this
  // has to listen for it itself.
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const label = minPrice || maxPrice ? `$${minPrice || '0'} - $${maxPrice || 'Any'}` : 'Price Range';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-neutral-300 px-2 py-2 text-left text-sm text-neutral-900"
      >
        {label}
        {/* Sized to match the native <select> arrow next to it: measured at ~8.75x5.5 CSS px. */}
        <svg viewBox="0 0 16 10" fill="none" stroke="currentColor" strokeWidth="2" className="h-1.5 w-[8.75px] shrink-0 text-neutral-900">
          <path d="M1 1 8 9.5 15 1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-56 rounded-md border border-neutral-300 bg-white p-3 shadow-md">
          <div className="flex gap-2">
            <input
              type="number"
              value={minPrice}
              onChange={(e) => onMinPriceChange(e.target.value)}
              placeholder="Min"
              autoFocus
              className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
            />
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => onMaxPriceChange(e.target.value)}
              placeholder="Max"
              className="w-full rounded-md border border-neutral-300 px-2 py-2 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
};
