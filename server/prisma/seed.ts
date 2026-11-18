/**
 * Idempotent demo seed. Users are upserted by email; requests are keyed by a fixed
 * clientRequestId and skipped if they already exist, so re-running never duplicates.
 *
 * `--fresh` (npm run db:demo -w server) first removes ALL requests, notes, history,
 * notifications and sessions, and any account that is not a demo account, then seeds again, so
 * the data is exactly the demo story with dates relative to now. Use it before a presentation.
 */
import bcrypt from 'bcryptjs';
import {
  PrismaClient,
  type ActionType,
  type Category,
  type Priority,
  type Source,
  type Status,
} from '@prisma/client';
import { formatReference, PRIORITY_LABEL, STATUS_LABEL } from '@deskflow/shared';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD;
const FRESH = process.argv.includes('--fresh');
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('Set SEED_PASSWORD (min 8 chars) in server/.env before seeding.');
  process.exit(1);
}

const USERS = [
  { key: 'manager', name: 'Growin Manager', email: 'growin@deskflow.test', role: 'MANAGER' },
  { key: 'dean', name: 'Dean Hasani', email: 'dean@deskflow.test', role: 'EMPLOYEE' },
  { key: 'roman', name: 'Roman Max', email: 'roman@deskflow.test', role: 'EMPLOYEE' },
  { key: 'roxanne', name: 'Roxanne Keys', email: 'roxanne@deskflow.test', role: 'EMPLOYEE' },
  { key: 'mira', name: 'Mira Shala', email: 'mira@deskflow.test', role: 'EMPLOYEE' },
  { key: 'theo', name: 'Theo Lang', email: 'theo@deskflow.test', role: 'EMPLOYEE' },
] as const;
type Key = (typeof USERS)[number]['key'];

