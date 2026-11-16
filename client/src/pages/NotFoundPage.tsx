import { useLocation } from 'react-router';
import { ErrorPage } from '../components/errors';

export function NotFoundPage() {
  const { pathname } = useLocation();
  return (
    <ErrorPage
      kind="notFound"
      title="This page doesn’t exist"
      body="Check the address, or use the menu to find what you need."
    >
      <p className="mt-4 inline-block rounded-control bg-sunken px-2.5 py-1 font-mono text-xs text-ink-2">
        {pathname}
      </p>
    </ErrorPage>
  );
}
