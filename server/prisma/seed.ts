/**
 * Idempotent demo seed. Users are upserted by email; requests are keyed by a fixed
 * clientRequestId and skipped if they already exist, so re-running never duplicates.
 */
import bcrypt from 'bcryptjs';
import {
  PrismaClient,
  type ActionType,
  type Priority,
  type Source,
  type Status,
} from '@prisma/client';
import { formatReference, PRIORITY_LABEL, STATUS_LABEL } from '@deskflow/shared';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD;
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('Set SEED_PASSWORD (min 8 chars) in server/.env before seeding.');
  process.exit(1);
}

const USERS = [
  { key: 'manager', name: 'Growin Manager', email: 'growin@deskflow.test', role: 'MANAGER' },
  { key: 'dean', name: 'Dean Hasani', email: 'dean@deskflow.test', role: 'EMPLOYEE' },
  { key: 'roman', name: 'Roman Max', email: 'roman@deskflow.test', role: 'EMPLOYEE' },
  { key: 'roxanne', name: 'Roxanne Keys', email: 'roxanne@deskflow.test', role: 'EMPLOYEE' },
] as const;
type Key = (typeof USERS)[number]['key'];

type Seed = {
  title: string;
  description: string;
  requester: [name: string, contact: string];
  source: Source;
  priority: Priority;
  status: Status;
  by: Key;
  to?: Key;
  daysAgo: number;
  notes?: [Key, string][];
};

