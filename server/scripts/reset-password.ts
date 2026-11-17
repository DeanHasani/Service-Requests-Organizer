/**
 * Account recovery for when no manager can sign in (for example, the only manager forgot their
 * password). Run on the server:
 *
 *   npm run user:reset-password -- someone@company.com
 *
 * Prints a one-time temporary password. The person signs in with it and must choose a new one.
 * All their existing sessions are ended.
 */
import { prisma } from '../src/db';
import { setTemporaryPassword } from '../src/services/users';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run user:reset-password -- <email>');
  process.exit(1);
}

const user = await prisma.user.findUnique({
  where: { email },
  select: { id: true, name: true, isActive: true },
});
if (!user) {
  console.error(`No account with the email ${email}`);
  process.exit(1);
}

if (!user.isActive) {
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  console.log(`${user.name}'s account was deactivated; it has been reactivated.`);
}
const temporaryPassword = await setTemporaryPassword(user.id);
console.log(`Temporary password for ${user.name} <${email}>: ${temporaryPassword}`);
console.log('They must choose a new password the next time they sign in.');
await prisma.$disconnect();
