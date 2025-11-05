import { getUserByEmail, createUserForCLI } from '@/lib/cli/users';
import { success, error } from '../../utils/output';

function printUsage() {
  console.error('Usage: pnpm cli users create <email> [--name="Full Name"] [--admin]');
  console.error('');
  console.error('Options:');
  console.error('  --name="Full Name"   Optional display name');
  console.error('  --admin              Create the user with admin privileges');
  console.error('');
  console.error('Examples:');
  console.error('  pnpm cli users create user@example.com');
  console.error('  pnpm cli users create admin@example.com --name="Site Admin" --admin');
}

export async function createUserCommand() {
  const args = process.argv.slice(4);
  const emailArg = args.find((arg) => !arg.startsWith('--'));

  if (!emailArg) {
    printUsage();
    process.exit(1);
  }

  const email = emailArg.trim().toLowerCase();

  if (!email.includes('@')) {
    error('Email must contain "@"');
    process.exit(1);
  }

  let name: string | undefined;
  let isAdmin = false;

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--name=')) {
      name = arg.slice('--name='.length).trim();
    } else if (arg === '--admin') {
      isAdmin = true;
    } else if (!arg.startsWith('--')) {
      // already consumed positional email
      continue;
    } else {
      error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  console.log(`\n🔧 Creating user...`);

  try {
    // Check if user already exists
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      error(`User already exists: ${email}`);
      console.error('Use "pnpm cli users grant-admin" if you need to update permissions.');
      process.exit(1);
    }

    const user = await createUserForCLI({ email, name, isAdmin });

    success(`User created with ID ${user.id}`);
    console.log(`  Email: ${user.email}`);
    if (user.name) {
      console.log(`  Name: ${user.name}`);
    }
    console.log(`  Admin: ${user.isAdmin === 1 ? 'Yes' : 'No'}`);

    if (!isAdmin) {
      console.log(`\n👉 Need admin access? Run: pnpm cli users grant-admin ${email}`);
    }
    console.log(`👉 Generate a login link with: pnpm cli users login-url ${email}`);
    console.log('');
  } catch (err: any) {
    error(`Failed to create user: ${err.message}`);
    process.exit(1);
  }
}
