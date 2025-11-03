import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

export async function grantAdminCommand() {
  const args = process.argv.slice(4);
  const email = args[0];
  const isRemote = args.includes('--remote');

  if (!email || email.startsWith('--')) {
    console.error('Usage: pnpm cli users grant-admin <email> [--remote]');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli users grant-admin user@example.com          # Local database');
    console.error('  pnpm cli users grant-admin user@example.com --remote # Production database');
    process.exit(1);
  }

  const locationFlag = isRemote ? '--remote' : '--local';
  const location = isRemote ? 'production' : 'local';
  const escapedEmail = escapeSql(email);

  console.log(`\n🔐 Granting admin privileges to: ${email} (${location})...\n`);

  // Create a temporary SQL file with all operations
  const sqlFile = join(tmpdir(), `grant-admin-${Date.now()}.sql`);
  const sql = `
-- Grant admin privileges
UPDATE users SET is_admin = 1, updated_at = ${Math.floor(Date.now() / 1000)} WHERE email = '${escapedEmail}';

-- Return the updated user to verify
SELECT id, email, name, is_admin FROM users WHERE email = '${escapedEmail}';
`.trim();

  try {
    // Write SQL to temp file
    writeFileSync(sqlFile, sql);

    // Execute the entire transaction in a single wrangler call
    const cmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --file="${sqlFile}"`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

    console.log(result);

    // Check if user was found and updated
    // Look for the email in the output to confirm user exists
    if (!result.includes(`"email": "${escapedEmail}"`) && !result.includes(`| ${email} |`)) {
      console.error(`\n❌ User not found: ${email}`);
      console.error(`\nMake sure the user has logged in at least once to create their account.`);
      process.exit(1);
    } else if (result.includes('"is_admin": 1') || result.includes('| 1 |')) {
      console.log(`\n🎉 Success! ${email} is now an admin.\n`);
    } else {
      console.error(`\n⚠️  Update completed but admin status could not be verified.`);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    // Clean up temp file
    try {
      unlinkSync(sqlFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}
