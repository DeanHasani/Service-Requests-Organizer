import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Controller, useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, MessageSquare, MoreHorizontal, Phone } from 'lucide-react';
import {
  createRequestSchema,
  PRIORITIES,
  PRIORITY_LABEL,
  type CreateRequestInput,
} from '@deskflow/shared';
import type { z } from 'zod';
import { useCurrentUser } from '../lib/auth';
import { useAssignees, useCreateRequest } from '../lib/queries';
import { ApiError } from '../lib/api';
import { Button, Field, Input, PageHeader, Panel, Select, Textarea } from '../components/ui';
import { Segmented } from '../components/Segmented';
import { ContactField } from '../components/ContactField';

type FormValues = CreateRequestInput;

const sourceOptions = [
  { value: 'PHONE', label: 'Phone', icon: <Phone className="size-3.5" aria-hidden /> },
  { value: 'EMAIL', label: 'Email', icon: <Mail className="size-3.5" aria-hidden /> },
  { value: 'MESSAGE', label: 'Message', icon: <MessageSquare className="size-3.5" aria-hidden /> },
  { value: 'OTHER', label: 'Other', icon: <MoreHorizontal className="size-3.5" aria-hidden /> },
];
const priorityOptions = PRIORITIES.map((p) => ({
  value: p,
  label: PRIORITY_LABEL[p],
  tone:
    p === 'URGENT'
      ? 'peer-checked:text-urgent'
      : p === 'HIGH'
        ? 'peer-checked:text-high'
        : undefined,
}));

export function NewRequestPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const assignees = useAssignees();
  const create = useCreateRequest();
  // One idempotency key per form: a double click or a retry after a timeout cannot create a duplicate.
  const [clientRequestId] = useState(() => crypto.randomUUID());

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues, unknown, z.output<typeof createRequestSchema>>({
    resolver: zodResolver(createRequestSchema),
    mode: 'onTouched', // check each field when the user leaves it, then live while they fix it
    defaultValues: {
      source: 'PHONE',
      priority: 'NORMAL',
      assignedToId: null,
      requesterContact: '',
      clientRequestId,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const r = await create.mutateAsync(values);
      navigate(`/requests/${r.id}`);
    } catch (err) {
      // Map server field errors back onto the form.
      if (err instanceof ApiError && err.details) {
        for (const [field, msgs] of Object.entries(err.details)) {
          if (field !== '_' && msgs[0]) setError(field as Path<FormValues>, { message: msgs[0] });
        }
        const first = Object.keys(err.details).find((k) => k !== '_');
        if (first) setFocus(first as Path<FormValues>);
      }
    }
  });

  const isEmployee = user.role === 'EMPLOYEE';
  const busy = isSubmitting || create.isPending;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="New request"
        subtitle="Log a request from a call, email or message. Fields marked optional can be left empty."
      />
      <Panel>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 p-5 sm:p-6">
          <Field
            id="title"
            label="Title"
            error={errors.title?.message}
            hint="A short summary, e.g. “Printer on 2nd floor offline”."
          >
            <Input id="title" autoFocus aria-invalid={!!errors.title} {...register('title')} />
          </Field>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field id="requesterName" label="Requester name" error={errors.requesterName?.message}>
              <Input
                id="requesterName"
                autoComplete="off"
                aria-invalid={!!errors.requesterName}
                {...register('requesterName')}
              />
            </Field>
            <Controller
              name="requesterContact"
              control={control}
              render={({ field, fieldState }) => (
                <ContactField
                  id="requesterContact"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={!!fieldState.error}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>

          <Field id="description" label="Description" error={errors.description?.message}>
            <Textarea
              id="description"
              rows={5}
              aria-invalid={!!errors.description}
              {...register('description')}
            />
          </Field>

          <Segmented
            legend="Source"
            options={sourceOptions}
            registration={register('source')}
            error={errors.source?.message}
          />
          <Segmented
            legend="Priority"
            options={priorityOptions}
            registration={register('priority')}
            error={errors.priority?.message}
          />

          <Field
            id="assignedToId"
            label="Assignee"
            optional
            error={errors.assignedToId?.message}
            hint={
              isEmployee ? 'You can assign it to yourself or leave it for a manager.' : undefined
            }
          >
            <Select
              id="assignedToId"
              aria-invalid={!!errors.assignedToId}
              {...register('assignedToId', {
                setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
              })}
            >
              <option value="">Unassigned</option>
              {isEmployee ? (
                <option value={user.id}>Me ({user.name})</option>
              ) : (
                assignees.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.activeCount ? ` (${u.activeCount})` : ''}
                  </option>
                ))
              )}
            </Select>
          </Field>

          <div className="mt-2 flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Link
              to="/requests"
              className="inline-flex h-9 items-center justify-center rounded-control px-3.5 text-sm font-medium text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
            >
              Cancel
            </Link>
            <Button type="submit" variant="primary" loading={busy}>
              {busy ? 'Creating…' : 'Create request'}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}
