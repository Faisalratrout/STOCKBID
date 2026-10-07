import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './Input';

test('typing into the input calls onChange with each keystroke', async () => {
  const handleChange = vi.fn();
  render(<Input label="Email" value="" onChange={handleChange} />);
  const user = userEvent.setup();

  const input = screen.getByLabelText('Email');
  await user.type(input, 'a');

  expect(handleChange.mock.calls).toHaveLength(1);
});

test('shows the error message and marks the input invalid when error is set', () => {
  render(<Input label="Password" value="" onChange={() => {}} error="Too short" />);

  expect(screen.getByText('Too short')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
});

test('does not show an error message when error is not set', () => {
  render(<Input label="Password" value="" onChange={() => {}} />);

  expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'false');
});
