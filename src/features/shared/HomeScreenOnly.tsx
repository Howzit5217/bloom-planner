import type { ReactNode } from 'react';

/** The phone app is installed already; only the web version (HomeScreenOnly.web.tsx) asks for the home screen. */
export function HomeScreenOnly({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
