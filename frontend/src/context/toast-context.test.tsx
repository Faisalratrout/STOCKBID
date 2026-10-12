import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from './toast-context';

const TestConsumer = () => {
  const { showToast } = useToast();
  return (
    <div>
      <button type="button" onClick={() => showToast('Plain toast')}>
        Show plain
      </button>
      <button type="button" onClick={() => showToast('Linked toast', '/somewhere')}>
        Show linked
      </button>
    </div>
  );
};

test('shows a toast when showToast is called', async () => {
  render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>,
  );
  const user = userEvent.setup();

  expect(screen.queryByText('Plain toast')).not.toBeInTheDocument();
  await user.click(screen.getByText('Show plain'));
  expect(screen.getByText('Plain toast')).toBeInTheDocument();
});

test('renders a toast with an href as a link', async () => {
  render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>,
  );
  const user = userEvent.setup();

  await user.click(screen.getByText('Show linked'));
  expect(screen.getByText('Linked toast')).toHaveAttribute('href', '/somewhere');
});

test('auto-dismisses a toast after its duration', () => {
  vi.useFakeTimers();
  render(
    <ToastProvider>
      <TestConsumer />
    </ToastProvider>,
  );

  // fireEvent is synchronous (unlike userEvent, which schedules its own internal delays), so it
  // doesn't fight with fake timers: everything here happens inside one act() flush.
  act(() => {
    fireEvent.click(screen.getByText('Show plain'));
  });
  expect(screen.getByText('Plain toast')).toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(6000);
  });
  expect(screen.queryByText('Plain toast')).not.toBeInTheDocument();
  vi.useRealTimers();
});

test('useToast throws outside a ToastProvider', () => {
  const Broken = () => {
    useToast();
    return null;
  };
  expect(() => render(<Broken />)).toThrow('useToast must be used within ToastProvider');
});