const REQUESTS: Seed[] = [
  {
    title: 'Printer on 2nd floor not connecting to network',
    description:
      'The HP LaserJet near the finance team shows "offline" for everyone since this morning. Power-cycling did not help. Finance needs to print invoices before the 3 PM courier pickup.',
    requester: ['Laura Bennett', 'laura.bennett@northwind.example'],
    source: 'PHONE',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    by: 'manager',
    to: 'dean',
    daysAgo: 1,
    notes: [
      [
        'dean',
        'Printer has a static IP that conflicts with a new laptop. Reserving a new address in DHCP now.',
      ],
    ],
  },
  {
    title: 'Laptop running very slowly after update',
    description:
      "Dell Latitude takes around 10 minutes to boot and apps freeze when switching windows. Started after last week's Windows update. User has a client presentation on Thursday.",
    requester: ['Marco Rossi', '+383 44 218 905'],
    source: 'PHONE',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'roman',
    to: 'roman',
    daysAgo: 2,
  },
  {
    title: 'Access setup for new hire: Jana Petrović',
    description:
      'Jana starts Monday in Customer Success. Needs email account, CRM login, shared drive access to "CS Team", and a laptop from stock.',
    requester: ['Ivana Novak (HR)', 'hr@northwind.example'],
    source: 'EMAIL',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    by: 'manager',
    to: 'roxanne',
    daysAgo: 3,
    notes: [
      ['roxanne', 'Email and CRM accounts created. Waiting on the laptop image to finish.'],
      ['manager', 'Please also add her to the weekly CS meeting calendar.'],
    ],
  },
  {
    title: 'Adobe Acrobat licence renewal',
    description:
      'Five Acrobat Pro licences expire at the end of the month. Marketing needs them renewed; check whether two can be dropped since two people left.',
    requester: ['Peter Hall', 'peter.hall@northwind.example'],
    source: 'EMAIL',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'manager',
    daysAgo: 4,
  },
  {
    title: 'Wi-Fi drops in meeting room B',
    description:
      'Video calls in meeting room B disconnect every 10 to 15 minutes. Other rooms are fine. Happens on both laptops and phones.',
    requester: ['Grace Kim', 'grace.kim@northwind.example'],
    source: 'MESSAGE',
    priority: 'URGENT',
    status: 'OPEN',
    by: 'dean',
    daysAgo: 0,
  },
  {
    title: 'Quarterly maintenance for server room AC',
    description:
      'Book the quarterly service visit for the server room air conditioning unit. Last visit was in August.',
    requester: ['Tom Becker (Facilities)', '+383 49 330 112'],
    source: 'PHONE',
    priority: 'LOW',
    status: 'RESOLVED',
    by: 'manager',
    to: 'dean',
    daysAgo: 12,
    notes: [['dean', 'Booked with CoolTech for Tuesday 9:00. Confirmation number CT-88412.']],
  },
  {
    title: 'Cannot access email on phone',
    description:
      'Outlook on iPhone keeps asking for the password and then fails. Webmail works fine. Possibly MFA related.',
    requester: ['Nina Schulz', 'nina.schulz@northwind.example'],
    source: 'EMAIL',
    priority: 'HIGH',
    status: 'RESOLVED',
    by: 'roman',
    to: 'roman',
    daysAgo: 6,
    notes: [
      ['roman', 'Removed the old account profile and re-registered MFA. User confirmed it works.'],
    ],
  },
  {
    title: 'Shared folder permissions for Finance archive',
    description:
      'Finance needs read-only access for the two new accountants to "Finance/Archive 2023". They should not be able to edit or delete files.',
    requester: ['Laura Bennett', 'laura.bennett@northwind.example'],
    source: 'EMAIL',
    priority: 'NORMAL',
    status: 'IN_PROGRESS',
    by: 'manager',
    to: 'roman',
    daysAgo: 2,
  },
  {
    title: 'Projector in training room shows no signal',
    description:
      'HDMI from laptops shows "no signal". Tried two different laptops and a different cable.',
    requester: ['Ahmed Saleh', 'ext. 214'],
    source: 'PHONE',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'roxanne',
    daysAgo: 1,
  },
  {
    title: 'Order replacement keyboard and mouse',
    description:
      'Keyboard has sticky keys after a coffee spill. Wireless mouse battery cover is broken.',
    requester: ['Lea Weber', 'lea.weber@northwind.example'],
    source: 'MESSAGE',
    priority: 'LOW',
    status: 'RESOLVED',
    by: 'roxanne',
    to: 'roxanne',
    daysAgo: 9,
  },
  {
    title: 'VPN disconnects when working from home',
    description:
      'VPN client drops every 30 minutes for the sales team working remotely. Started after the firewall firmware update.',
    requester: ['Jonas Frei (Sales)', 'jonas.frei@northwind.example'],
    source: 'EMAIL',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    by: 'manager',
    to: 'dean',
    daysAgo: 1,
    notes: [
      ['dean', 'Reproduced. Idle timeout on the firewall was reset to 30 min by the update.'],
      ['dean', 'Change request raised to restore the 8 h timeout tonight at 20:00.'],
    ],
  },
  {
    title: 'Update antivirus on reception PC',
    description: 'Antivirus on the reception PC shows definitions out of date for 14 days.',
    requester: ['Reception desk', 'ext. 100'],
    source: 'OTHER',
    priority: 'NORMAL',
    status: 'RESOLVED',
    by: 'roman',
    to: 'roxanne',
    daysAgo: 15,
  },
  {
    title: 'Monitor flickering at desk 14',
    description: 'Second monitor flickers every few seconds. Cable has been reseated.',
    requester: ['Oliver Brandt', 'oliver.brandt@northwind.example'],
    source: 'EMAIL',
    priority: 'LOW',
    status: 'OPEN',
    by: 'manager',
    daysAgo: 5,
  },
  {
    title: 'Restore deleted contract file',
    description:
      'A signed contract PDF was deleted from "Legal/Clients/Mercer" yesterday afternoon. Needs restoring from backup today.',
    requester: ['Hannah Ortiz (Legal)', '+383 45 771 020'],
    source: 'PHONE',
    priority: 'URGENT',
    status: 'RESOLVED',
    by: 'manager',
    to: 'roman',
    daysAgo: 3,
    notes: [
      ['roman', "Restored from last night's snapshot to the original location. Legal confirmed."],
    ],
  },
  {
    title: 'Set up shared calendar for the support rota',
    description: 'Team leads want a shared calendar showing who is on support duty each week.',
    requester: ['Grace Kim', 'grace.kim@northwind.example'],
    source: 'EMAIL',
    priority: 'LOW',
    status: 'OPEN',
    by: 'dean',
    to: 'roxanne',
    daysAgo: 7,
  },
  {
    title: 'Badge reader at side entrance not working',
    description: 'Staff badges are not recognised at the side entrance. Main entrance works.',
    requester: ['Tom Becker (Facilities)', '+383 49 330 112'],
    source: 'PHONE',
    priority: 'HIGH',
    status: 'OPEN',
    by: 'roxanne',
    daysAgo: 0,
  },
  {
    title: 'Install accounting software update',
    description:
      'Vendor released a tax-rate patch that must be installed on all four finance PCs before month end.',
    requester: ['Laura Bennett', 'laura.bennett@northwind.example'],
    source: 'EMAIL',
    priority: 'HIGH',
    status: 'RESOLVED',
    by: 'manager',
    to: 'dean',
    daysAgo: 10,
  },
  {
    title: 'Conference phone has echo',
    description: 'Callers hear an echo when using the Polycom in the boardroom.',
    requester: ['Executive assistant', 'ext. 301'],
    source: 'MESSAGE',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'roman',
    daysAgo: 2,
  },
];