/** Categories for the hand-written demo requests (also backfilled on existing databases). */
const CATEGORY_BY_TITLE: Record<string, Category> = {
  'Printer on 2nd floor not connecting to network': 'NETWORK',
  'Laptop running very slowly after update': 'SOFTWARE',
  'Access setup for new hire: Jana Petrović': 'ACCESS',
  'Adobe Acrobat licence renewal': 'SOFTWARE',
  'Wi-Fi drops in meeting room B': 'NETWORK',
  'Quarterly maintenance for server room AC': 'FACILITIES',
  'Cannot access email on phone': 'ACCESS',
  'Shared folder permissions for Finance archive': 'ACCESS',
  'Projector in training room shows no signal': 'HARDWARE',
  'Order replacement keyboard and mouse': 'HARDWARE',
  'VPN disconnects when working from home': 'NETWORK',
  'Update antivirus on reception PC': 'SOFTWARE',
  'Monitor flickering at desk 14': 'HARDWARE',
  'Restore deleted contract file': 'OTHER',
  'Set up shared calendar for the support rota': 'SOFTWARE',
  'Badge reader at side entrance not working': 'FACILITIES',
  'Install accounting software update': 'SOFTWARE',
  'Conference phone has echo': 'HARDWARE',
};

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
  /** Category, when the title is not in CATEGORY_BY_TITLE. */
  category?: Category;
  /** Deadline in hours from now (negative: already overdue). Overrides the default rule. */
  due?: number;
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
  // ----- added with Mira and Theo: work in flight that shows off deadlines and smart assignment
  {
    title: 'Boardroom air conditioning rattling loudly',
    description:
      'The AC unit above the boardroom table started rattling this morning. The board meets there tomorrow at 9:00 with external guests.',
    requester: ['Executive assistant', 'ext. 301'],
    source: 'PHONE',
    category: 'FACILITIES',
    priority: 'HIGH',
    status: 'OPEN',
    by: 'manager',
    daysAgo: 0,
    due: 14,
  },
  {
    title: 'CRM add-on fails to install on sales laptops',
    description:
      'The new quoting add-on for the CRM stops at 80% with error 0x80070643 on three sales laptops. Sales want it before the pricing launch.',
    requester: ['Tom Becker', 'tom.becker@northwind.example'],
    source: 'EMAIL',
    category: 'SOFTWARE',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'manager',
    daysAgo: 0,
    due: 20,
  },
  {
    title: 'Guest Wi-Fi for client workshop on Friday',
    description:
      'Twenty guests from a client attend a workshop in the training room. They need a separate guest network with a printed voucher per person.',
    requester: ['Grace Kim', 'ext. 118'],
    source: 'MESSAGE',
    category: 'NETWORK',
    priority: 'HIGH',
    status: 'OPEN',
    by: 'manager',
    daysAgo: 1,
    due: 30,
  },
  {
    title: 'Smart card printer out of ribbon',
    description:
      'The badge printer at reception shows "ribbon empty". Two new starters need badges next week.',
    requester: ['Reception', 'ext. 100'],
    source: 'MESSAGE',
    category: 'HARDWARE',
    priority: 'LOW',
    status: 'OPEN',
    by: 'roxanne',
    daysAgo: 1,
  },
  {
    title: 'Core switch fan alarm in comms room',
    description:
      'The core switch reports a fan failure and its temperature is climbing. If it overheats, the whole office loses the network.',
    requester: ['Monitoring alert', 'noc@northwind.example'],
    source: 'OTHER',
    category: 'NETWORK',
    priority: 'URGENT',
    status: 'IN_PROGRESS',
    by: 'manager',
    to: 'dean',
    daysAgo: 0,
    due: 5,
    notes: [
      [
        'dean',
        'Spare fan module is in the store room. Swapping it during lunch to keep the outage short.',
      ],
    ],
  },
  {
    title: 'Office move: set up six desks on the 4th floor',
    description:
      'Customer Success moves upstairs on Monday. Six desks need power, network points tested, monitors mounted and the floor plan updated.',
    requester: ['Ivana Novak (HR)', 'hr@northwind.example'],
    source: 'EMAIL',
    category: 'FACILITIES',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    by: 'manager',
    to: 'mira',
    daysAgo: 2,
    due: 52,
    notes: [
      ['mira', 'Electrician booked for Thursday morning. Desks and monitor arms arrive Wednesday.'],
      ['manager', 'Please check the network points with Dean before Friday.'],
    ],
  },
  {
    title: 'Book AV equipment for the quarterly town hall',
    description:
      'Two wireless microphones, the portable speaker and a livestream camera for the town hall in the canteen.',
    requester: ['Laura Bennett', 'laura.bennett@northwind.example'],
    source: 'EMAIL',
    category: 'OTHER',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'manager',
    to: 'mira',
    daysAgo: 1,
    due: 96,
  },
  {
    title: 'Power BI licences for the finance analysts',
    description:
      'Three analysts need Power BI Pro to share the new cash-flow dashboard. Check whether the unused Visio licences can be swapped.',
    requester: ['Peter Hall', 'peter.hall@northwind.example'],
    source: 'EMAIL',
    category: 'SOFTWARE',
    priority: 'NORMAL',
    status: 'IN_PROGRESS',
    by: 'theo',
    to: 'theo',
    daysAgo: 1,
    due: 44,
    notes: [['theo', 'Two Visio licences are unused. Asked the vendor to swap them for Power BI.']],
  },
  {
    title: 'Payroll portal single sign-on error',
    description:
      'Staff in the warehouse get "SAML response not valid" when opening the payroll portal. Payslips go out on Friday.',
    requester: ['Marco Silva', 'ext. 214'],
    source: 'PHONE',
    category: 'ACCESS',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    by: 'manager',
    to: 'roxanne',
    daysAgo: 1,
    due: 9,
    notes: [
      [
        'roxanne',
        'The signing certificate expired yesterday. Uploading the new one with the vendor now.',
      ],
    ],
  },
  {
    title: 'Replace cracked laptop screen',
    description: 'Screen cracked in transit. The laptop still works with an external monitor.',
    requester: ['Priya Nair', '+44 20 7946 0321'],
    source: 'PHONE',
    category: 'HARDWARE',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'manager',
    to: 'roman',
    daysAgo: 1,
    due: 100,
  },
  {
    title: 'Shared mailbox for Procurement',
    description:
      'Procurement wants procurement@ as a shared mailbox for four people, with send-as rights.',
    requester: ['Peter Hall', 'peter.hall@northwind.example'],
    source: 'EMAIL',
    category: 'ACCESS',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'manager',
    to: 'theo',
    daysAgo: 2,
    due: -3,
  },
  {
    title: 'Email signature template for Marketing',
    description: 'New brand colours: update the Outlook signature template for the marketing team.',
    requester: ['Peter Hall', 'peter.hall@northwind.example'],
    source: 'EMAIL',
    category: 'SOFTWARE',
    priority: 'LOW',
    status: 'RESOLVED',
    by: 'manager',
    to: 'theo',
    daysAgo: 4,
  },
  {
    title: 'Parking barrier remote not working',
    description: 'The remote for the car park barrier stopped working for the delivery van.',
    requester: ['Facilities desk', 'ext. 150'],
    source: 'PHONE',
    category: 'FACILITIES',
    priority: 'NORMAL',
    status: 'RESOLVED',
    by: 'mira',
    to: 'mira',
    daysAgo: 3,
  },
  {
    title: 'Move printer to the new HR office',
    description:
      'HR moved rooms. Their printer needs moving, a new network point and the queue updated on their laptops.',
    requester: ['Ivana Novak (HR)', 'hr@northwind.example'],
    source: 'MESSAGE',
    category: 'HARDWARE',
    priority: 'NORMAL',
    status: 'OPEN',
    by: 'manager',
    daysAgo: 0,
  },
];

