import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

test('renders its children and fires onClick once when clicked', async () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Create account</Button>);
  const user = userEvent.setup();

  const button = screen.getByText('Create account');
  await user.click(button);

  expect(handleClick.mock.calls).toHaveLength(1);
});

test('disables the button and does not fire onClick while isLoading', async () => {
  const handleClick = vi.fn();
  render(
    <Button isLoading onClick={handleClick}>
      Submit Offer
    </Button>,
  );
  const user = userEvent.setup();

  const button = screen.getByRole('button');
  expect(button).toBeDisabled();
  expect(screen.queryByText('Submit Offer')).not.toBeInTheDocument();

  await user.click(button);
  expect(handleClick.mock.calls).toHaveLength(0);
});
