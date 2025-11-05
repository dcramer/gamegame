import { createUserCommand } from './users/create-user';
import { grantAdminCommand } from './users/grant-admin';
import { loginUrlCommand } from './users/login-url';

export async function usersCommand(action?: string) {
  if (!action) {
    console.error('Usage: pnpm cli users <action> [args]');
    console.error('\nAvailable actions:');
    console.error('  create <email> [options]    Create a user');
    console.error('  grant-admin <email>         Grant admin privileges');
    console.error('  login-url <email>           Generate magic link');
    process.exit(1);
  }

  switch (action) {
    case 'create':
      await createUserCommand();
      break;
    case 'grant-admin':
      await grantAdminCommand();
      break;
    case 'login-url':
      await loginUrlCommand();
      break;
    default:
      console.error(`Unknown action: ${action}`);
      console.error('\nAvailable actions:');
      console.error('  create <email> [options]    Create a user');
      console.error('  grant-admin <email>         Grant admin privileges');
      console.error('  login-url <email>           Generate magic link');
      process.exit(1);
  }
}
