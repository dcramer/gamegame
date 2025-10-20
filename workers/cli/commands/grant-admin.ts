import { execSync } from 'child_process';

export async function grantAdminCommand() {
  const args = process.argv.slice(3);
  const email = args[0];
  const isRemote = args.includes('--remote');

  if (!email || email.startsWith('--')) {
    console.error('Usage: pnpm cli grant-admin <email> [--remote]');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli grant-admin user@example.com          # Local database');
    console.error('  pnpm cli grant-admin user@example.com --remote # Production database');
    process.exit(1);
  }

  const locationFlag = isRemote ? '--remote' : '--local';
  const location = isRemote ? 'production' : 'local';

  console.log(`\n🔍 Looking for user: ${email} (${location})...\n`);

  try {
    // First, check if user exists
    const checkUserCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "SELECT id, email, name, is_admin FROM users WHERE email = '${email}';"`;

    try {
      const result = execSync(checkUserCmd, { encoding: 'utf-8', stdio: 'pipe' });
      console.log(result);

      // Check if user was found
      if (result.includes('Query returned no results') || result.includes('0 rows')) {
        console.error(`\n❌ User not found: ${email}`);
        console.error(`\nMake sure the user has logged in at least once to create their account.`);
        process.exit(1);
      }
    } catch (error: any) {
      console.error('Error checking user:', error.message);
      process.exit(1);
    }

    // Grant admin access
    console.log(`\n🔐 Granting admin privileges...\n`);

    const grantAdminCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "UPDATE users SET is_admin = 1 WHERE email = '${email}';"`;
    const updateResult = execSync(grantAdminCmd, { encoding: 'utf-8', stdio: 'pipe' });
    console.log(updateResult);

    // Verify the update
    console.log(`\n✅ Verifying admin access...\n`);

    const verifyCmd = `pnpx wrangler d1 execute gamegame ${locationFlag} --command "SELECT id, email, name, is_admin FROM users WHERE email = '${email}';"`;
    const verifyResult = execSync(verifyCmd, { encoding: 'utf-8', stdio: 'pipe' });
    console.log(verifyResult);

    if (verifyResult.includes('| 1 |') || verifyResult.includes('is_admin: 1')) {
      console.log(`\n🎉 Success! ${email} is now an admin.\n`);
    } else {
      console.error(`\n⚠️  Update completed but admin status could not be verified.`);
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}
