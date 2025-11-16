import { grantAdminForCLI, getUserByEmail } from '@/lib/cli/users';
import { success, error } from '../../utils/output';

export async function grantAdminCommand() {
  const args = process.argv.slice(4);
  const email = args[0];

  if (!email || email.startsWith('--')) {
    console.error('Usage: pnpm cli users grant-admin <email>');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli users grant-admin user@example.com');
    process.exit(1);
  }

  console.log(`\n🔐 Granting admin privileges to: ${email}...\n`);

  try {
    // Check if user exists first
    const existingUser = await getUserByEmail(email);
    if (!existingUser) {
      error(`User not found: ${email}`);
      console.error(`\nMake sure the user has logged in at least once to create their account.`);
      process.exit(1);
    }

    if (existingUser.isAdmin === 1) {
      console.log(`User ${email} already has admin privileges.\n`);
      process.exit(0);
    }

    const user = await grantAdminForCLI(email);

    success(`${email} is now an admin.`);
    console.log(`  User ID: ${user.id}`);
    if (user.name) {
      console.log(`  Name: ${user.name}`);
    }
    console.log('');
  } catch (err: any) {
    error(`Failed to grant admin: ${err.message}`);
    process.exit(1);
  }
}
