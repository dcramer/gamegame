import { auth } from "@/auth";

/**
 * Require admin authentication for server actions
 * Throws an error if the user is not authenticated or not an admin
 */
export async function requireAdmin(): Promise<void> {
  const session = await auth();
  if (!session?.user?.admin) {
    throw new Error("Unauthorized");
  }
}

/**
 * Get the current session or throw if not authenticated
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session;
}
