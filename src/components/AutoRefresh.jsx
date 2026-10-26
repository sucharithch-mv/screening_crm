'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-renders the current server page every few seconds while `enabled`. */
export default function AutoRefresh({ enabled, intervalMs = 10000 }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [enabled, intervalMs, router]);
  return null;
}