const RANK: Record<Priority, number> = { LOW: 0, NORMAL: 1, HIGH: 2, URGENT: 3 };
const HOUR = 3600_000;

/** --fresh: remove everything except the demo accounts, so only the demo story remains. */
async function wipe() {
  const demo = USERS.map((u) => u.email);
  await prisma.$transaction([
    prisma.notification.deleteMany({}),
    prisma.activityLog.deleteMany({}),
    prisma.requestNote.deleteMany({}),
    prisma.request.deleteMany({}),
    prisma.session.deleteMany({}),
    prisma.user.deleteMany({ where: { email: { notIn: demo } } }),
    prisma.counter.deleteMany({}),
  ]);
}

async function main() {
  if (FRESH) await wipe();
  const passwordHash = await bcrypt.hash(PASSWORD!, 12);
  const ids = {} as Record<Key, { id: number; name: string }>;
  for (const u of USERS) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      // Fresh: put demo accounts back exactly as described (password, role, active).
      update: FRESH
        ? { name: u.name, role: u.role, passwordHash, isActive: true, mustChangePassword: false }
        : {},
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
      const dueAt = resolved
        ? null
        : s.due !== undefined
          ? new Date(Date.now() + s.due * HOUR)
          : assignee
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
          category: s.category ?? CATEGORY_BY_TITLE[s.title] ?? 'OTHER',
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

  // Databases seeded before categories existed: give the demo requests theirs.
  for (const [title, category] of Object.entries(CATEGORY_BY_TITLE)) {
    await prisma.request.updateMany({ where: { title, category: null }, data: { category } });
  }

  const history = await seedHistory(ids);

  console.log(
    `Seed complete: ${USERS.length} users ensured, ${created} new requests (${REQUESTS.length - created} already present), ${history} history requests added.`,
  );
}

// ---------- resolved history, so analytics has a few months to show ----------

