/**
 * CLI authentication bypass context
 * Used to execute server actions without NextAuth session
 */
export interface CLIContext {
  user: {
    id: string;
    email: string;
    isAdmin: boolean;
  };
  bypassAuth: true;
}

export function getCLIContext(): CLIContext {
  return {
    user: {
      id: 'cli',
      email: 'cli@system',
      isAdmin: true,
    },
    bypassAuth: true,
  };
}
