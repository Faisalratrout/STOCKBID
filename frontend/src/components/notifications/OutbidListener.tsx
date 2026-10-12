'use client';

import { useOutbidNotifications } from '@/hooks/useOutbidNotifications';

/** Mounted once near the root, inside both AuthProvider and ToastProvider. Renders nothing. */
export const OutbidListener = () => {
  useOutbidNotifications();
  return null;
};
