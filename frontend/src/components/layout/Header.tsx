'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/Button';

export const Header = () => {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
      <Link href="/" className="text-lg font-bold tracking-tight text-neutral-900">
        STOCKBID
      </Link>

      <Link href="/browse" className="text-sm font-medium text-neutral-700 hover:text-black">
        Browse Stock
      </Link>

      <nav className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm text-neutral-600">{user.companyName ?? user.email}</span>
            <Button variant="secondary" onClick={() => logout()}>
              Log out
            </Button>
          </>
        ) : (
          <>
            <Link href="/login" className="text-sm font-medium text-neutral-700 hover:text-black">
              Log in
            </Link>
            <Link href="/register">
              <Button>Create account</Button>
            </Link>
          </>
        )}
      </nav>
    </header>
  );
};
