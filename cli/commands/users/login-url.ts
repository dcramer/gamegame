import { db } from '@/lib/db';
import { verificationTokens } from '@/lib/db/schema/auth';
import { getUserByEmail } from '@/lib/cli/users';
import { error } from '../../utils/output';
import { randomBytes } from 'crypto';

export async function loginUrlCommand() {
  const email = process.argv[4];

  if (!email || email.startsWith('--')) {
    console.error('Usage: pnpm cli users login-url <email>');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli users login-url user@example.com');
    process.exit(1);
  }

  try {
    // Verify user exists (optional - user will be created on first login)
    const user = await getUserByEmail(email);
    if (!user) {
      console.warn(`⚠️  Warning: User ${email} does not exist yet. They will be created on first login.\n`);
    }

    // Generate verification token
    const token = randomBytes(32).toString('hex');
    const expires = Date.now() + 15 * 60 * 1000; // 15 minutes

    // Insert verification token
    await db.insert(verificationTokens).values({
      identifier: email.toLowerCase(),
      token,
      expires,
    });

    // Generate magic link URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const callbackUrl = `${baseUrl}/api/auth/verify?token=${token}`;

    console.log(`\n🔗 Magic link for ${email}:\n`);
    console.log(callbackUrl);
    console.log('\n⏰ Link expires in 15 minutes\n');
  } catch (err: any) {
    error(`Failed to generate login URL: ${err.message}`);
    process.exit(1);
  }
}