const HISTORY_TITLES: Record<Category, string[]> = {
  HARDWARE: [
    'Docking station not charging laptop',
    'Replace broken headset',
    'Second monitor not detected',
    'Printer jams on double-sided jobs',
    'Laptop battery swelling',
    'Barcode scanner not reading labels',
    'Replace worn keyboard at reception',
    'Set up new laptop for transfer',
  ],
  SOFTWARE: [
    'Outlook keeps asking for password',
    'Install design tools for new starter',
    'Excel crashes when opening large file',
    'Teams camera not working after update',
    'Renew project management licences',
    'PDF editor missing after reimage',
    'Accounting software update fails',
    'Browser extension blocked by policy',
  ],
  NETWORK: [
    'Slow connection on 3rd floor',
    'Guest Wi-Fi password not working',
    'Cannot reach shared drive from home',
    'Network port dead at desk 31',
    'VPN drops every 20 minutes',
    'Wi-Fi dead zone in warehouse office',
    'Firewall rule for supplier portal',
    'Replace faulty patch cable in comms room',
  ],
  ACCESS: [
    'Reset password for warehouse account',
    'Add user to Sales distribution list',
    'Remove access for leaver',
    'Grant read access to HR folder',
    'Unlock account after failed sign-ins',
    'MFA reset for new phone',
    'Contractor access to project site',
    'Mailbox delegation for assistant',
  ],
  FACILITIES: [
    'Heating not working in meeting room A',
    'Replace light in corridor',
    'Fix lock on storage cupboard',
    'Kitchen dishwasher leaking',
    'Blinds stuck in meeting room C',
    'Water cooler needs servicing',
    'Door access fob for new starter',
    'Rearrange desks for team move',
  ],
  OTHER: [
    'Recover file from last week backup',
    'Book equipment for town hall',
    'Label cables in comms room',
    'Archive old project mailboxes',
    'Order welcome kit for new starters',
    'Set up room for training day',
    'Collect old laptops for recycling',
    'Arrange courier for returned devices',
  ],
};
/** Typical hours to resolve, so the categories differ the way they would in real life. */
const TYPICAL_HOURS: Record<Category, number> = {
  HARDWARE: 30,
  SOFTWARE: 16,
  NETWORK: 40,
  ACCESS: 5,
  FACILITIES: 72,
  OTHER: 12,
};
const HISTORY_COUNT = 160;
const HISTORY_CATEGORIES: Category[] = [
  'SOFTWARE',
  'HARDWARE',
  'ACCESS',
  'NETWORK',
  'FACILITIES',
  'SOFTWARE',
  'OTHER',
  'HARDWARE',
  'ACCESS',
  'NETWORK',
  'FACILITIES',
  'SOFTWARE',
];
const PEOPLE: [string, string][] = [
  ['Laura Bennett', 'laura.bennett@northwind.example'],
  ['Marco Silva', 'ext. 214'],
  ['Priya Nair', '+44 20 7946 0321'],
  ['Tom Becker', 'tom.becker@northwind.example'],
  ['Grace Kim', 'ext. 118'],
];

type Worker = 'dean' | 'roman' | 'roxanne' | 'mira' | 'theo';
/**
 * How each demo employee does in each category: how often they get that kind of work (weight),
 * how long they take against the typical time (speed, lower is faster), and how often a fix of
 * theirs gets reopened. Each has a clear story, so smart assignment has something real to tell
 * apart:
 * - Dean: the network person (switches, VPN, Wi-Fi); slow and error-prone on building issues.
 * - Roman: hardware fixer (laptops, printers, peripherals); avoids software installs.
 * - Roxanne: accounts and access (onboarding, MFA, permissions), with software as a second skill.
 * - Mira: office operations (facilities, moves, events and errands), handy with hardware.
 * - Theo: software and licences, the second-best on the network; not one for facilities.
 */
