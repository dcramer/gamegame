import { redirect, data } from 'react-router';
import type { ApiClient } from '../../load-context';

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

/**
 * Check if current user is authenticated and is an admin.
 * Should be called in loaders for admin routes.
 *
 * @throws {Response} Redirects to /login if not authenticated
 * @throws {Response} Returns 403 Forbidden if authenticated but not admin
 * @returns {Promise<CurrentUser>} The current admin user
 */
export async function requireAdmin(api: ApiClient): Promise<CurrentUser> {
  const response = await api.fetch('/auth/me');

  // Not authenticated - redirect to login
  if (response.status === 401) {
    throw redirect('/login');
  }

  if (!response.ok) {
    throw data(
      { error: 'Failed to verify authentication' },
      { status: 500 }
    );
  }

  const user: CurrentUser = await response.json();

  // Authenticated but not admin - show forbidden error
  if (!user.isAdmin) {
    throw data(
      {
        error: 'Forbidden',
        message: 'You do not have permission to access this page.'
      },
      { status: 403 }
    );
  }

  return user;
}

/**
 * Check if current user is authenticated (admin or not).
 * Should be called in loaders for routes that require any authenticated user.
 *
 * @throws {Response} Redirects to /login if not authenticated
 * @returns {Promise<CurrentUser>} The current user
 */
export async function requireAuth(api: ApiClient): Promise<CurrentUser> {
  const response = await api.fetch('/auth/me');

  // Not authenticated - redirect to login
  if (response.status === 401) {
    throw redirect('/login');
  }

  if (!response.ok) {
    throw data(
      { error: 'Failed to verify authentication' },
      { status: 500 }
    );
  }

  return response.json();
}
