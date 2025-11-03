import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

function printUsage() {
  console.error('Usage: pnpm cli users create <email> [--name="Full Name"] [--admin] [--remote]');
  console.error('');
  console.error('Options:');
  console.error('  --name="Full Name"   Optional display name');
  console.error('  --admin              Create the user with admin privileges');
  console.error('  --remote             Run against the production database');
  console.error('');
  console.error('Examples:');
  console.error('  pnpm cli users create user@example.com');
  console.error('  pnpm cli users create admin@example.com --name="Site Admin" --admin');
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
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
    console.error('Error: email must contain "@"');
    process.exit(1);
  }

  let name: string | null = null;
  let isAdmin = false;
  let isRemote = false;

  for (const arg of args.slice(1)) {
    if (arg.startsWith('--name=')) {
      name = arg.slice('--name='.length).trim();
    } else if (arg === '--admin') {
      isAdmin = true;
    } else if (arg === '--remote') {
      isRemote = true;
    } else if (!arg.startsWith('--')) {
      // already consumed positional email
      continue;
    } else {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  const locationFlag = isRemote ? '--remote' : '--local';
  const locationLabel = isRemote ? 'production' : 'local';

  console.log(`\n🔧 Creating user in ${locationLabel} database...`);

  const escapedEmail = escapeSql(email);
  const escapedName = name ? `'${escapeSql(name)}'` : 'NULL';
  const adminValue = isAdmin ? 1 : 0;
  const now = Math.floor(Date.now() / 1000);
  const userId = randomUUID();

  try {
    // Check if user already exists
    const checkCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "SELECT id, email, is_admin FROM users WHERE email = '${escapedEmail}';"`;
    const checkResult = execSync(checkCmd, { encoding: 'utf-8', stdio: 'pipe' });

    if (!checkResult.includes('Query returned no results') && !checkResult.includes('0 rows')) {
      console.error(`\n❌ User already exists: ${email}`);
      console.error('Use "pnpm cli users grant-admin" if you need to update permissions.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Failed to check for existing user:', error.message);
    process.exit(1);
  }

  try {
    const insertCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "INSERT INTO users (id, email, name, is_admin, created_at, updated_at) VALUES ('${userId}', '${escapedEmail}', ${escapedName}, ${adminValue}, ${now}, ${now});"`;
    const insertResult = execSync(insertCmd, { encoding: 'utf-8', stdio: 'pipe' });
    console.log(insertResult);
  } catch (error: any) {
    console.error('\n❌ Failed to insert user:', error.message);
    process.exit(1);
  }

  try {
    const verifyCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "SELECT id, email, name, is_admin, datetime(created_at, 'unixepoch') AS created_at FROM users WHERE email = '${escapedEmail}';"`;
    const verifyResult = execSync(verifyCmd, { encoding: 'utf-8', stdio: 'pipe' });
    console.log(verifyResult);
  } catch (error: any) {
    console.error('\n⚠️  User was created but verification query failed:', error.message);
    process.exit(1);
  }

  console.log(`\n✅ User created with ID ${userId}`);
  if (!isAdmin) {
    console.log('👉 Need admin access? Run: pnpm cli users grant-admin', email, isRemote ? '--remote' : '');
  }
  console.log('👉 Generate a login link with: pnpm cli users login-url', email);
  console.log('');
}
