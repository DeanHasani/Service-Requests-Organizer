import { useState } from 'react';
import { AlertTriangle, Info, Sparkles, UserCheck } from 'lucide-react';
import { CATEGORY_LABEL, type Candidate, type Recommendations } from '@deskflow/shared';
import { cx, formatDuration } from '../lib/format';
import { Avatar, Button, ConfirmDialog, Panel, PanelHeader, Skeleton } from './ui';

const BASIS_NOTE: Record<Recommendations['basis'], string> = {
  experience: 'Based on the team’s history with this kind of request and current workload.',
  limited:
    'Only a little history with this kind of request so far, so this leans on workload and general experience. Treat it as a starting point.',
  workload:
    'Nobody has resolved this kind of request yet, so this is based on workload and general experience only.',
};

/** Plain-language strength of a match. The number is relative to the other candidates. */
function matchLabel(score: number) {
  if (score >= 70) return 'Strong match';
  if (score >= 50) return 'Good match';
  if (score >= 35) return 'Possible';
  return 'Weak match';
}

function ScoreBar({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-2" title={`Match score ${score} of 100`}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <span className="block h-full rounded-full bg-cobalt" style={{ width: `${score}%` }} />
      </span>
      <span className="tabular text-xs font-semibold text-ink">{score}</span>
    </span>
  );
}

/** "4 of 5 held (80%)" or "2 resolved, too few to judge". Sample size always shown. */
function outcome(c: Candidate) {
  const k = c.category;
  if (!k.resolved) return 'None yet';
  if (k.successRate === null) return `${k.resolved} resolved, too few to judge`;
  return `${k.held} of ${k.resolved} held (${Math.round(k.successRate * 100)}%)`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

function CandidateDetail({ c, categoryLabel }: { c: Candidate; categoryLabel: string }) {
  return (
    <>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        <Stat label={`${categoryLabel} handled`} value={String(c.category.resolved)} />
        <Stat label="Fixes that held" value={outcome(c)} />
        <Stat
          label="Typical time"
          value={
            c.category.medianHours === null
              ? 'Not enough data'
              : formatDuration(c.category.medianHours)
          }
        />
        <Stat
          label="Workload now"
          value={`${c.workload.active} active${c.workload.overdue ? `, ${c.workload.overdue} overdue` : ''}`}
        />
      </dl>
      <ul className="mt-3 space-y-1 text-[13px]">
        {c.reasons.map((r) => (
          <li key={r} className="flex gap-2 text-ink-2">
            <UserCheck className="mt-0.5 size-3.5 shrink-0 text-resolved" aria-hidden />
            {r}
          </li>
        ))}
        {c.cautions.map((r) => (
          <li key={r} className="flex gap-2 text-ink-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-high" aria-hidden />
            {r}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Smart assignment for an unassigned request: the best match with reasons, and alternatives to
 * compare. Suggestions only: assigning always asks the manager to confirm.
 */
export function SmartAssignPanel({
  data,
  loading,
  error,
  assigning,
  onAssign,
}: {
  data?: Recommendations;
  loading: boolean;
  error?: string | null;
  assigning: boolean;
  onAssign: (c: Candidate) => Promise<void> | void;
}) {
  const [confirm, setConfirm] = useState<Candidate | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const label = data ? CATEGORY_LABEL[data.category] : '';
  const [top, ...rest] = data?.candidates ?? [];

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Smart assignment"
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-3">
            <Sparkles className="size-3.5" aria-hidden /> Suggestions only, you decide
          </span>
        }
      />
      {loading ? (
        <div className="space-y-3 p-4" aria-hidden>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <p className="flex gap-2 p-4 text-[13px] text-ink-2">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : !top ? (
        <p className="p-4 text-[13px] text-ink-2">There are no active employees to suggest.</p>
      ) : (
        <>
          <p
            className={cx(
              'flex gap-2 border-b border-line px-4 py-2.5 text-[13px]',
              data!.basis === 'experience' ? 'text-ink-2' : 'bg-high-soft/60 text-ink',
            )}
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {BASIS_NOTE[data!.basis]}
          </p>
          <div className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar name={top.user.name} size="md" />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-ink-3">Best match</span>
                  <span className="block truncate text-[17px] font-semibold text-ink">
                    {top.user.name}
                  </span>
                </span>
                <span className="ml-1 flex flex-col items-start gap-0.5">
                  <ScoreBar score={top.score} />
                  <span className="text-xs text-ink-3">{matchLabel(top.score)}</span>
                </span>
              </span>
              <Button variant="primary" onClick={() => setConfirm(top)} disabled={assigning}>
                Assign to {top.user.name.split(' ')[0]}
              </Button>
            </div>
            <CandidateDetail c={top} categoryLabel={label} />
          </div>

          {rest.length > 0 && (
            <div className="border-t border-line">
              <p className="px-4 pt-3 text-xs font-medium text-ink-3">Alternatives to compare</p>
              <ul className="divide-y divide-line">
                {rest.map((c) => (
                  <li key={c.user.id} className="px-4 py-3">
                    {/* On phones the score and buttons wrap under the name instead of squeezing it. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="flex min-w-0 flex-[1_1_16rem] items-center gap-3">
                        <Avatar name={c.user.name} size="sm" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink">
                            {c.user.name}
                          </span>
                          <span className="block text-xs text-ink-3">
                            {c.category.resolved} {label} handled · {outcome(c)} ·{' '}
                            {c.workload.active} active
                          </span>
                        </span>
                      </span>
                      <span className="ml-auto flex items-center gap-2">
                        <ScoreBar score={c.score} />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpen(open === c.user.id ? null : c.user.id)}
                          aria-expanded={open === c.user.id}
                        >
                          {open === c.user.id ? 'Hide' : 'Why'}
                        </Button>
                        <Button size="sm" onClick={() => setConfirm(c)} disabled={assigning}>
                          Assign
                        </Button>
                      </span>
                    </div>
                    {open === c.user.id && <CandidateDetail c={c} categoryLabel={label} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
            Scores compare these people for this request only; they are not a rating of anyone. Team
            history: {data!.teamSample} {label} resolution
            {data!.teamSample === 1 ? '' : 's'}.
          </p>
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={`Assign to ${confirm?.user.name}?`}
        body={`${confirm?.user.name} will own this request and see it in their queue. They currently have ${confirm?.workload.active ?? 0} active request(s).`}
        confirmLabel="Assign"
        loading={assigning}
        onConfirm={async () => {
          if (!confirm) return;
          await onAssign(confirm);
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </Panel>
  );
}

/**
 * One-line suggestion for compact places (create form, review queue): the best match and a
 * button to pick them. Picking only fills the field; the manager still confirms.
 */
export function SuggestionHint({
  data,
  onPick,
  className,
}: {
  data?: Recommendations;
  onPick: (c: Candidate) => void;
  className?: string;
}) {
  const top = data?.candidates[0];
  if (!top) return null;
  const why = top.reasons[0] ?? '';
  return (
    <p className={cx('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2', className)}>
      <Sparkles className="size-3.5 shrink-0 text-cobalt" aria-hidden />
      <span>
        Suggested: <span className="font-semibold text-ink">{top.user.name}</span>{' '}
        <span className="text-ink-3">
          ({matchLabel(top.score).toLowerCase()}, {top.workload.active} active)
        </span>
      </span>
      <button
        type="button"
        onClick={() => onPick(top)}
        className="font-medium text-cobalt hover:underline"
        title={why}
      >
        Use
      </button>
    </p>
  );
}
