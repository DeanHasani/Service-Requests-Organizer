import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState, Panel } from '../components/ui';

export function NotFoundPage() {
  return (
    <Panel>
      <EmptyState
        icon={<Compass />}
        title="This page doesn’t exist"
        body="The link may be old or mistyped."
        action={
          <Link to="/" className="text-sm font-medium text-cobalt hover:underline">
            Go to the dashboard
          </Link>
        }
      />
    </Panel>
  );
}
