import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
  useLoaderData,
} from "react-router";
import { useEffect, useRef } from "react";
import type { LinksFunction } from "react-router";
import type { Route } from "./+types/root";
import { AuthProvider } from "./lib/auth-context";
import { userSchema } from "./lib/schemas";
import { NotificationProvider, useNotifications, type JobNotification } from "./contexts/NotificationContext";
import { NotificationContainer } from "./components/NotificationContainer";
import { useFlashNotifications } from "./hooks/useFlashNotifications";

import "./styles/globals.css";

export async function loader({ context }: Route.LoaderArgs) {
  try {
    const res = await context.api.fetch('/auth/me');

    if (res.ok) {
      const user = userSchema.parse(await res.json());

      // If user is admin, fetch active jobs
      let activeJobs: Array<{
        jobId: string;
        resourceId: string;
        resourceName?: string;
        gameName?: string;
        status: string;
      }> = [];
      if (user.isAdmin) {
        try {
          const jobsRes = await context.api.fetch('/resources/jobs');
          if (jobsRes.ok) {
            const data = await jobsRes.json() as { jobs?: Array<{
              jobId: string;
              resourceId: string;
              resourceName?: string;
              gameName?: string;
              status: string;
            }> };
            activeJobs = data.jobs || [];
          }
        } catch (error) {
          console.error('Failed to fetch active jobs:', error);
        }
      }

      return { user, activeJobs };
    }
  } catch {
    // Not authenticated or error, ignore
  }
  return { user: null, activeJobs: [] };
}

export const links: LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "icon", href: "/favicon-32x32.svg", type: "image/svg+xml", sizes: "32x32" },
  { rel: "icon", href: "/favicon-16x16.svg", type: "image/svg+xml", sizes: "16x16" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.svg", sizes: "180x180" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Component to restore active job notifications on app load
 */
function JobRestorer({
  activeJobs,
}: {
  activeJobs: Array<{
    jobId: string;
    resourceId: string;
    resourceName?: string;
    gameName?: string;
    status: string;
  }>;
}) {
  const { addJobNotification } = useFlashNotifications();
  const { notifications } = useNotifications();
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Prevent double execution in React StrictMode or when component remounts
    if (hasInitialized.current || activeJobs.length === 0) return;

    hasInitialized.current = true;
    console.log('[Job Restore - Root] Restoring active jobs:', activeJobs);

    // Get existing job IDs to avoid duplicates
    const existingJobIds = new Set(
      notifications
        .filter((n): n is JobNotification => n.type === 'job')
        .map((n) => n.jobId)
    );

    for (const job of activeJobs) {
      // Skip completed or failed jobs
      if (job.status === 'completed' || job.status === 'failed') {
        continue;
      }

      // Skip if notification already exists for this job
      if (existingJobIds.has(job.jobId)) {
        console.log('[Job Restore - Root] Skipping duplicate notification for:', {
          jobId: job.jobId,
          resourceName: job.resourceName,
        });
        continue;
      }

      console.log('[Job Restore - Root] Adding notification for:', {
        jobId: job.jobId,
        resourceName: job.resourceName,
        status: job.status,
      });
      addJobNotification(
        job.jobId,
        `Processing ${job.resourceName || 'resource'}`
      );
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function Root() {
  const { user, activeJobs } = useLoaderData<typeof loader>();

  return (
    <AuthProvider user={user}>
      <NotificationProvider>
        <JobRestorer activeJobs={activeJobs || []} />
        <NotificationContainer />
        <Outlet />
      </NotificationProvider>
    </AuthProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
          <h1 className="text-2xl font-bold text-red-600 mb-4">
            {error.status} {error.statusText}
          </h1>
          <p className="text-gray-700 mb-4">
            {error.data?.message || "An error occurred while loading this page."}
          </p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Return Home
          </a>
        </div>
      </div>
    );
  }

  // Handle unexpected errors
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const errorStack = error instanceof Error ? error.stack : undefined;

  // Log to console for debugging (in production, this would go to error tracking)
  console.error("Unhandled route error:", error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-2xl w-full p-6 bg-white rounded-lg shadow-lg">
        <h1 className="text-2xl font-bold text-red-600 mb-4">
          Unexpected Error
        </h1>
        <p className="text-gray-700 mb-4">
          An unexpected error occurred. Please try again or contact support if the problem persists.
        </p>
        {process.env.NODE_ENV === "development" && (
          <details className="mt-4 p-4 bg-gray-100 rounded">
            <summary className="cursor-pointer font-semibold text-gray-800">
              Error Details (Development Only)
            </summary>
            <pre className="mt-2 text-sm text-gray-600 overflow-auto">
              {errorMessage}
              {errorStack && `\n\n${errorStack}`}
            </pre>
          </details>
        )}
        <div className="mt-6">
          <a
            href="/"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Return Home
          </a>
        </div>
      </div>
    </div>
  );
}
