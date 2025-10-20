import { sign } from 'hono/jwt';
import { loadDevVars } from '../utils';

export async function loginUrlCommand() {
  const args = process.argv.slice(3);
  const email = args[0];

  if (!email || email.startsWith('--')) {
    console.error('Usage: pnpm cli login-url <email>');
    console.error('');
    console.error('Examples:');
    console.error('  pnpm cli login-url user@example.com');
    process.exit(1);
  }

  const vars = loadDevVars();
  const JWT_SECRET = vars.JWT_SECRET;

  if (!JWT_SECRET) {
    console.error('Error: JWT_SECRET not found in .dev.vars');
    process.exit(1);
  }

  try {
    // Create JWT token (15 min expiry)
    const token = await sign(
      {
        email,
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
      },
      JWT_SECRET
    );

    const loginUrl = `http://localhost:4000/login/verify?token=${token}`;

    console.log(`\n🔗 Magic link for ${email}:\n`);
    console.log(loginUrl);
    console.log('\n⏰ Link expires in 15 minutes\n');
  } catch (error: any) {
    console.error('\n❌ Error generating login URL:', error.message);
    process.exit(1);
  }
}
