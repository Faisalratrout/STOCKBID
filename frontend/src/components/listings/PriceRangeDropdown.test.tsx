import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceRangeDropdown } from './PriceRangeDropdown';

const noop = () => {};

test('shows "Price Range" by default and opens the panel on click', async () => {
  render(<PriceRangeDropdown minPrice="" maxPrice="" onMinPriceChange={noop} onMaxPriceChange={noop} />);
  const user = userEvent.setup();

  expect(screen.getByText('Price Range')).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Min')).not.toBeInTheDocument();

  await user.click(screen.getByText('Price Range'));

  expect(screen.getByPlaceholderText('Min')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Max')).toBeInTheDocument();
});

test('typing into Min calls onMinPriceChange', async () => {
  const handleMinChange = vi.fn();
  render(
    <PriceRangeDropdown minPrice="" maxPrice="" onMinPriceChange={handleMinChange} onMaxPriceChange={noop} />,
  );
  const user = userEvent.setup();

  await user.click(screen.getByText('Price Range'));
  await user.type(screen.getByPlaceholderText('Min'), '5');

  expect(handleMinChange.mock.calls).toHaveLength(1);
  expect(handleMinChange.mock.calls[0][0]).toBe('5');
});

test('closes the panel on an outside click', async () => {
  render(
    <div>
      <PriceRangeDropdown minPrice="" maxPrice="" onMinPriceChange={noop} onMaxPriceChange={noop} />
      <button type="button">outside</button>
    </div>,
  );
  const user = userEvent.setup();

  await user.click(screen.getByText('Price Range'));
  expect(screen.getByPlaceholderText('Min')).toBeInTheDocument();

  await user.click(screen.getByText('outside'));
  expect(screen.queryByPlaceholderText('Min')).not.toBeInTheDocument();
});