const RANK: Record<Priority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };
const HOUR = 3600_000;

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD!, 12);
  const ids = {} as Record<Key, { id: number; name: string }>;
  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, role: u.role, passwordHash },
    });
    ids[u.key] = { id: row.id, name: row.name };
  }

  let created = 0;
  for (const [i, s] of REQUESTS.entries()) {
    const clientRequestId = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    if (await prisma.request.findUnique({ where: { clientRequestId }, select: { id: true } }))
      continue;

    await prisma.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { name: 'request' },
        create: { name: 'request', value: 1 },
        update: { value: { increment: 1 } },
      });
      const t0 = new Date(Date.now() - s.daysAgo * 24 * HOUR - (i % 5) * HOUR - 2 * HOUR);
      const at = (h: number) => new Date(t0.getTime() + h * HOUR);
      const creator = ids[s.by];
      const assignee = s.to ? ids[s.to] : null;
      const resolved = s.status === 'RESOLVED';
      const resolver = assignee ?? ids.manager;
      const lastAt = resolved
        ? at(5)
        : s.status === 'IN_PROGRESS'
          ? at(1)
          : assignee
            ? at(0.25)
            : t0;
      // Managers set a deadline when they assign work: sooner for more urgent requests.
      const dueAt =
        assignee && !resolved
          ? at(24 * { URGENT: 1, HIGH: 3, NORMAL: 7, LOW: 14 }[s.priority])
          : null;

      const req = await tx.request.create({
        data: {
          clientRequestId,
          referenceNumber: formatReference(counter.value),
          title: s.title,
          description: s.description,
          requesterName: s.requester[0],
          requesterContact: s.requester[1],
          source: s.source,
          priority: s.priority,
          priorityRank: RANK[s.priority],
          status: s.status,
          assignedToId: assignee?.id ?? null,
          createdById: creator.id,
          resolvedById: resolved ? resolver.id : null,
          resolvedAt: resolved ? at(5) : null,
          dueAt,
          createdAt: t0,
          updatedAt: lastAt,
        },
      });

      const log: {
        actionType: ActionType;
        actorId: number;
        createdAt: Date;
        description: string;
        fieldName?: string;
        oldValue?: string | null;
        newValue?: string | null;
      }[] = [
        {
          actionType: 'CREATED',
          actorId: creator.id,
          createdAt: t0,
          description: `created ${req.referenceNumber}`,
        },
      ];
      if (assignee) {
        log.push({
          actionType: 'ASSIGNED',
          actorId: ids.manager.id,
          createdAt: at(0.25),
          fieldName: 'assignedTo',
          oldValue: null,
          newValue: assignee.name,
          description: `assigned the request to ${assignee.name}`,
        });
      }
      if (dueAt) {
        const label = dueAt.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        log.push({
          actionType: 'DEADLINE_CHANGED',
          actorId: ids.manager.id,
          createdAt: at(0.25),
          fieldName: 'dueAt',
          oldValue: null,
          newValue: label,
          description: `set the deadline to ${label}`,
        });
      }
      if ((s.status === 'IN_PROGRESS' || resolved) && assignee) {
        log.push({
          actionType: 'STATUS_CHANGED',
          actorId: assignee.id,
          createdAt: at(1),
          fieldName: 'status',
          oldValue: STATUS_LABEL.OPEN,
          newValue: STATUS_LABEL.IN_PROGRESS,
          description: `changed status to ${STATUS_LABEL.IN_PROGRESS}`,
        });
      }
      if (s.priority === 'URGENT' && !resolved) {
        log.push({
          actionType: 'PRIORITY_CHANGED',
          actorId: ids.manager.id,
          createdAt: at(0.1),
          fieldName: 'priority',
          oldValue: PRIORITY_LABEL.HIGH,
          newValue: PRIORITY_LABEL.URGENT,
          description: `changed priority from ${PRIORITY_LABEL.HIGH} to ${PRIORITY_LABEL.URGENT}`,
        });
      }
      if (resolved) {
        log.push({
          actionType: 'RESOLVED',
          actorId: resolver.id,
          createdAt: at(5),
          fieldName: 'status',
          oldValue: assignee ? STATUS_LABEL.IN_PROGRESS : STATUS_LABEL.OPEN,
          newValue: STATUS_LABEL.RESOLVED,
          description: 'resolved the request',
        });
      }
      await tx.activityLog.createMany({ data: log.map((l) => ({ ...l, requestId: req.id })) });

      for (const [n, [author, content]] of (s.notes ?? []).entries()) {
        const when = at(1.5 + n);
        await tx.requestNote.create({
          data: {
            requestId: req.id,
            authorId: ids[author].id,
            content,
            createdAt: when,
            updatedAt: when,
          },
        });
      }
    });
    created++;
  }

  console.log(
    `Seed complete: ${USERS.length} users ensured, ${created} new requests (${REQUESTS.length - created} already present).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
