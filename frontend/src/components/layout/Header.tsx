'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/Button';

export const Header = () => {
  const { user, logout } = useAuth();

  return (
    <header>
      <Link href="/">STOCKBID</Link>
      {' | '}
      {user ? (
        <>
          <span>{user.companyName ?? user.email}</span>{' '}
          <Button onClick={() => logout()}>Log out</Button>
        </>
      ) : (
        <>
          <Link href="/login">Log in</Link> <Link href="/register">Create account</Link>
        </>
      )}
    </header>
  );
};
