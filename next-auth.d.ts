import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      isAdmin: boolean;
    };
  }

  interface User {
    id: string;
    email: string;
    name?: string | null;
    isAdmin: number; // 0 or 1 from database
  }
}
