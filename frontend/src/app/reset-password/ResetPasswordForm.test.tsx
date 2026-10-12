import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResetPasswordForm } from './ResetPasswordForm';
import { apiFetch, ApiClientError } from '@/lib/api-client';
import { useRouter, useSearchParams } from 'next/navigation';

vi.mock('next/navigation');
vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseRouter = vi.mocked(useRouter);
const mockedUseSearchParams = vi.mocked(useSearchParams);
const mockPush = vi.fn();

const withToken = (token: string | null) =>
  mockedUseSearchParams.mockReturnValue({ get: (key: string) => (key === 'token' ? token : null) } as ReturnType<
    typeof useSearchParams
  >);

beforeEach(() => {
  mockedApiFetch.mockReset();
  mockPush.mockReset();
  mockedUseRouter.mockReturnValue({ push: mockPush } as unknown as ReturnType<typeof useRouter>);
});

test('shows an invalid-link message when there is no token', () => {
  withToken(null);
  render(<ResetPasswordForm />);
  expect(screen.getByText('Reset link invalid')).toBeInTheDocument();
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
});

test('submits the token and new password, then redirects to login', async () => {
  withToken('abc123');
  mockedApiFetch.mockResolvedValueOnce(undefined);
  render(<ResetPasswordForm />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('New password'), 'NewPassword123!');
  await user.click(screen.getByText('Reset password'));

  expect(mockedApiFetch).toHaveBeenCalledWith('/auth/reset-password', {
    method: 'POST',
    body: { token: 'abc123', password: 'NewPassword123!' },
    auth: false,
  });
  expect(mockPush.mock.calls[0]).toEqual(['/login']);
});

test('shows a field error on VALIDATION_ERROR', async () => {
  withToken('abc123');
  mockedApiFetch.mockRejectedValueOnce(
    new ApiClientError(400, 'VALIDATION_ERROR', 'Invalid', [
      { path: 'password', message: 'Password too weak' },
    ]),
  );
  render(<ResetPasswordForm />);
  const user = userEvent.setup();

  await user.type(screen.getByLabelText('New password'), 'weak');
  await user.click(screen.getByText('Reset password'));

  expect(await screen.findByText('Password too weak')).toBeInTheDocument();
  expect(mockPush.mock.calls).toHaveLength(0);
});