const SKILL: Record<Worker, Record<Category, [weight: number, speed: number, reopen: number]>> = {
  dean: {
    NETWORK: [7, 0.55, 0.03],
    SOFTWARE: [2, 0.9, 0.08],
    HARDWARE: [1.5, 1, 0.1],
    ACCESS: [1, 1.3, 0.2],
    FACILITIES: [0.5, 1.4, 0.25],
    OTHER: [1.5, 1, 0.08],
  },
  roman: {
    HARDWARE: [7, 0.6, 0.04],
    FACILITIES: [2.5, 0.9, 0.08],
    NETWORK: [1.5, 1.1, 0.12],
    ACCESS: [1, 1, 0.1],
    SOFTWARE: [0.8, 1.5, 0.3],
    OTHER: [1.5, 1, 0.1],
  },
  roxanne: {
    ACCESS: [7, 0.5, 0.02],
    SOFTWARE: [2.5, 0.85, 0.06],
    FACILITIES: [0.8, 1.1, 0.1],
    HARDWARE: [1, 1.3, 0.2],
    NETWORK: [0.8, 1.6, 0.3],
    OTHER: [1.5, 0.9, 0.05],
  },
  mira: {
    FACILITIES: [7, 0.55, 0.03],
    OTHER: [5, 0.6, 0.04],
    HARDWARE: [2.5, 0.85, 0.08],
    ACCESS: [1, 1.1, 0.1],
    SOFTWARE: [0.7, 1.4, 0.25],
    NETWORK: [0.5, 1.7, 0.3],
  },
  theo: {
    SOFTWARE: [7, 0.5, 0.03],
    NETWORK: [3, 0.8, 0.06],
    ACCESS: [2, 0.9, 0.08],
    HARDWARE: [1, 1.2, 0.15],
    OTHER: [1, 1, 0.1],
    FACILITIES: [0.4, 1.6, 0.3],
  },
};
const WORKERS: Worker[] = ['dean', 'roman', 'roxanne', 'mira', 'theo'];
/** Repeatable "random" number in [0, 1) for request k, so the seed is the same every time. */
const noise = (k: number, salt: number) => {
  // mulberry32 step on a mixed seed: evenly spread, and the same every run.
  let t = (Math.imul(k + 1, 2654435761) ^ Math.imul(salt + 1, 974711)) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Earlier versions of the demo history, replaced when found. */
const OLD_HISTORY_PREFIXES = ['00000000-0000-4000-9000-', '00000000-0000-4000-9100-'];
const HISTORY_PREFIX = '00000000-0000-4000-9200-';

/**
 * Resolved requests spread over the last four months, keyed like the main seed so re-running
 * adds nothing twice. Who handled each one, how fast, and whether it was reopened follow SKILL;
 * older work also took longer, so the trend shows the team getting faster. Replaces the first
 * version of this demo history (which rotated work evenly) if a database still has it.
 */
async function seedHistory(ids: Record<Key, { id: number; name: string }>) {
  const old = await prisma.request.findMany({
    where: { OR: OLD_HISTORY_PREFIXES.map((p) => ({ clientRequestId: { startsWith: p } })) },
    select: { id: true },
  });
  if (old.length) {
    const oldIds = old.map((o) => o.id);
    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { requestId: { in: oldIds } } }),
      prisma.activityLog.deleteMany({ where: { requestId: { in: oldIds } } }),
      prisma.requestNote.deleteMany({ where: { requestId: { in: oldIds } } }),
      prisma.request.deleteMany({ where: { id: { in: oldIds } } }),
    ]);
  }
  const priorities: Priority[] = ['NORMAL', 'HIGH', 'LOW', 'NORMAL', 'URGENT', 'NORMAL'];
  const sources: Source[] = ['EMAIL', 'PHONE', 'MESSAGE', 'EMAIL', 'OTHER'];
  let added = 0;
  for (let k = 0; k < HISTORY_COUNT; k++) {
    const clientRequestId = `${HISTORY_PREFIX}${String(k + 1).padStart(12, '0')}`;
    if (await prisma.request.findUnique({ where: { clientRequestId }, select: { id: true } }))
      continue;
    const category = HISTORY_CATEGORIES[k % HISTORY_CATEGORIES.length]!;
    const titles = HISTORY_TITLES[category];
    const title = titles[Math.floor(k / HISTORY_CATEGORIES.length) % titles.length]!;
    const daysAgo = 4 + ((k * 37) % 116);
    // Pick who handled it, weighted by how often each person gets this kind of work.
    const weights = WORKERS.map((w) => SKILL[w][category][0]);
    let pick = noise(k, 1) * weights.reduce((a, b) => a + b, 0);
    const who = WORKERS.find((_, i) => (pick -= weights[i]!) < 0) ?? WORKERS[0]!;
    const [, speed, reopenChance] = SKILL[who][category];
    const worker = ids[who];
    const manager = ids.manager;
    const creator = k % 3 === 0 ? worker : manager;
    const priority = priorities[k % priorities.length]!;
    const [requesterName, requesterContact] = PEOPLE[k % PEOPLE.length]!;
    // Older requests were slower: up to about twice the typical time four months ago.
    const pace = 0.6 + (daysAgo / 120) * 0.9 + noise(k, 2) * 0.35;
    const took = Math.max(0.5, TYPICAL_HOURS[category] * speed * pace);
    const reopened = noise(k, 3) < reopenChance;

    const t0 = new Date(Date.now() - daysAgo * 24 * HOUR - ((k * 5) % 8) * HOUR);
    const at = (h: number) => new Date(t0.getTime() + h * HOUR);
    const firstFix = at(took);
    const finalFix = reopened ? at(took + 20 + took * 0.5) : firstFix;

    await prisma.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { name: 'request' },
        create: { name: 'request', value: 1 },
        update: { value: { increment: 1 } },
      });
      const req = await tx.request.create({
        data: {
          clientRequestId,
          referenceNumber: formatReference(counter.value),
          title,
          description: `${title}. Logged from a ${sources[k % sources.length]!.toLowerCase()} request and handled by the support team.`,
          requesterName,
          requesterContact,
          source: sources[k % sources.length]!,
          category,
          priority,
          priorityRank: RANK[priority],
          status: 'RESOLVED',
          version: reopened ? 4 : 2,
          assignedToId: worker.id,
          createdById: creator.id,
          resolvedById: worker.id,
          resolvedAt: finalFix,
          createdAt: t0,
          updatedAt: finalFix,
        },
      });
      const status = (from: Status, to: Status) => ({
        fieldName: 'status',
        oldValue: STATUS_LABEL[from],
        newValue: STATUS_LABEL[to],
      });
      const log = [
        {
          actionType: 'CREATED' as const,
          actorId: creator.id,
          createdAt: t0,
          description: `created ${req.referenceNumber}`,
        },
        {
          actionType: 'ASSIGNED' as const,
          actorId: manager.id,
          createdAt: at(0.3),
          fieldName: 'assignedTo',
          oldValue: null,
          newValue: worker.name,
          description: `assigned the request to ${worker.name}`,
        },
        {
          actionType: 'STATUS_CHANGED' as const,
          actorId: worker.id,
          createdAt: at(Math.min(1, took / 2)),
          ...status('OPEN', 'IN_PROGRESS'),
          description: `changed status to ${STATUS_LABEL.IN_PROGRESS}`,
        },
        {
          actionType: 'RESOLVED' as const,
          actorId: worker.id,
          createdAt: firstFix,
          ...status('IN_PROGRESS', 'RESOLVED'),
          description: 'resolved the request',
        },
        ...(reopened
          ? [
              {
                actionType: 'REOPENED' as const,
                actorId: manager.id,
                createdAt: at(took + 20),
                ...status('RESOLVED', 'OPEN'),
                description: `reopened the request (previously resolved by ${worker.name})`,
              },
              {
                actionType: 'RESOLVED' as const,
                actorId: worker.id,
                createdAt: finalFix,
                ...status('OPEN', 'RESOLVED'),
                description: 'resolved the request',
              },
            ]
          : []),
      ];
      await tx.activityLog.createMany({ data: log.map((l) => ({ ...l, requestId: req.id })) });
    });
    added++;
  }
  return added;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
