import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from './page';
import { apiFetch, ApiClientError } from '@/lib/api-client';

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  mockedApiFetch.mockReset();
});

test('shows the same success message regardless of whether the email is registered', async () => {
  mockedApiFetch.mockResolvedValueOnce(undefined);
  render(<ForgotPasswordPage />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
  await user.click(screen.getByText('Send reset link'));

  expect(mockedApiFetch).toHaveBeenCalledWith('/auth/forgot-password', {
    method: 'POST',
    body: { email: 'nobody@example.com' },
    auth: false,
  });
  expect(await screen.findByText(/a reset link has been sent/)).toBeInTheDocument();
});

test('shows a form error when the request fails outright', async () => {
  mockedApiFetch.mockRejectedValueOnce(new ApiClientError(429, 'RATE_LIMITED', 'Too many requests'));
  render(<ForgotPasswordPage />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
  await user.click(screen.getByText('Send reset link'));

  expect(await screen.findByText('Too many requests')).toBeInTheDocument();
});
