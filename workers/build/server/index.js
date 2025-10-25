import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, UNSAFE_withComponentProps, useLoaderData, Outlet, UNSAFE_withErrorBoundaryProps, useRouteError, isRouteErrorResponse, Meta, Links, ScrollRestoration, Scripts, redirect, Link, useSearchParams, useNavigate, useParams, useLocation, useOutletContext, Navigate } from "react-router";
import * as React from "react";
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { z } from "zod";
import clsx, { clsx as clsx$1 } from "clsx";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { Dices, MessageCircle, ImageIcon, ExternalLink, MessageCircleQuestion, ChevronRight, RefreshCw, Trash2, Loader2, Download, FileIcon, Pencil } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import Markdown from "react-markdown";
import { eq } from "drizzle-orm";
async function handleRequest(request, responseStatusCode, responseHeaders, remixContext, _loadContext) {
  let statusCode = responseStatusCode;
  const body = await renderToReadableStream(
    /* @__PURE__ */ jsx(ServerRouter, { context: remixContext, url: request.url }),
    {
      signal: request.signal,
      onError(error) {
        console.error(error);
        statusCode = 500;
      }
    }
  );
  if (isbot(request.headers.get("user-agent") || "")) {
    await body.allReady;
  }
  responseHeaders.set("Content-Type", "text/html");
  return new Response(body, {
    headers: responseHeaders,
    status: statusCode
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest
}, Symbol.toStringTag, { value: "Module" }));
const AuthContext = createContext(void 0);
function AuthProvider({ user, children }) {
  return /* @__PURE__ */ jsx(AuthContext.Provider, { value: { user, isLoading: false }, children });
}
function useAuth() {
  const context = useContext(AuthContext);
  if (context === void 0) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
const timestampSchema = z.coerce.number().nullable();
const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  isAdmin: z.boolean()
});
const gameSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  year: z.number().nullable().optional(),
  imageUrl: z.string().nullable(),
  bggUrl: z.string().nullable(),
  resourceCount: z.number().optional()
});
const gamesListSchema = z.array(gameSchema);
const bggGameSchema = z.object({
  id: z.string(),
  name: z.string(),
  yearPublished: z.number().nullable(),
  minPlayers: z.number().nullable(),
  maxPlayers: z.number().nullable(),
  playingTime: z.number().nullable(),
  minPlayTime: z.number().nullable(),
  maxPlayTime: z.number().nullable(),
  minAge: z.number().nullable(),
  description: z.string().nullable(),
  thumbnail: z.string().nullable(),
  image: z.string().nullable(),
  publishers: z.array(z.string()),
  designers: z.array(z.string()),
  categories: z.array(z.string()),
  bggUrl: z.string()
});
const bggGamesListSchema = z.array(bggGameSchema);
const resourceSchema = z.object({
  id: z.string(),
  gameId: z.string().optional(),
  // Not always returned (e.g., in resources list for a game)
  name: z.string(),
  originalFilename: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  attributionUrl: z.string().nullable().optional(),
  url: z.string(),
  version: z.number(),
  pdfExtractor: z.string().nullable(),
  processedAt: timestampSchema,
  status: z.string().optional(),
  currentJobId: z.string().nullable().optional(),
  processingStage: z.string().optional(),
  pageCount: z.number().nullable(),
  imageCount: z.number(),
  wordCount: z.number(),
  description: z.string().nullable().optional(),
  fragmentCount: z.number().optional(),
  content: z.string().optional(),
  // Only in single resource GET
  createdAt: timestampSchema.optional(),
  updatedAt: timestampSchema.optional()
});
z.array(resourceSchema);
const attachmentSchema$1 = z.object({
  id: z.string(),
  resourceId: z.string().optional(),
  gameId: z.string().optional(),
  type: z.string(),
  mimeType: z.string(),
  url: z.string(),
  r2Key: z.string().optional(),
  originalFilename: z.string().nullable(),
  pageNumber: z.number().nullable(),
  bbox: z.union([z.string(), z.array(z.number())]).nullable().optional(),
  caption: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  description: z.string().nullable().optional(),
  isGoodQuality: z.boolean().nullable().optional()
});
const attachmentsListSchema$1 = z.array(attachmentSchema$1);
z.object({
  jobId: z.string(),
  resourceId: z.string(),
  gameId: z.string(),
  status: z.enum(["queued", "processing", "completed", "failed"]),
  progress: z.number(),
  currentStep: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number()
});
const uploadResponseSchema = z.object({
  resourceId: z.string(),
  jobId: z.string(),
  status: z.string(),
  message: z.string()
});
z.object({
  success: z.boolean(),
  deletedFragments: z.number(),
  deletedAttachments: z.number().optional(),
  deletedR2Files: z.number(),
  warnings: z.array(z.string()).optional(),
  message: z.string()
});
const deleteGameResponseSchema = z.object({
  success: z.boolean(),
  deletedFragments: z.number(),
  deletedR2Files: z.number(),
  warnings: z.array(z.string()).optional(),
  message: z.string()
});
z.object({
  message: z.string(),
  magicLink: z.string().optional()
});
z.object({
  error: z.string()
});
const chatMessageSchema = z.object({
  id: z.string().optional(),
  // Optional for user messages
  role: z.string(),
  // Accept any string, AI SDK will validate
  content: z.string()
  // Allow any other fields the AI SDK might expect
}).passthrough();
z.object({
  messages: z.array(chatMessageSchema).min(1)
});
const NotificationContext = createContext(void 0);
function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const addNotification = useCallback((notification) => {
    if (notification.type === "job") {
      const jobNotif = notification;
      const existingNotification = notifications.find(
        (n) => n.type === "job" && n.jobId === jobNotif.jobId && jobNotif.jobId !== ""
        // Don't dedupe pending notifications without jobId yet
      );
      if (existingNotification) {
        console.log("[NotificationContext] Skipping duplicate job notification:", jobNotif.jobId);
        return existingNotification.id;
      }
    }
    const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newNotification = { ...notification, id };
    setNotifications((prev) => [...prev, newNotification]);
    if (!notification.persist && notification.type !== "job") {
      const hideMs = notification.autoHideMs ?? 5e3;
      setTimeout(() => {
        removeNotification(id);
      }, hideMs);
    }
    return id;
  }, [notifications]);
  const updateNotification = useCallback((id, updates) => {
    setNotifications(
      (prev) => prev.map(
        (notification) => notification.id === id ? { ...notification, ...updates } : notification
      )
    );
  }, []);
  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);
  return /* @__PURE__ */ jsx(
    NotificationContext.Provider,
    {
      value: { notifications, addNotification, updateNotification, removeNotification, clearAll },
      children
    }
  );
}
function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
class ApiClient {
  constructor(request) {
    this.request = request;
    this.baseUrl = request ? "http://localhost:8787" : "";
  }
  baseUrl;
  /**
   * Fetch from API routes with automatic authentication
   * @param path - API route path WITHOUT /api prefix (e.g., '/games', '/resources/:id')
   *                Path will be prefixed with '/api' automatically
   */
  async fetch(path, init) {
    const url = `${this.baseUrl}/api${path}`;
    if (this.request) {
      return fetch(url, {
        ...init,
        headers: {
          ...init?.headers,
          cookie: this.request.headers.get("cookie") || ""
        }
      });
    }
    return fetch(url, {
      ...init,
      credentials: "include"
    });
  }
}
const apiClient = new ApiClient();
const variantStyles = {
  success: "bg-green-600/90 text-white",
  error: "bg-destructive/90 text-destructive-foreground",
  warning: "bg-yellow-600/90 text-white",
  info: "bg-blue-600/90 text-white",
  job: "bg-blue-600/90 text-white"
};
function NotificationItem({ notification }) {
  const { removeNotification, updateNotification } = useNotifications();
  useEffect(() => {
    if (notification.type !== "job") return;
    const jobNotification = notification;
    if (jobNotification.status === "completed" || jobNotification.status === "failed") {
      const timer = setTimeout(() => {
        removeNotification(notification.id);
      }, 5e3);
      return () => clearTimeout(timer);
    }
    if (!jobNotification.jobId || jobNotification.jobId === "") {
      return;
    }
    const interval = setInterval(async () => {
      try {
        const response = await apiClient.fetch(`/resources/jobs/${jobNotification.jobId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch job status");
        }
        const data = await response.json();
        updateNotification(notification.id, {
          status: data.status,
          progress: data.progress,
          currentStep: data.currentStep,
          error: data.error
        });
      } catch (error) {
        console.error("Failed to poll job status:", error);
        updateNotification(notification.id, {
          status: "failed",
          error: "Failed to fetch job status"
        });
      }
    }, 2e3);
    return () => clearInterval(interval);
  }, [notification, updateNotification, removeNotification]);
  const handleDismiss = () => {
    removeNotification(notification.id);
  };
  let bgColor = variantStyles[notification.type];
  if (notification.type === "job") {
    const jobNotification = notification;
    if (jobNotification.status === "completed") {
      bgColor = variantStyles.success;
    } else if (jobNotification.status === "failed") {
      bgColor = variantStyles.error;
    }
  }
  return /* @__PURE__ */ jsx("div", { className: "animate-in fade-in slide-in-from-right-2 duration-300 mb-2", children: /* @__PURE__ */ jsxs(
    "div",
    {
      className: clsx(
        "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg font-medium max-w-md overflow-hidden",
        bgColor
      ),
      role: "alert",
      children: [
        /* @__PURE__ */ jsx("div", { className: "flex-1", children: notification.type === "job" ? (() => {
          const jobNotification = notification;
          return /* @__PURE__ */ jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx("div", { className: "font-semibold", children: jobNotification.title }),
            notification.message && /* @__PURE__ */ jsx("div", { className: "text-sm opacity-90", children: notification.message }),
            jobNotification.currentStep && /* @__PURE__ */ jsx("div", { className: "text-xs opacity-75 mt-1", children: jobNotification.currentStep }),
            jobNotification.progress !== void 0 && jobNotification.progress > 0 && /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm", children: [
              /* @__PURE__ */ jsx("div", { className: "flex-1 bg-white/20 rounded-full h-2 overflow-hidden", children: /* @__PURE__ */ jsx(
                "div",
                {
                  className: "bg-white h-full transition-all duration-300",
                  style: { width: `${jobNotification.progress}%` }
                }
              ) }),
              /* @__PURE__ */ jsxs("span", { className: "opacity-90", children: [
                Math.round(jobNotification.progress),
                "%"
              ] })
            ] }),
            jobNotification.error && /* @__PURE__ */ jsx("div", { className: "text-sm mt-1", children: jobNotification.error })
          ] });
        })() : /* @__PURE__ */ jsx("span", { children: notification.message }) }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: handleDismiss,
            className: "hover:opacity-70 transition-opacity shrink-0 ml-2 text-lg leading-none",
            "aria-label": "Dismiss",
            children: "✕"
          }
        )
      ]
    }
  ) });
}
function NotificationContainer() {
  const { notifications } = useNotifications();
  if (notifications.length === 0) return null;
  return /* @__PURE__ */ jsx("div", { className: "fixed top-4 right-4 z-50 flex flex-col-reverse max-w-md", children: notifications.map((notification) => /* @__PURE__ */ jsx(NotificationItem, { notification }, notification.id)) });
}
function useFlashNotifications() {
  const { addNotification, updateNotification } = useNotifications();
  const addJobNotification = useCallback(
    (jobId, title, message) => {
      return addNotification({
        type: "job",
        jobId,
        title,
        message: message || "",
        status: "pending",
        persist: true
      });
    },
    [addNotification]
  );
  const addPendingJobNotification = useCallback(
    (title, message) => {
      return addNotification({
        type: "job",
        jobId: "",
        // Will be updated later
        title,
        message: message || "",
        status: "queued",
        persist: true
      });
    },
    [addNotification]
  );
  const updatePendingJobWithId = useCallback(
    (notificationId, jobId) => {
      updateNotification(notificationId, {
        jobId,
        status: "pending"
      });
    },
    [updateNotification]
  );
  const addToast = useCallback(
    (type, message, autoHideMs) => {
      return addNotification({
        type,
        message,
        autoHideMs
      });
    },
    [addNotification]
  );
  return {
    addJobNotification,
    addPendingJobNotification,
    updatePendingJobWithId,
    addToast
  };
}
async function loader$8({
  context
}) {
  try {
    const res = await context.api.fetch("/auth/me");
    if (res.ok) {
      const user = userSchema.parse(await res.json());
      let activeJobs = [];
      if (user.isAdmin) {
        try {
          const jobsRes = await context.api.fetch("/resources/jobs");
          if (jobsRes.ok) {
            activeJobs = await jobsRes.json();
          }
        } catch (error) {
          console.error("Failed to fetch active jobs:", error);
        }
      }
      return {
        user,
        activeJobs
      };
    }
  } catch {
  }
  return {
    user: null,
    activeJobs: []
  };
}
const links = () => [{
  rel: "icon",
  href: "/favicon.svg",
  type: "image/svg+xml"
}, {
  rel: "icon",
  href: "/favicon-32x32.svg",
  type: "image/svg+xml",
  sizes: "32x32"
}, {
  rel: "icon",
  href: "/favicon-16x16.svg",
  type: "image/svg+xml",
  sizes: "16x16"
}, {
  rel: "apple-touch-icon",
  href: "/apple-touch-icon.svg",
  sizes: "180x180"
}, {
  rel: "preconnect",
  href: "https://fonts.googleapis.com"
}, {
  rel: "preconnect",
  href: "https://fonts.gstatic.com",
  crossOrigin: "anonymous"
}, {
  rel: "stylesheet",
  href: "https://fonts.googleapis.com/css2?family=Comfortaa:wght@300;400;500;600;700&display=swap"
}];
function Layout$1({
  children
}) {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      }), /* @__PURE__ */ jsx("meta", {
        name: "theme-color",
        content: "#000000"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [children, /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
}
function JobRestorer({
  activeJobs
}) {
  const {
    addJobNotification
  } = useFlashNotifications();
  const {
    notifications
  } = useNotifications();
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current || activeJobs.length === 0) return;
    hasInitialized.current = true;
    console.log("[Job Restore - Root] Restoring active jobs:", activeJobs);
    const existingJobIds = new Set(notifications.filter((n) => n.type === "job").map((n) => n.jobId));
    for (const resource of activeJobs) {
      if (resource.currentJobId) {
        if (existingJobIds.has(resource.currentJobId)) {
          console.log("[Job Restore - Root] Skipping duplicate notification for:", {
            jobId: resource.currentJobId,
            resourceName: resource.name
          });
          continue;
        }
        console.log("[Job Restore - Root] Adding notification for:", {
          jobId: resource.currentJobId,
          resourceName: resource.name,
          status: resource.status
        });
        addJobNotification(resource.currentJobId, `Processing ${resource.name}`);
      }
    }
  }, []);
  return null;
}
const root = UNSAFE_withComponentProps(function Root() {
  const {
    user,
    activeJobs
  } = useLoaderData();
  return /* @__PURE__ */ jsx(AuthProvider, {
    user,
    children: /* @__PURE__ */ jsxs(NotificationProvider, {
      children: [/* @__PURE__ */ jsx(JobRestorer, {
        activeJobs: activeJobs || []
      }), /* @__PURE__ */ jsx(NotificationContainer, {}), /* @__PURE__ */ jsx(Outlet, {})]
    })
  });
});
const ErrorBoundary$1 = UNSAFE_withErrorBoundaryProps(function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return /* @__PURE__ */ jsx("div", {
      className: "min-h-screen flex items-center justify-center bg-gray-50",
      children: /* @__PURE__ */ jsxs("div", {
        className: "max-w-md w-full p-6 bg-white rounded-lg shadow-lg",
        children: [/* @__PURE__ */ jsxs("h1", {
          className: "text-2xl font-bold text-red-600 mb-4",
          children: [error.status, " ", error.statusText]
        }), /* @__PURE__ */ jsx("p", {
          className: "text-gray-700 mb-4",
          children: error.data?.message || "An error occurred while loading this page."
        }), /* @__PURE__ */ jsx("a", {
          href: "/",
          className: "inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700",
          children: "Return Home"
        })]
      })
    });
  }
  const errorMessage = error instanceof Error ? error.message : "Unknown error";
  const errorStack = error instanceof Error ? error.stack : void 0;
  console.error("Unhandled route error:", error);
  return /* @__PURE__ */ jsx("div", {
    className: "min-h-screen flex items-center justify-center bg-gray-50",
    children: /* @__PURE__ */ jsxs("div", {
      className: "max-w-2xl w-full p-6 bg-white rounded-lg shadow-lg",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "text-2xl font-bold text-red-600 mb-4",
        children: "Unexpected Error"
      }), /* @__PURE__ */ jsx("p", {
        className: "text-gray-700 mb-4",
        children: "An unexpected error occurred. Please try again or contact support if the problem persists."
      }), process.env.NODE_ENV === "development" && /* @__PURE__ */ jsxs("details", {
        className: "mt-4 p-4 bg-gray-100 rounded",
        children: [/* @__PURE__ */ jsx("summary", {
          className: "cursor-pointer font-semibold text-gray-800",
          children: "Error Details (Development Only)"
        }), /* @__PURE__ */ jsxs("pre", {
          className: "mt-2 text-sm text-gray-600 overflow-auto",
          children: [errorMessage, errorStack && `

${errorStack}`]
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "mt-6",
        children: /* @__PURE__ */ jsx("a", {
          href: "/",
          className: "inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700",
          children: "Return Home"
        })
      })]
    })
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary: ErrorBoundary$1,
  Layout: Layout$1,
  default: root,
  links,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
const SITE_NAME = "GameGame";
const SITE_TAGLINE = "AI-Powered Board Game Rules Assistant";
function createTitle(parts, options = {}) {
  const { isAdmin = false, includeSiteName = true } = options;
  const validParts = parts.filter((part) => !!part);
  if (isAdmin && !validParts.includes("Admin")) {
    validParts.push("Admin");
  }
  if (includeSiteName) {
    validParts.push(SITE_NAME);
  }
  return validParts.join(" | ");
}
function createHomeTitle() {
  return createTitle([SITE_TAGLINE], { includeSiteName: true });
}
function createGamesTitle() {
  return createTitle(["Board Games", SITE_TAGLINE], { includeSiteName: true });
}
function createGameTitle(gameName) {
  return createTitle([`${gameName} Rules`], { includeSiteName: true });
}
function createLoginTitle() {
  return createTitle(["Sign In"], { includeSiteName: true });
}
function createVerifyTitle() {
  return createTitle(["Verify Email"], { includeSiteName: true });
}
function createAdminTitle(...parts) {
  return createTitle(parts, { isAdmin: true, includeSiteName: true });
}
function createMeta(options) {
  const meta2 = [
    { title: options.title }
  ];
  if (options.description) {
    meta2.push({ name: "description", content: options.description });
  }
  if (options.noIndex) {
    meta2.push({ name: "robots", content: "noindex, nofollow" });
  }
  return meta2;
}
const meta$9 = () => {
  return createMeta({
    title: createHomeTitle(),
    description: "Get instant answers to board game rules with AI-powered assistance. Search hundreds of games and rulebooks."
  });
};
function loader$7() {
  return redirect("/games");
}
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$7,
  meta: meta$9
}, Symbol.toStringTag, { value: "Module" }));
const GITHUB_URL = "https://github.com/getsentry/gamegame";
function Footer() {
  const { user } = useAuth();
  return /* @__PURE__ */ jsx("footer", { className: "container mx-auto px-4 py-8 text-center text-muted-foreground font-mono text-xs", children: /* @__PURE__ */ jsxs("div", { className: "flex justify-center items-center gap-4", children: [
    /* @__PURE__ */ jsxs(
      "a",
      {
        href: GITHUB_URL,
        className: "flex items-center gap-1 hover:underline",
        target: "_blank",
        rel: "noopener noreferrer",
        children: [
          /* @__PURE__ */ jsx(GitHubLogoIcon, { className: "w-4 h-4" }),
          "GitHub"
        ]
      }
    ),
    /* @__PURE__ */ jsx("span", { children: "·" }),
    /* @__PURE__ */ jsxs(
      Link,
      {
        to: "/",
        className: "flex items-center gap-1 hover:underline",
        children: [
          /* @__PURE__ */ jsx(Dices, { className: "w-4 h-4" }),
          "GameGame"
        ]
      }
    ),
    user?.isAdmin && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("span", { children: "·" }),
      /* @__PURE__ */ jsx(
        Link,
        {
          to: "/admin",
          className: "flex items-center gap-1 hover:underline",
          children: "Admin"
        }
      )
    ] })
  ] }) });
}
function Header() {
  return /* @__PURE__ */ jsx("header", { className: "container mx-auto px-4 py-8", children: /* @__PURE__ */ jsxs(
    Link,
    {
      to: "/",
      className: "flex items-center justify-center space-x-2",
      children: [
        /* @__PURE__ */ jsx(Dices, { className: "w-8 h-8" }),
        /* @__PURE__ */ jsx("h1", { className: "text-2xl lg:text-4xl font-bold", children: "gamegame" })
      ]
    }
  ) });
}
function Layout({ children }) {
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen flex flex-col items-stretch", children: [
    /* @__PURE__ */ jsx(Header, {}),
    /* @__PURE__ */ jsx("main", { className: "container mx-auto px-4 pb-12 flex-1 relative", children }),
    /* @__PURE__ */ jsx(Footer, {})
  ] });
}
function cn(...inputs) {
  return twMerge(clsx$1(inputs));
}
function Heading({
  children,
  className
}) {
  return /* @__PURE__ */ jsx("h2", { className: cn("text-3xl lg:text-5xl font-extrabold mb-6", className), children });
}
const Card = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn(
      "overflow-hidden border bg-card text-card-foreground shadow hover:shadow-lg transition-shadow",
      className
    ),
    ...props
  }
));
Card.displayName = "Card";
const CardHeader = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn("flex flex-col space-y-1.5 p-6", className),
    ...props
  }
));
CardHeader.displayName = "CardHeader";
const CardTitle = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "h3",
  {
    ref,
    className: cn("font-semibold leading-none tracking-tight", className),
    ...props
  }
));
CardTitle.displayName = "CardTitle";
const CardDescription = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "p",
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
CardDescription.displayName = "CardDescription";
const CardContent = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("div", { ref, className: cn("p-6 pt-0", className), ...props }));
CardContent.displayName = "CardContent";
const CardFooter = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn("flex items-center p-6 pt-0", className),
    ...props
  }
));
CardFooter.displayName = "CardFooter";
const Input = React.forwardRef(
  ({ className, type, ...props }, ref) => {
    return /* @__PURE__ */ jsx(
      "input",
      {
        type,
        className: cn(
          "flex h-10 w-full rounded border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Input.displayName = "Input";
const generateId = () => nanoid();
const RESOURCE_STATUSES = ["ready", "queued", "processing", "completed", "failed"];
const games$1 = sqliteTable("games", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  name: text("name").notNull(),
  year: integer("year"),
  slug: text("slug").notNull().unique(),
  imageUrl: text("image_url"),
  bggId: text("bgg_id").unique(),
  // BoardGameGeek game ID
  bggUrl: text("bgg_url"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (table) => ({
  nameIdx: index("idx_games_name").on(table.name),
  bggIdIdx: index("idx_games_bgg_id").on(table.bggId)
}));
const resources = sqliteTable("resources", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  gameId: text("game_id").notNull().references(() => games$1.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  originalFilename: text("original_filename"),
  author: text("author"),
  attributionUrl: text("attribution_url"),
  url: text("url").notNull(),
  content: text("content").notNull().default(""),
  version: integer("version").notNull().default(0),
  pdfExtractor: text("pdf_extractor"),
  processedAt: integer("processed_at", { mode: "timestamp" }),
  status: text("status").notNull().default("ready"),
  currentJobId: text("current_job_id"),
  processingStage: text("processing_stage").notNull().default("ready"),
  processingMetadata: text("processing_metadata"),
  description: text("description"),
  // Denormalized stats
  pageCount: integer("page_count"),
  imageCount: integer("image_count").default(0),
  wordCount: integer("word_count").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (table) => ({
  gameIdx: index("idx_resources_game_id").on(table.gameId),
  statusIdx: index("idx_resources_status").on(table.status),
  jobIdx: index("idx_resources_job_id").on(table.currentJobId)
}));
const fragments = sqliteTable("fragments", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  gameId: text("game_id").notNull().references(() => games$1.id, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  version: integer("version").notNull().default(0),
  // Metadata (stored as separate columns since no JSONB in SQLite)
  pageNumber: integer("page_number"),
  pageRangeStart: integer("page_range_start"),
  pageRangeEnd: integer("page_range_end"),
  section: text("section"),
  images: text("images")
  // JSON string: [{id, url, bbox, caption}]
}, (table) => ({
  gameIdx: index("idx_fragments_game_id").on(table.gameId),
  resourceIdx: index("idx_fragments_resource_id").on(table.resourceId),
  versionIdx: index("idx_fragments_version").on(table.version),
  pageIdx: index("idx_fragments_page_number").on(table.pageNumber)
}));
const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  gameId: text("game_id").notNull().references(() => games$1.id, { onDelete: "cascade" }),
  resourceId: text("resource_id").notNull().references(() => resources.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("image"),
  mimeType: text("mime_type").notNull(),
  r2Key: text("r2_key").notNull(),
  // R2 key: resources/{resourceId}/attachments/{id}.{ext}
  originalFilename: text("original_filename"),
  pageNumber: integer("page_number"),
  bbox: text("bbox"),
  // JSON array: [x1, y1, x2, y2]
  caption: text("caption"),
  width: integer("width"),
  height: integer("height"),
  description: text("description"),
  // AI-generated description of the image content
  isGoodQuality: integer("is_good_quality", { mode: "boolean" }),
  // true (good), false (bad), or null
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (table) => ({
  gameIdx: index("idx_attachments_game_id").on(table.gameId),
  resourceIdx: index("idx_attachments_resource_id").on(table.resourceId),
  resourcePageIdx: index("idx_attachments_resource_page").on(table.resourceId, table.pageNumber),
  typeIdx: index("idx_attachments_type").on(table.type)
}));
const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  email: text("email").notNull().unique(),
  name: text("name"),
  isAdmin: integer("is_admin", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
});
const bggGames = sqliteTable("bgg_games", {
  id: text("id").primaryKey(),
  // BGG ID
  name: text("name").notNull(),
  yearPublished: integer("year_published"),
  minPlayers: integer("min_players"),
  maxPlayers: integer("max_players"),
  playingTime: integer("playing_time"),
  thumbnailUrl: text("thumbnail_url"),
  imageUrl: text("image_url"),
  description: text("description"),
  publishers: text("publishers"),
  // JSON array
  designers: text("designers"),
  // JSON array
  categories: text("categories"),
  // JSON array
  mechanics: text("mechanics"),
  // JSON array
  cachedAt: integer("cached_at", { mode: "timestamp" }).notNull().$defaultFn(() => /* @__PURE__ */ new Date())
}, (table) => ({
  nameIdx: index("idx_bgg_games_name").on(table.name)
}));
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  RESOURCE_STATUSES,
  attachments,
  bggGames,
  fragments,
  games: games$1,
  resources,
  users
}, Symbol.toStringTag, { value: "Module" }));
function getDb(d1) {
  return drizzle(d1, { schema });
}
const meta$8 = () => {
  return createMeta({
    title: createGamesTitle(),
    description: "Browse our collection of board games. Get instant answers to rules questions with AI-powered assistance."
  });
};
async function loader$6({
  context
}) {
  const {
    cloudflare
  } = context;
  const db = getDb(cloudflare.env.DB);
  const gamesList = await db.select().from(games$1).all();
  return {
    games: gamesList
  };
}
const games = UNSAFE_withComponentProps(function Games() {
  const {
    games: games2
  } = useLoaderData();
  const [matchingGames, setMatchingGames] = useState(games2);
  const [imageErrors, setImageErrors] = useState(/* @__PURE__ */ new Set());
  const handleSearch = (e) => {
    const searchTerm = e.target.value;
    const matching = games2.filter((game) => game.name.toLowerCase().includes(searchTerm.toLowerCase()));
    setMatchingGames(matching);
  };
  return /* @__PURE__ */ jsxs(Layout, {
    children: [/* @__PURE__ */ jsxs("section", {
      className: "text-center py-3 lg:py-12",
      children: [/* @__PURE__ */ jsx(Heading, {
        className: "text-2xl lg:text-5xl lg:mb-6 mb-2",
        children: "What are you playing?"
      }), /* @__PURE__ */ jsx("p", {
        className: "text-lg lg:text-xl mb-4 lg:mb-8 text-muted-foreground",
        children: "Select your game to start getting answers about the rules."
      })]
    }), /* @__PURE__ */ jsxs("div", {
      className: "flex flex-col gap-4",
      children: [/* @__PURE__ */ jsx(Input, {
        placeholder: "Search",
        onChange: handleSearch
      }), /* @__PURE__ */ jsx("div", {
        className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6",
        children: matchingGames.map((game) => /* @__PURE__ */ jsxs(Card, {
          className: "relative rounded-none lg:rounded hover:ring-ring hover:ring-offset-2 ring-offset-background hover:ring-2",
          children: [/* @__PURE__ */ jsx(CardContent, {
            className: "flex flex-col items-center",
            children: /* @__PURE__ */ jsx("div", {
              className: "w-full aspect-[3/2] overflow-hidden relative bg-muted flex items-center justify-center",
              children: game.imageUrl && !imageErrors.has(game.id) ? /* @__PURE__ */ jsx("img", {
                src: game.imageUrl,
                alt: game.name,
                className: "w-full h-full object-cover object-top",
                onError: () => {
                  setImageErrors((prev) => new Set(prev).add(game.id));
                }
              }) : /* @__PURE__ */ jsx("div", {
                className: "text-4xl text-muted-foreground",
                children: "🎲"
              })
            })
          }), /* @__PURE__ */ jsx(CardHeader, {
            children: /* @__PURE__ */ jsx(CardTitle, {
              className: "text-center text-2xl",
              children: game.name
            })
          }), /* @__PURE__ */ jsx(Link, {
            to: `/games/${game.slug || game.id}`,
            className: "inset-0 absolute"
          })]
        }, game.id))
      }), matchingGames.length === 0 && /* @__PURE__ */ jsx("div", {
        className: "text-center py-12",
        children: /* @__PURE__ */ jsx("p", {
          className: "text-xl",
          children: games2.length === 0 ? "No games yet. Check with your administrator to add games." : "No games found matching your search."
        })
      })]
    })]
  });
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: games,
  loader: loader$6,
  meta: meta$8
}, Symbol.toStringTag, { value: "Module" }));
const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", asChild = false, children, ...props }, ref) => {
    const classes = cn(
      "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
      {
        "bg-primary text-primary-foreground hover:bg-primary/90": variant === "default",
        "bg-secondary text-secondary-foreground hover:bg-secondary/80": variant === "secondary",
        "border border-input hover:bg-accent hover:text-accent-foreground": variant === "outline",
        "hover:bg-accent hover:text-accent-foreground": variant === "ghost",
        "underline-offset-4 hover:underline text-primary": variant === "link",
        "bg-destructive text-destructive-foreground hover:bg-destructive/90": variant === "destructive"
      },
      {
        "h-10 py-2 px-4 rounded": size === "default",
        "h-9 px-3 rounded": size === "sm",
        "h-11 px-8 rounded": size === "lg"
      },
      className
    );
    if (asChild && children && React.isValidElement(children)) {
      const childProps = children.props;
      return React.cloneElement(children, {
        ...childProps,
        className: cn(classes, childProps.className)
      });
    }
    return /* @__PURE__ */ jsx(
      "button",
      {
        className: classes,
        ref,
        ...props,
        children
      }
    );
  }
);
Button.displayName = "Button";
function ErrorState({
  title,
  message,
  actionLabel = "← Back to games",
  actionTo = "/games",
  children
}) {
  return /* @__PURE__ */ jsx(Layout, { children: /* @__PURE__ */ jsx("div", { className: "flex flex-col items-center justify-center py-12", children: /* @__PURE__ */ jsxs(Card, { className: "max-w-md w-full", children: [
    /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "text-center text-2xl", children: title }) }),
    /* @__PURE__ */ jsxs(CardContent, { className: "text-center", children: [
      /* @__PURE__ */ jsx("p", { className: "text-muted-foreground", children: message }),
      children && /* @__PURE__ */ jsx("div", { className: "mt-6", children }),
      /* @__PURE__ */ jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsx(Link, { to: actionTo, children: /* @__PURE__ */ jsx(Button, { variant: "outline", className: "w-full", children: actionLabel }) }) })
    ] })
  ] }) }) });
}
function Spinner({ className, size = "md" }) {
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: cn(
        "animate-spin rounded-full border-2 border-current border-t-transparent",
        {
          "h-4 w-4": size === "sm",
          "h-6 w-6": size === "md",
          "h-8 w-8": size === "lg"
        },
        className
      ),
      role: "status",
      "aria-label": "loading",
      children: /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Loading..." })
    }
  );
}
const SystemMessage = ({
  message,
  isStreaming,
  isCurrent,
  onFollowUp,
  onResourceClick
}) => {
  const textContent = message.parts?.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("");
  if (!textContent) {
    if (isStreaming) return null;
    console.error("no text content in message", message);
    return /* @__PURE__ */ jsx("div", { className: "bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4", children: "There was an error processing your request. Please try again." });
  }
  let parsed;
  try {
    parsed = JSON.parse(textContent);
  } catch (err) {
    if (isStreaming) return null;
    console.error("invalid payload", message);
    return /* @__PURE__ */ jsx("div", { className: "bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4", children: "There was an error processing your request. Please try again." });
  }
  const { answer, followUps, resources: resources2 } = parsed;
  if (!answer) {
    console.error("no answer in JSON payload", message);
    return /* @__PURE__ */ jsx("div", { className: "bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4", children: "There was an error processing your request. Please try again." });
  }
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const attachments2 = [];
  let match;
  while ((match = imageRegex.exec(answer)) !== null) {
    const alt = match[1];
    const url = match[2];
    if (url.includes("/attachments/") || url.includes("/uploads/")) {
      attachments2.push({ url, alt });
    }
  }
  return /* @__PURE__ */ jsxs("div", { className: "flex flex-col", children: [
    /* @__PURE__ */ jsx("div", { className: "prose prose-invert lg:prose-base prose-sm", children: /* @__PURE__ */ jsx(Markdown, { children: answer }) }),
    !!attachments2.length && /* @__PURE__ */ jsxs("div", { className: "mt-4 flex flex-col gap-2 text-sm", children: [
      /* @__PURE__ */ jsxs("h4", { className: "text-xs font-bold uppercase tracking-tight text-muted-foreground inline-flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(ImageIcon, { className: "w-3 h-3" }),
        "Attachments"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-row gap-2 flex-wrap", children: attachments2.map((attachment, index2) => /* @__PURE__ */ jsx(
        "a",
        {
          href: attachment.url,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "relative w-24 h-24 border border-border rounded overflow-hidden hover:border-primary transition-colors",
          title: attachment.alt || "Attachment",
          children: /* @__PURE__ */ jsx(
            "img",
            {
              src: attachment.url,
              alt: attachment.alt || "Attachment",
              className: "w-full h-full object-cover"
            }
          )
        },
        `${attachment.url}-${index2}`
      )) })
    ] }),
    !!resources2?.length && /* @__PURE__ */ jsxs("div", { className: "mt-4 flex flex-col gap-2 text-sm flex-wrap", children: [
      /* @__PURE__ */ jsxs("h4", { className: "text-xs font-bold uppercase tracking-tight text-muted-foreground inline-flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(ExternalLink, { className: "w-3 h-3" }),
        "Resources"
      ] }),
      /* @__PURE__ */ jsx("div", { className: "flex flex-row gap-2 text-xs flex-wrap", children: resources2.map((resource) => /* @__PURE__ */ jsx(
        Button,
        {
          variant: "secondary",
          size: "sm",
          className: "whitespace-normal h-auto py-2",
          onClick: () => onResourceClick(resource.id),
          children: resource.name
        },
        resource.id
      )) })
    ] }),
    isCurrent && !!followUps?.length && /* @__PURE__ */ jsxs("div", { className: "mt-4 flex flex-col gap-2 text-sm flex-wrap", children: [
      /* @__PURE__ */ jsxs("h4", { className: "text-xs font-bold uppercase tracking-tight text-muted-foreground inline-flex items-center gap-1.5", children: [
        /* @__PURE__ */ jsx(MessageCircleQuestion, { className: "w-3 h-3" }),
        "Follow Ups"
      ] }),
      /* @__PURE__ */ jsx("ul", { className: "flex flex-col gap-2 text-sm flex-wrap", children: followUps.map((followUp) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(
        Button,
        {
          variant: "default",
          size: "sm",
          className: "whitespace-normal text-left py-2 block h-auto",
          onClick: () => onFollowUp(followUp),
          children: followUp
        }
      ) }, followUp)) })
    ] })
  ] });
};
const UserMessage = ({ message }) => {
  const textContent = message.parts?.filter((part) => part.type === "text").map((part) => part.type === "text" ? part.text : "").join("");
  return /* @__PURE__ */ jsx("div", { className: "font-semibold rounded bg-muted text-muted-foreground self-end p-2 lg:p-3", children: /* @__PURE__ */ jsx("div", { className: "prose prose-invert lg:prose-base prose-sm", children: /* @__PURE__ */ jsx(Markdown, { children: textContent }) }) });
};
const defaultQuestions = [
  "How does GameGame work?",
  "Where can I find more information about this game?",
  "How does setup work?"
];
function Chat({
  game,
  imageError,
  setImageError
}) {
  const [input, setInput] = useState("");
  const [resourceUrls, setResourceUrls] = useState({});
  const [resourceError, setResourceError] = useState(null);
  const {
    messages,
    error,
    sendMessage,
    status
  } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/games/${game.id}/chat`
    })
  });
  const ref = useRef(null);
  const inputRef = useRef(null);
  const isLoading = status === "streaming" || status === "submitted";
  const visibleMessages = messages.filter(
    (m, index2) => {
      const hasContent = m.parts && m.parts.length > 0;
      return hasContent && (index2 !== messages.length - 1 || !isLoading || m.role === "user");
    }
  );
  useEffect(() => {
    setTimeout(() => ref.current?.scrollIntoView());
  }, [visibleMessages.length]);
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  const openResource = useCallback(
    async (resourceId) => {
      try {
        let targetUrl = resourceUrls[resourceId];
        if (!targetUrl) {
          const response = await apiClient.fetch(`/resources/${resourceId}`);
          if (!response.ok) {
            throw new Error(`Failed to load resource: ${response.status}`);
          }
          const data = await response.json();
          if (!data?.url) {
            throw new Error("Resource missing URL");
          }
          targetUrl = String(data.url);
          setResourceUrls((prev) => ({ ...prev, [resourceId]: targetUrl }));
        }
        const resolvedUrl = targetUrl.startsWith("http") ? targetUrl : new URL(targetUrl, window.location.origin).toString();
        window.open(resolvedUrl, "_blank", "noopener");
      } catch (error2) {
        console.error("Failed to open resource", error2);
        setResourceError("Unable to open the resource. Please try again later.");
      }
    },
    [resourceUrls]
  );
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(Card, { className: "flex-1 flex absolute inset-0 max-w-full overflow-hidden w-full", children: /* @__PURE__ */ jsxs(CardContent, { className: "flex-1 flex items-stretch flex-col pt-20 lg:pt-32 pb-4 px-4", children: [
      error && /* @__PURE__ */ jsx("div", { className: "bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4", children: error.message || "An error occurred" }),
      resourceError && /* @__PURE__ */ jsxs("div", { className: "bg-destructive text-destructive-foreground font-bold p-2 lg:p-3 rounded mb-4 flex items-center justify-between", children: [
        /* @__PURE__ */ jsx("span", { children: resourceError }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => setResourceError(null),
            className: "hover:opacity-80 transition-opacity",
            "aria-label": "Dismiss",
            children: "✕"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex-1 overflow-y-auto mb-4 gap-6 flex flex-col", children: [
        visibleMessages.length > 0 ? visibleMessages.map((m, index2) => /* @__PURE__ */ jsx("div", { className: "flex flex-col gap-0", children: m.role === "user" ? /* @__PURE__ */ jsx(UserMessage, { message: m }) : /* @__PURE__ */ jsx(
          SystemMessage,
          {
            message: m,
            isStreaming: index2 === visibleMessages.length - 1 && isLoading,
            isCurrent: index2 === visibleMessages.length - 1,
            onFollowUp: (followUp) => {
              sendMessage({ text: followUp });
            },
            onResourceClick: openResource
          }
        ) }, m.id)) : /* @__PURE__ */ jsxs("div", { className: "flex-1 flex flex-col gap-6 items-center justify-center text-muted-foreground lg:text-lg", children: [
          /* @__PURE__ */ jsx(Dices, { className: "w-24 h-24" }),
          /* @__PURE__ */ jsx("ul", { className: "flex flex-col items-center gap-2 text-sm flex-wrap", children: defaultQuestions.map((question) => /* @__PURE__ */ jsx("li", { children: /* @__PURE__ */ jsx(
            Button,
            {
              variant: "default",
              size: "sm",
              className: "whitespace-normal text-left py-2 block h-auto",
              onClick: () => {
                sendMessage({ text: question });
              },
              children: question
            }
          ) }, question)) })
        ] }),
        isLoading && /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("div", { className: "inline-flex flex-row items-center bg-muted text-muted-foreground rounded p-2 lg:p-3", children: /* @__PURE__ */ jsx(Spinner, { size: "sm" }) }) }),
        /* @__PURE__ */ jsx("div", { ref })
      ] }),
      /* @__PURE__ */ jsxs(
        "form",
        {
          onSubmit: (e) => {
            e.preventDefault();
            if (input.trim()) {
              sendMessage({ text: input });
              setInput("");
            }
          },
          className: "flex items-center gap-2 h-12",
          children: [
            /* @__PURE__ */ jsx(
              Input,
              {
                className: "bg-background text-foreground placeholder-text-muted-foreground px-3 py-3 lg:py-5 h-full lg:text-base text-lg",
                value: input,
                placeholder: `Ask about ${game.name}...`,
                onChange: (e) => setInput(e.target.value),
                ref: inputRef
              }
            ),
            /* @__PURE__ */ jsxs(Button, { type: "submit", disabled: isLoading, className: "gap-2 h-full", children: [
              /* @__PURE__ */ jsx(MessageCircle, { className: "w-5 h-5" }),
              /* @__PURE__ */ jsx("span", { className: "hidden lg:inline", children: "Ask" })
            ] })
          ]
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between items-center h-16 lg:h-24 overflow-hidden absolute top-0 left-0 right-0 pl-4 lg:px-4 gap-4 border-b bg-card", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-end gap-4 overflow-hidden whitespace-nowrap", children: [
        /* @__PURE__ */ jsx("div", { className: "w-8 h-8 lg:w-20 lg:h-20 relative", children: game.imageUrl && !imageError ? /* @__PURE__ */ jsx(
          "img",
          {
            src: game.imageUrl,
            alt: game.name,
            className: "w-full h-full object-cover object-top",
            onError: () => setImageError(true)
          }
        ) : /* @__PURE__ */ jsx("div", { className: "w-full h-full bg-muted flex items-center justify-center text-muted-foreground", children: "🎲" }) }),
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("h2", { className: "text-xl lg:text-3xl font-bold", children: game.name }),
          /* @__PURE__ */ jsxs("div", { className: "gap-4 items-center hidden lg:flex", children: [
            !!game.bggUrl && /* @__PURE__ */ jsx(
              "a",
              {
                href: game.bggUrl,
                className: "group",
                target: "_blank",
                rel: "noopener noreferrer",
                title: `${game.name} on Board Game Geek`,
                children: /* @__PURE__ */ jsx(
                  "img",
                  {
                    src: "/bgg.png",
                    alt: "Board Game Geek",
                    className: "w-5 h-5 grayscale group-hover:grayscale-0 rounded"
                  }
                )
              }
            ),
            /* @__PURE__ */ jsxs("p", { className: "text-muted-foreground text-sm hidden lg:block", children: [
              game.resourceCount || 0,
              " resources",
              " ",
              /* @__PURE__ */ jsx(
                Button,
                {
                  size: "sm",
                  variant: "link",
                  onClick: () => {
                    sendMessage({ text: "What resources are you using?" });
                  },
                  children: "What are they?"
                }
              )
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx(Link, { to: "/games", children: /* @__PURE__ */ jsxs(Button, { variant: "ghost", children: [
        /* @__PURE__ */ jsx("span", { className: "text-2xl", children: "✕" }),
        /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Close chat" })
      ] }) })
    ] })
  ] });
}
const meta$7 = ({
  data
}) => {
  if (!data?.game) {
    return createMeta({
      title: "Game Not Found | GameGame"
    });
  }
  return createMeta({
    title: createGameTitle(data.game.name),
    description: `Get instant answers about ${data.game.name} rules. Ask questions and get AI-powered responses based on the official rulebook.`
  });
};
async function loader$5({
  params,
  context
}) {
  const {
    gameId
  } = params;
  const {
    cloudflare
  } = context;
  const db = getDb(cloudflare.env.DB);
  const game = await db.select({
    id: games$1.id,
    name: games$1.name,
    slug: games$1.slug,
    year: games$1.year,
    imageUrl: games$1.imageUrl,
    bggUrl: games$1.bggUrl,
    resourceCount: db.$count(resources, eq(resources.gameId, games$1.id))
  }).from(games$1).where(eq(games$1.slug, gameId)).get();
  if (!game) {
    throw new Response("Game not found", {
      status: 404
    });
  }
  return {
    game
  };
}
const ErrorBoundary2 = UNSAFE_withErrorBoundaryProps(function ErrorBoundary3({
  error
}) {
  if (error instanceof Response) {
    if (error.status === 404) {
      return /* @__PURE__ */ jsx(ErrorState, {
        title: "Game not found",
        message: "The game you're looking for doesn't exist or has been removed."
      });
    }
  }
  return /* @__PURE__ */ jsx(ErrorState, {
    title: "Something went wrong",
    message: "We couldn't load this game right now. Please try again later."
  });
});
const games_$gameId = UNSAFE_withComponentProps(function GameDetail() {
  const {
    game
  } = useLoaderData();
  const [imageError, setImageError] = useState(false);
  return /* @__PURE__ */ jsx(Chat, {
    game,
    imageError,
    setImageError
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary: ErrorBoundary2,
  default: games_$gameId,
  loader: loader$5,
  meta: meta$7
}, Symbol.toStringTag, { value: "Module" }));
const Label = React.forwardRef(
  ({ className, ...props }, ref) => {
    return /* @__PURE__ */ jsx(
      "label",
      {
        ref,
        className: cn(
          "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          className
        ),
        ...props
      }
    );
  }
);
Label.displayName = "Label";
function AlertMessage({
  variant,
  message,
  onDismiss,
  className = ""
}) {
  const variants = {
    error: "bg-destructive text-destructive-foreground",
    success: "bg-green-600 text-white",
    warning: "bg-yellow-600 text-white",
    info: "bg-blue-600 text-white"
  };
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `${variants[variant]} font-bold p-2 lg:p-3 rounded mb-4 flex items-center justify-between gap-3 ${className}`,
      role: "alert",
      children: [
        /* @__PURE__ */ jsx("span", { className: "flex-1", children: message }),
        onDismiss && /* @__PURE__ */ jsx(
          "button",
          {
            onClick: onDismiss,
            className: "hover:opacity-80 transition-opacity shrink-0",
            "aria-label": "Dismiss",
            children: "✕"
          }
        )
      ]
    }
  );
}
function useFormState(initialState) {
  const [values, setValues] = useState(initialState);
  const setField = useCallback((field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  }, []);
  const setFields = useCallback((fields) => {
    setValues((prev) => ({ ...prev, ...fields }));
  }, []);
  const reset = useCallback(
    (newValues) => {
      setValues(newValues || initialState);
    },
    [initialState]
  );
  return { values, setField, setFields, reset };
}
function useAsyncForm(options) {
  const { onSubmit, onSuccess, onError } = options;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const handleSubmit = useCallback(
    async (e, data) => {
      e.preventDefault();
      setLoading(true);
      setError(null);
      setIsSuccess(false);
      try {
        const result = await onSubmit(data);
        setIsSuccess(true);
        if (onSuccess) {
          onSuccess(result);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "An error occurred";
        setError(errorMessage);
        if (onError) {
          onError(err instanceof Error ? err : new Error(errorMessage));
        }
      } finally {
        setLoading(false);
      }
    },
    [onSubmit, onSuccess, onError]
  );
  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setIsSuccess(false);
  }, []);
  return {
    handleSubmit,
    loading,
    error,
    isSuccess,
    reset
  };
}
function useApiForm(options) {
  const { url, method = "POST", headers = {}, onSuccess, onError } = options;
  return useAsyncForm({
    onSubmit: async (data) => {
      const response = await apiClient.fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers
        },
        body: method !== "GET" ? JSON.stringify(data) : void 0
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    },
    onSuccess,
    onError
  });
}
const meta$6 = () => {
  return createMeta({
    title: createLoginTitle(),
    description: "Sign in to GameGame to access admin features and manage board game resources.",
    noIndex: true
    // Don't index login pages
  });
};
const login = UNSAFE_withComponentProps(function Login() {
  const form = useFormState({
    email: ""
  });
  const [sent, setSent] = useState(false);
  const {
    handleSubmit,
    loading,
    error
  } = useApiForm({
    url: "/auth/login",
    method: "POST",
    onSuccess: () => {
      setSent(true);
    }
  });
  return /* @__PURE__ */ jsx(Layout, {
    children: /* @__PURE__ */ jsx("div", {
      className: "flex items-center justify-center min-h-[60vh]",
      children: /* @__PURE__ */ jsxs("div", {
        className: "w-full max-w-md",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "text-center mb-8",
          children: [/* @__PURE__ */ jsx(Heading, {
            className: "text-3xl mb-2",
            children: "Sign In"
          }), /* @__PURE__ */ jsx("p", {
            className: "text-muted-foreground",
            children: "Sign in to continue to GameGame"
          })]
        }), sent ? /* @__PURE__ */ jsx(Card, {
          children: /* @__PURE__ */ jsxs(CardContent, {
            className: "pt-6 text-center",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "mb-4",
              children: [/* @__PURE__ */ jsx("p", {
                className: "text-lg font-medium mb-2",
                children: "Check your email!"
              }), /* @__PURE__ */ jsxs("p", {
                className: "text-sm text-muted-foreground",
                children: ["We've sent a magic link to ", /* @__PURE__ */ jsx("strong", {
                  children: form.values.email
                })]
              })]
            }), /* @__PURE__ */ jsx(Link, {
              to: "/games",
              className: "inline-block text-blue-600 hover:underline text-sm",
              children: "← Back to games"
            })]
          })
        }) : /* @__PURE__ */ jsx(Card, {
          children: /* @__PURE__ */ jsx(CardContent, {
            className: "pt-6",
            children: /* @__PURE__ */ jsxs("form", {
              onSubmit: (e) => handleSubmit(e, form.values),
              className: "space-y-4",
              children: [error && /* @__PURE__ */ jsx(AlertMessage, {
                variant: "error",
                message: error
              }), /* @__PURE__ */ jsxs("div", {
                className: "space-y-2",
                children: [/* @__PURE__ */ jsx(Label, {
                  htmlFor: "email",
                  children: "Email address"
                }), /* @__PURE__ */ jsx(Input, {
                  id: "email",
                  type: "email",
                  value: form.values.email,
                  onChange: (e) => form.setField("email", e.target.value),
                  required: true,
                  placeholder: "you@example.com"
                })]
              }), /* @__PURE__ */ jsx(Button, {
                type: "submit",
                disabled: loading || !form.values.email,
                className: "w-full",
                children: loading ? "Sending..." : "Send magic link"
              }), /* @__PURE__ */ jsx("div", {
                className: "text-center",
                children: /* @__PURE__ */ jsx(Link, {
                  to: "/games",
                  className: "text-sm text-muted-foreground hover:underline",
                  children: "← Back to games"
                })
              })]
            })
          })
        })]
      })
    })
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: login,
  meta: meta$6
}, Symbol.toStringTag, { value: "Module" }));
const meta$5 = () => {
  return createMeta({
    title: createVerifyTitle(),
    description: "Verifying your email address...",
    noIndex: true
    // Don't index verification pages
  });
};
const errorResponseSchema = z.object({
  error: z.string()
});
const login_verify = UNSAFE_withComponentProps(function LoginVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("verifying");
  const [error, setError] = useState("");
  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setError("No verification token provided");
      return;
    }
    const verifyToken = async () => {
      try {
        const res = await apiClient.fetch(`/auth/verify?token=${encodeURIComponent(token)}`);
        if (res.ok) {
          setStatus("success");
          setTimeout(() => {
            navigate("/admin");
          }, 2e3);
        } else {
          try {
            const json = await res.json();
            const data = errorResponseSchema.parse(json);
            setStatus("error");
            setError(data.error || "Verification failed");
          } catch (parseError) {
            console.error("Failed to parse error response:", parseError);
            setStatus("error");
            setError(`Verification failed (${res.status})`);
          }
        }
      } catch (err) {
        console.error("Verification error:", err);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Failed to verify login link");
      }
    };
    verifyToken();
  }, [searchParams, navigate]);
  return /* @__PURE__ */ jsx(Layout, {
    children: /* @__PURE__ */ jsx("div", {
      className: "flex items-center justify-center min-h-[60vh]",
      children: /* @__PURE__ */ jsx("div", {
        className: "w-full max-w-md",
        children: /* @__PURE__ */ jsx(Card, {
          children: /* @__PURE__ */ jsxs(CardContent, {
            children: [status === "verifying" && /* @__PURE__ */ jsxs("div", {
              className: "text-center py-8",
              children: [/* @__PURE__ */ jsx(Spinner, {
                size: "lg",
                className: "mx-auto mb-4"
              }), /* @__PURE__ */ jsx(Heading, {
                className: "text-xl mb-2",
                children: "Verifying..."
              }), /* @__PURE__ */ jsx("p", {
                className: "text-muted-foreground",
                children: "Please wait while we log you in"
              })]
            }), status === "success" && /* @__PURE__ */ jsxs("div", {
              className: "text-center py-8",
              children: [/* @__PURE__ */ jsx("div", {
                className: "text-green-600 text-5xl mb-4",
                children: "✓"
              }), /* @__PURE__ */ jsx(Heading, {
                className: "text-xl mb-2",
                children: "Success!"
              }), /* @__PURE__ */ jsx("p", {
                className: "text-muted-foreground mb-4",
                children: "You're now logged in"
              }), /* @__PURE__ */ jsx("p", {
                className: "text-sm text-muted-foreground",
                children: "Redirecting..."
              })]
            }), status === "error" && /* @__PURE__ */ jsxs("div", {
              className: "text-center py-8",
              children: [/* @__PURE__ */ jsx("div", {
                className: "text-red-600 text-5xl mb-4",
                children: "✗"
              }), /* @__PURE__ */ jsx(Heading, {
                className: "text-xl mb-2",
                children: "Verification Failed"
              }), /* @__PURE__ */ jsx("p", {
                className: "text-muted-foreground mb-6",
                children: error
              }), /* @__PURE__ */ jsx(Button, {
                onClick: () => navigate("/login"),
                children: "Back to Login"
              })]
            })]
          })
        })
      })
    })
  });
});
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: login_verify,
  meta: meta$5
}, Symbol.toStringTag, { value: "Module" }));
function AdminLayout({ children }) {
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen flex flex-col", children: [
    /* @__PURE__ */ jsx("header", { className: "container mx-auto px-4 py-6 border-b border-border", children: /* @__PURE__ */ jsxs(Link, { to: "/", className: "flex items-center space-x-2", children: [
      /* @__PURE__ */ jsx(Dices, { className: "w-6 h-6" }),
      /* @__PURE__ */ jsxs("h1", { className: "text-xl lg:text-2xl font-bold", children: [
        "gamegame ",
        /* @__PURE__ */ jsx("span", { className: "text-sm text-muted-foreground", children: "/ admin" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx("main", { className: "container mx-auto px-4 py-6 flex-1", children }),
    /* @__PURE__ */ jsx(Footer, {})
  ] });
}
function Breadcrumbs({ items }) {
  if (items.length === 0) return null;
  return /* @__PURE__ */ jsx("nav", { className: "flex items-center gap-2 text-sm text-muted-foreground mb-8", children: items.map((item, index2) => {
    const isLast = index2 === items.length - 1;
    return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
      item.href && !isLast ? /* @__PURE__ */ jsx(
        Link,
        {
          to: item.href,
          className: "hover:text-foreground transition-colors",
          children: item.label
        }
      ) : /* @__PURE__ */ jsx("span", { className: isLast ? "text-foreground font-medium" : "", children: item.label }),
      !isLast && /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4" })
    ] }, index2);
  }) });
}
function PageHeader({
  breadcrumbs,
  title,
  description,
  stats,
  actions,
  className = ""
}) {
  return /* @__PURE__ */ jsxs("div", { className: `mb-8 ${className}`, children: [
    breadcrumbs && breadcrumbs.length > 0 && /* @__PURE__ */ jsx(Breadcrumbs, { items: breadcrumbs }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex-1 min-w-0", children: [
        /* @__PURE__ */ jsx("h1", { className: "text-3xl lg:text-4xl font-extrabold tracking-tight", children: title }),
        description && /* @__PURE__ */ jsx("p", { className: "mt-2 text-base text-muted-foreground max-w-3xl", children: description }),
        stats && /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: stats })
      ] }),
      actions && /* @__PURE__ */ jsx("div", { className: "flex items-center gap-2 flex-shrink-0", children: actions })
    ] })
  ] });
}
function EmptyState({
  title,
  description,
  icon,
  action,
  minHeight = "min-h-64",
  className = ""
}) {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted ${minHeight} ${className}`,
      children: [
        /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center gap-1 text-center max-w-md", children: [
          icon && /* @__PURE__ */ jsx("div", { className: "mb-2 text-muted-foreground", children: icon }),
          /* @__PURE__ */ jsx("h3", { className: "text-2xl font-bold tracking-tight", children: title }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: description })
        ] }),
        action && /* @__PURE__ */ jsx(Fragment, { children: action.href ? /* @__PURE__ */ jsx(Button, { asChild: true, children: /* @__PURE__ */ jsx(Link, { to: action.href, children: action.label }) }) : /* @__PURE__ */ jsx(Button, { onClick: action.onClick, children: action.label }) })
      ]
    }
  );
}
const Table = React.forwardRef(
  ({ className, ...props }, ref) => /* @__PURE__ */ jsx("div", { className: "relative w-full overflow-auto", children: /* @__PURE__ */ jsx(
    "table",
    {
      ref,
      className: cn("w-full caption-bottom text-sm", className),
      ...props
    }
  ) })
);
Table.displayName = "Table";
const TableHeader = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("thead", { ref, className: cn("[&_tr]:border-b", className), ...props }));
TableHeader.displayName = "TableHeader";
const TableBody = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "tbody",
  {
    ref,
    className: cn("[&_tr:last-child]:border-0", className),
    ...props
  }
));
TableBody.displayName = "TableBody";
const TableRow = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "tr",
  {
    ref,
    className: cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    ),
    ...props
  }
));
TableRow.displayName = "TableRow";
const TableHead = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "th",
  {
    ref,
    className: cn(
      "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    ),
    ...props
  }
));
TableHead.displayName = "TableHead";
const TableCell = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "td",
  {
    ref,
    className: cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className),
    ...props
  }
));
TableCell.displayName = "TableCell";
const meta$4 = () => {
  return createMeta({
    title: createAdminTitle("Games"),
    description: "Manage board games, upload rulebooks, and configure game resources.",
    noIndex: true
    // Don't index admin pages
  });
};
async function loader$4({
  context
}) {
  const res = await context.api.fetch("/games");
  if (!res.ok) {
    throw new Error("Failed to load games");
  }
  const data = await res.json();
  const games2 = gamesListSchema.parse(data);
  return {
    games: games2
  };
}
const admin = UNSAFE_withComponentProps(function AdminGames() {
  const navigate = useNavigate();
  const {
    games: initialGames
  } = useLoaderData();
  const [games2, setGames] = useState(initialGames);
  const {
    addToast
  } = useFlashNotifications();
  const handleDelete = async (gameId, name) => {
    if (!confirm(`Delete ${name}? This will remove all resources.`)) {
      return;
    }
    try {
      const response = await apiClient.fetch(`/games/${gameId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        setGames(games2.filter((g) => g.id !== gameId));
        addToast("success", `Deleted ${name} successfully!`);
      } else {
        addToast("error", "Failed to delete game. Please try again.");
      }
    } catch (error) {
      console.error("Delete error:", error);
      addToast("error", "Failed to delete game. Please try again.");
    }
  };
  return /* @__PURE__ */ jsxs(AdminLayout, {
    children: [/* @__PURE__ */ jsx(PageHeader, {
      breadcrumbs: [{
        label: "Admin"
      }],
      title: "Games",
      actions: /* @__PURE__ */ jsx(Button, {
        asChild: true,
        children: /* @__PURE__ */ jsx(Link, {
          to: "/admin/add-game",
          children: "Add Game"
        })
      })
    }), games2.length === 0 ? /* @__PURE__ */ jsx(EmptyState, {
      title: "There are no games",
      description: "Start by adding a game.",
      action: {
        label: "Add Game",
        href: "/admin/add-game"
      }
    }) : /* @__PURE__ */ jsxs("div", {
      className: "flex flex-col gap-4",
      children: [/* @__PURE__ */ jsxs(Table, {
        children: [/* @__PURE__ */ jsx(TableHeader, {
          children: /* @__PURE__ */ jsxs(TableRow, {
            children: [/* @__PURE__ */ jsx(TableHead, {
              className: "w-[88px]",
              children: "Image"
            }), /* @__PURE__ */ jsx(TableHead, {
              children: "Name"
            }), /* @__PURE__ */ jsx(TableHead, {
              className: "w-[160px] text-center",
              children: "Actions"
            })]
          })
        }), /* @__PURE__ */ jsx(TableBody, {
          children: games2.map((game) => {
            const hasResources = (game.resourceCount || 0) > 0;
            return /* @__PURE__ */ jsxs(TableRow, {
              className: "cursor-pointer hover:bg-muted/50",
              onClick: () => navigate(`/admin/games/${game.id}`),
              children: [/* @__PURE__ */ jsx(TableCell, {
                children: /* @__PURE__ */ jsx(Link, {
                  to: `/admin/games/${game.id}`,
                  children: game.imageUrl ? /* @__PURE__ */ jsx("img", {
                    src: game.imageUrl,
                    alt: game.name,
                    className: "w-16 h-16 object-cover rounded bg-muted"
                  }) : /* @__PURE__ */ jsx("div", {
                    className: "w-16 h-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground",
                    children: "No image"
                  })
                })
              }), /* @__PURE__ */ jsxs(TableCell, {
                className: "font-medium align-middle",
                children: [/* @__PURE__ */ jsx(Link, {
                  to: `/admin/games/${game.id}`,
                  className: "hover:underline",
                  children: game.name
                }), game.bggUrl && /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-muted-foreground mt-1",
                  children: /* @__PURE__ */ jsx("a", {
                    href: game.bggUrl,
                    target: "_blank",
                    rel: "noreferrer",
                    className: "hover:underline",
                    children: game.bggUrl
                  })
                }), !hasResources && /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-red-500 mt-1",
                  children: "No resources yet"
                })]
              }), /* @__PURE__ */ jsx(TableCell, {
                className: "text-center",
                children: /* @__PURE__ */ jsx(Button, {
                  size: "sm",
                  variant: "destructive",
                  onClick: () => handleDelete(game.id, game.name),
                  children: "Delete"
                })
              })]
            }, game.id);
          })
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "self-end",
        children: /* @__PURE__ */ jsx(Button, {
          asChild: true,
          variant: "secondary",
          size: "sm",
          children: /* @__PURE__ */ jsx(Link, {
            to: "/admin/add-game",
            children: "Add Game"
          })
        })
      })]
    })]
  });
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: admin,
  loader: loader$4,
  meta: meta$4
}, Symbol.toStringTag, { value: "Module" }));
const meta$3 = () => {
  return createMeta({
    title: createAdminTitle("Add Game"),
    description: "Add a new board game to GameGame.",
    noIndex: true
  });
};
const admin_addGame = UNSAFE_withComponentProps(function AdminAddGame() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [bggResults, setBggResults] = useState([]);
  const [importing, setImporting] = useState(false);
  const {
    addToast
  } = useFlashNotifications();
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await apiClient.fetch(`/bgg/search?q=${encodeURIComponent(searchQuery)}`);
      if (response.ok) {
        const data = bggGamesListSchema.parse(await response.json());
        setBggResults(data);
      } else {
        addToast("error", "Failed to search BGG. Please try again.");
      }
    } catch (error) {
      console.error("BGG search error:", error);
      addToast("error", "Failed to search BGG. Please try again.");
    } finally {
      setSearching(false);
    }
  };
  const handleImportFromBGG = async (bggGameId) => {
    setImporting(true);
    try {
      const response = await apiClient.fetch(`/bgg/games/${bggGameId}/import`, {
        method: "POST"
      });
      if (response.ok) {
        const game = gameSchema.parse(await response.json());
        addToast("success", `Successfully imported ${game.name}!`);
        navigate(`/admin/games/${game.id}`);
      } else {
        addToast("error", "Failed to import game from BGG. Please try again.");
      }
    } catch (error) {
      console.error("Import error:", error);
      addToast("error", "Failed to import game from BGG. Please try again.");
    } finally {
      setImporting(false);
    }
  };
  return /* @__PURE__ */ jsxs(AdminLayout, {
    children: [/* @__PURE__ */ jsx(PageHeader, {
      breadcrumbs: [{
        label: "Admin",
        href: "/admin"
      }, {
        label: "Games",
        href: "/admin"
      }, {
        label: "Add Game"
      }],
      title: "Add Game",
      description: "Search BoardGameGeek to pull in official art and metadata. You can always refine the details after importing."
    }), /* @__PURE__ */ jsxs("div", {
      className: "mx-auto max-w-4xl space-y-8",
      children: [/* @__PURE__ */ jsxs(Card, {
        children: [/* @__PURE__ */ jsxs(CardHeader, {
          className: "space-y-2",
          children: [/* @__PURE__ */ jsx(CardTitle, {
            className: "text-2xl font-semibold",
            children: "Find your game"
          }), /* @__PURE__ */ jsx(CardDescription, {
            className: "text-muted-foreground",
            children: "Search BoardGameGeek to import official box art, year, and metadata. You can always tweak details later or switch to manual entry."
          })]
        }), /* @__PURE__ */ jsx(CardContent, {
          children: /* @__PURE__ */ jsxs("form", {
            onSubmit: handleSearch,
            className: "space-y-4",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "flex flex-col gap-3 md:flex-row",
              children: [/* @__PURE__ */ jsx(Input, {
                type: "text",
                value: searchQuery,
                onChange: (e) => setSearchQuery(e.target.value),
                placeholder: "Search for a game...",
                className: "flex-1"
              }), /* @__PURE__ */ jsx(Button, {
                type: "submit",
                disabled: searching,
                className: "md:w-auto",
                children: searching ? /* @__PURE__ */ jsx(Spinner, {
                  size: "sm"
                }) : "Search"
              })]
            }), /* @__PURE__ */ jsx("p", {
              className: "text-xs text-muted-foreground",
              children: "Tip: include the publisher or edition to narrow things down."
            })]
          })
        })]
      }), bggResults.length > 0 ? /* @__PURE__ */ jsx("div", {
        className: "space-y-3",
        children: bggResults.map((game) => /* @__PURE__ */ jsx(Card, {
          className: "hover:bg-accent/30 transition-colors",
          onClick: () => handleImportFromBGG(game.id),
          children: /* @__PURE__ */ jsxs(CardContent, {
            className: "flex items-center gap-4 p-4",
            children: [game.thumbnail ? /* @__PURE__ */ jsx("div", {
              className: "relative h-20 w-20 overflow-hidden rounded-md border border-border bg-muted",
              children: /* @__PURE__ */ jsx("img", {
                src: game.thumbnail,
                alt: game.name,
                className: "h-full w-full object-cover",
                loading: "lazy"
              })
            }) : /* @__PURE__ */ jsx("div", {
              className: "flex h-20 w-20 items-center justify-center rounded-md border border-dashed text-2xl text-muted-foreground",
              children: "🎲"
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex-1 min-w-0",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "flex items-baseline justify-between gap-4",
                children: [/* @__PURE__ */ jsx("h4", {
                  className: "text-lg font-semibold truncate",
                  children: game.name
                }), game.yearPublished && /* @__PURE__ */ jsx("span", {
                  className: "text-sm text-muted-foreground",
                  children: game.yearPublished
                })]
              }), /* @__PURE__ */ jsx("p", {
                className: "mt-1 text-sm text-muted-foreground truncate",
                children: game.bggUrl
              })]
            }), /* @__PURE__ */ jsx(Button, {
              variant: "secondary",
              size: "sm",
              disabled: importing,
              onClick: (e) => {
                e.stopPropagation();
                handleImportFromBGG(game.id);
              },
              children: importing ? /* @__PURE__ */ jsx(Spinner, {
                size: "sm"
              }) : "Import"
            })]
          })
        }, game.id))
      }) : !searching && /* @__PURE__ */ jsx(Card, {
        className: "border-dashed",
        children: /* @__PURE__ */ jsxs(CardContent, {
          className: "flex flex-col items-center justify-center gap-3 py-14 text-center",
          children: [/* @__PURE__ */ jsx("div", {
            className: "rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground",
            children: "No results yet"
          }), /* @__PURE__ */ jsx("p", {
            className: "max-w-sm text-sm text-muted-foreground",
            children: "Try searching for your game above using the BoardGameGeek search."
          })]
        })
      })]
    })]
  });
});
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: admin_addGame,
  meta: meta$3
}, Symbol.toStringTag, { value: "Module" }));
const Tabs = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx("div", { ref, className: cn("w-full", className), ...props }));
Tabs.displayName = "Tabs";
const TabsList = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    ),
    ...props
  }
));
TabsList.displayName = "TabsList";
const TabsTrigger = React.forwardRef(
  ({ className, active, ...props }, ref) => /* @__PURE__ */ jsx(
    "button",
    {
      ref,
      className: cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/50",
        className
      ),
      ...props
    }
  )
);
TabsTrigger.displayName = "TabsTrigger";
const TabsContent = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  "div",
  {
    ref,
    className: cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    ),
    ...props
  }
));
TabsContent.displayName = "TabsContent";
const meta$2 = ({
  data
}) => {
  if (!data?.game) {
    return createMeta({
      title: createAdminTitle("Game Not Found"),
      noIndex: true
    });
  }
  return createMeta({
    title: createAdminTitle(data.game.name),
    description: `Manage resources and settings for ${data.game.name}.`,
    noIndex: true
  });
};
async function loader$3({
  params,
  context
}) {
  const gameResponse = await context.api.fetch(`/games/${params.gameId}`);
  if (!gameResponse.ok) {
    if (gameResponse.status === 404) {
      throw new Response("Game not found", {
        status: 404
      });
    }
    throw new Error(`Failed to load game (${gameResponse.status})`);
  }
  const gameData = gameSchema.parse(await gameResponse.json());
  const resourcesResponse = await context.api.fetch(`/games/${params.gameId}/resources`);
  if (!resourcesResponse.ok) {
    throw new Error(`Failed to load resources (${resourcesResponse.status})`);
  }
  const extendedResourcesListSchema = z.array(resourceSchema.extend({
    status: z.string().optional(),
    processingStage: z.string().optional(),
    currentJobId: z.string().nullable().optional(),
    originalFilename: z.string().optional(),
    description: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    attributionUrl: z.string().nullable().optional()
  }));
  const resourcesData = extendedResourcesListSchema.parse(await resourcesResponse.json());
  return {
    game: gameData,
    resources: resourcesData
  };
}
const admin_games_$gameId = UNSAFE_withComponentProps(function AdminGameLayout() {
  const {
    gameId
  } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    game,
    resources: resources2
  } = useLoaderData();
  const {
    addJobNotification,
    addToast
  } = useFlashNotifications();
  const isAttachmentsTab = location.pathname.endsWith("/attachments");
  const activeTab = isAttachmentsTab ? "attachments" : "details";
  const handleReprocessAll = async () => {
    if (!confirm(`Reprocess all ${resources2.length} resources for "${game.name}"?

This will re-extract PDFs, re-analyze images, and re-embed all content.`)) {
      return;
    }
    try {
      let successCount = 0;
      let failCount = 0;
      for (const resource of resources2) {
        const response = await apiClient.fetch(`/resources/${resource.id}/reprocess`, {
          method: "POST"
        });
        if (response.ok) {
          const data = uploadResponseSchema.parse(await response.json());
          addJobNotification(data.jobId, "Full Reprocess", `Reprocessing ${resource.name}`);
          successCount++;
        } else {
          failCount++;
        }
      }
      if (failCount === 0) {
        addToast("success", `Reprocessing ${successCount} ${successCount === 1 ? "resource" : "resources"}`);
      } else {
        addToast("warning", `Started ${successCount} jobs, ${failCount} failed`);
      }
    } catch (error) {
      console.error("Reprocess all error:", error);
      addToast("error", "Failed to reprocess resources");
    }
  };
  const handleDeleteGame = async () => {
    const confirmMessage = `Are you sure you want to delete "${game.name}"?

This will permanently delete:
- The game
- All resources
- All fragments and embeddings
- All associated files

This action cannot be undone.`;
    if (!confirm(confirmMessage)) return;
    try {
      const response = await apiClient.fetch(`/games/${gameId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        const data = deleteGameResponseSchema.parse(await response.json());
        if (data.warnings && data.warnings.length > 0) {
          addToast("warning", `Game deleted, but some cleanup operations failed: ${data.warnings.join(", ")}`, 5e3);
          setTimeout(() => navigate("/admin/games"), 3e3);
        } else {
          addToast("success", `Deleted ${game.name}`);
          navigate("/admin/games");
        }
      } else {
        const errorData = await response.json().catch(() => ({
          error: "Unknown error"
        }));
        addToast("error", `Failed to delete game: ${errorData.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Delete game error:", error);
      addToast("error", "Failed to delete game. Please try again.");
    }
  };
  return /* @__PURE__ */ jsxs(AdminLayout, {
    children: [/* @__PURE__ */ jsx(PageHeader, {
      breadcrumbs: [{
        label: "Admin",
        href: "/admin"
      }, {
        label: "Games",
        href: "/admin"
      }, {
        label: game.name
      }],
      title: game.name,
      stats: resources2.length > 0 ? `${resources2.length} ${resources2.length === 1 ? "resource" : "resources"}` : void 0
    }), /* @__PURE__ */ jsxs("div", {
      className: "grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8",
      children: [/* @__PURE__ */ jsx("div", {
        children: /* @__PURE__ */ jsxs(Tabs, {
          children: [/* @__PURE__ */ jsxs(TabsList, {
            className: "mb-6",
            children: [/* @__PURE__ */ jsx(TabsTrigger, {
              active: activeTab === "details",
              onClick: () => navigate(`/admin/games/${gameId}`),
              children: "Details"
            }), /* @__PURE__ */ jsx(TabsTrigger, {
              active: activeTab === "attachments",
              onClick: () => navigate(`/admin/games/${gameId}/attachments`),
              children: "Attachments"
            })]
          }), /* @__PURE__ */ jsx(TabsContent, {
            children: /* @__PURE__ */ jsx(Outlet, {
              context: {
                game,
                resources: resources2
              }
            })
          })]
        })
      }), /* @__PURE__ */ jsxs("div", {
        className: "lg:sticky lg:top-8 lg:self-start space-y-8",
        children: [resources2.length > 0 && /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h3", {
            className: "text-sm font-semibold mb-3",
            children: "Reprocessing"
          }), /* @__PURE__ */ jsx("button", {
            onClick: handleReprocessAll,
            className: "w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group",
            children: /* @__PURE__ */ jsxs("div", {
              className: "flex items-start gap-3",
              children: [/* @__PURE__ */ jsx(RefreshCw, {
                className: "h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground"
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex-1 min-w-0",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "font-medium text-sm mb-1",
                  children: "Reprocess All Resources"
                }), /* @__PURE__ */ jsxs("div", {
                  className: "text-xs text-muted-foreground leading-relaxed",
                  children: ["Re-extract all PDFs, re-analyze images, and re-embed content for all ", resources2.length, " ", resources2.length === 1 ? "resource" : "resources"]
                })]
              })]
            })
          })]
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h3", {
            className: "text-sm font-semibold mb-3",
            children: "Danger Zone"
          }), /* @__PURE__ */ jsx("button", {
            onClick: handleDeleteGame,
            className: "w-full text-left p-3 rounded-lg border border-red-500/50 bg-card hover:bg-red-500/10 hover:border-red-500 transition-colors group",
            children: /* @__PURE__ */ jsxs("div", {
              className: "flex items-start gap-3",
              children: [/* @__PURE__ */ jsx(Trash2, {
                className: "h-4 w-4 mt-0.5 text-red-500"
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex-1 min-w-0",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "font-medium text-sm mb-1 text-red-500",
                  children: "Delete Game"
                }), /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-muted-foreground leading-relaxed",
                  children: "Permanently delete this game and all associated resources"
                })]
              })]
            })
          })]
        })]
      })]
    })]
  });
});
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: admin_games_$gameId,
  loader: loader$3,
  meta: meta$2
}, Symbol.toStringTag, { value: "Module" }));
function useTimeout(callback, delay) {
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay === null) {
      return;
    }
    const id = setTimeout(() => savedCallback.current(), delay);
    return () => clearTimeout(id);
  }, [delay]);
}
const DEFAULT_AUTO_HIDE = 3e3;
function SaveButton({
  status,
  isLoading = false,
  autoHideMs = DEFAULT_AUTO_HIDE,
  onStatusTimeout,
  children,
  disabled,
  className,
  ...buttonProps
}) {
  useTimeout(
    () => {
      onStatusTimeout?.();
    },
    status !== "idle" && !isLoading ? autoHideMs : null
  );
  return /* @__PURE__ */ jsxs(
    "button",
    {
      ...buttonProps,
      disabled: isLoading || disabled,
      className: clsx(
        "inline-flex items-center justify-center gap-2 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70",
        className
      ),
      children: [
        isLoading && /* @__PURE__ */ jsx(Loader2, { className: "h-4 w-4 animate-spin" }),
        /* @__PURE__ */ jsx("span", { children: children ?? "Save Changes" })
      ]
    }
  );
}
const imageUploadResponseSchema = z.object({
  url: z.string()
});
const admin_games_$gameId_details = UNSAFE_withComponentProps(function GameDetailsTab() {
  const {
    gameId
  } = useParams();
  const navigate = useNavigate();
  const {
    game: initialGame,
    resources: initialResources
  } = useOutletContext();
  const [game, setGame] = useState(initialGame);
  const [resources2, setResources] = useState(initialResources);
  const [gameName, setGameName] = useState(initialGame.name || "");
  const [gameBggUrl, setGameBggUrl] = useState(initialGame.bggUrl || "");
  const [gameImageUrl, setGameImageUrl] = useState(initialGame.imageUrl);
  const [gameImageFile, setGameImageFile] = useState(null);
  const [updatingGame, setUpdatingGame] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("idle");
  const [isDragging, setIsDragging] = useState(false);
  const {
    addJobNotification,
    addToast
  } = useFlashNotifications();
  const handleUpdateGame = async (e) => {
    e.preventDefault();
    setUpdatingGame(true);
    setUpdateStatus("idle");
    try {
      const payload = {};
      if (gameName !== game?.name) {
        payload.name = gameName;
      }
      if (gameBggUrl.trim() && gameBggUrl !== (game?.bggUrl || "")) {
        payload.bggUrl = gameBggUrl.trim();
      } else if (!gameBggUrl.trim() && game?.bggUrl) {
        payload.bggUrl = null;
      }
      if (gameImageFile) {
        const formData = new FormData();
        formData.append("file", gameImageFile);
        const uploadResponse = await apiClient.fetch("/images/upload", {
          method: "POST",
          body: formData
        });
        if (uploadResponse.ok) {
          const uploadData = imageUploadResponseSchema.parse(await uploadResponse.json());
          payload.imageUrl = uploadData.url;
        }
      }
      const response = await apiClient.fetch(`/games/${gameId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const updatedGame = gameSchema.parse(await response.json());
        setGame(updatedGame);
        setGameName(updatedGame.name || "");
        setGameBggUrl(updatedGame.bggUrl || "");
        setGameImageUrl(updatedGame.imageUrl);
        setGameImageFile(null);
        setUpdateStatus("success");
        addToast("success", "Game details saved successfully!");
      } else {
        setUpdateStatus("error");
        addToast("error", "Failed to save game details. Please try again.");
      }
    } catch (error) {
      console.error("Update error:", error);
      setUpdateStatus("error");
      addToast("error", "Failed to save game details. Please try again.");
    } finally {
      setUpdatingGame(false);
    }
  };
  const handleImageChange = (file) => {
    const url = URL.createObjectURL(file);
    setGameImageUrl(url);
    setGameImageFile(file);
  };
  const handleResourceFiles = async (files) => {
    if (!gameId) return;
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", file.name);
        const uploadResponse = await apiClient.fetch(`/games/${gameId}/resources`, {
          method: "POST",
          body: formData
        });
        if (uploadResponse.ok) {
          const data = uploadResponseSchema.parse(await uploadResponse.json());
          addJobNotification(data.jobId, "Upload Resource", `Processing ${file.name}`);
        } else {
          addToast("error", `Failed to upload ${file.name}`);
        }
      } catch (error) {
        console.error("Upload error:", error);
        addToast("error", `Failed to upload ${file.name}`);
      }
    }
  };
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
    if (files.length > 0) {
      handleResourceFiles(files);
    }
  }, [gameId]);
  const triggerFileInput = (e) => {
    e.stopPropagation();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf";
    input.multiple = true;
    input.onchange = (e2) => {
      const files = Array.from(e2.target.files || []);
      handleResourceFiles(files);
    };
    input.click();
  };
  const handleReprocess = async (resourceId, resourceName) => {
    try {
      const response = await apiClient.fetch(`/resources/${resourceId}/reprocess`, {
        method: "POST"
      });
      if (response.ok) {
        const data = uploadResponseSchema.parse(await response.json());
        addJobNotification(data.jobId, "Full Reprocess", `Reprocessing ${resourceName}`);
      } else {
        addToast("error", "Failed to reprocess resource");
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      addToast("error", "Failed to reprocess resource");
    }
  };
  const handleDelete = async (resourceId, resourceName) => {
    if (!confirm(`Delete resource "${resourceName}"?`)) return;
    try {
      const response = await apiClient.fetch(`/resources/${resourceId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        setResources(resources2.filter((r) => r.id !== resourceId));
        addToast("success", `Deleted ${resourceName}`);
      } else {
        addToast("error", "Failed to delete resource");
      }
    } catch (error) {
      console.error("Delete error:", error);
      addToast("error", "Failed to delete resource");
    }
  };
  return /* @__PURE__ */ jsxs("div", {
    className: "space-y-12",
    children: [/* @__PURE__ */ jsxs(Card, {
      className: "max-w-2xl",
      children: [/* @__PURE__ */ jsx(CardHeader, {
        children: /* @__PURE__ */ jsx(CardTitle, {
          children: "Game Details"
        })
      }), /* @__PURE__ */ jsx(CardContent, {
        children: /* @__PURE__ */ jsxs("form", {
          onSubmit: handleUpdateGame,
          className: "space-y-6",
          children: [/* @__PURE__ */ jsxs("div", {
            className: "space-y-2",
            children: [/* @__PURE__ */ jsx(Label, {
              htmlFor: "name",
              children: "Name"
            }), /* @__PURE__ */ jsx(Input, {
              id: "name",
              type: "text",
              value: gameName,
              onChange: (e) => setGameName(e.target.value),
              placeholder: "Settlers of Catan",
              required: true
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "space-y-2",
            children: [/* @__PURE__ */ jsx(Label, {
              htmlFor: "bggUrl",
              children: "BGG URL"
            }), /* @__PURE__ */ jsx(Input, {
              id: "bggUrl",
              type: "text",
              value: gameBggUrl,
              onChange: (e) => setGameBggUrl(e.target.value),
              placeholder: "e.g. https://boardgamegeek.com/boardgame/13/catan"
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: "space-y-2",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "flex items-center justify-between",
              children: [/* @__PURE__ */ jsx(Label, {
                children: "Box Art"
              }), gameImageUrl && /* @__PURE__ */ jsx(Button, {
                type: "button",
                variant: "outline",
                size: "sm",
                onClick: () => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageChange(file);
                  };
                  input.click();
                },
                children: "Upload Image"
              })]
            }), /* @__PURE__ */ jsx("div", {
              className: "relative max-h-96 max-w-96 cursor-pointer",
              onClick: () => {
                if (!gameImageUrl) {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = (e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageChange(file);
                  };
                  input.click();
                }
              },
              onDragOver: (e) => {
                e.preventDefault();
                e.stopPropagation();
              },
              onDrop: (e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith("image/")) {
                  handleImageChange(file);
                }
              },
              children: /* @__PURE__ */ jsx(Card, {
                children: /* @__PURE__ */ jsx(CardContent, {
                  className: "flex flex-col items-center",
                  children: gameImageUrl ? /* @__PURE__ */ jsx("div", {
                    className: "w-full aspect-[3/2] overflow-hidden relative",
                    children: /* @__PURE__ */ jsx("img", {
                      src: gameImageUrl,
                      alt: "Box Art",
                      className: "w-full h-full object-cover object-top"
                    })
                  }) : /* @__PURE__ */ jsx("div", {
                    className: "p-6",
                    children: "Drag an image to upload"
                  })
                })
              })
            })]
          }), /* @__PURE__ */ jsx(SaveButton, {
            type: "submit",
            status: updateStatus,
            isLoading: updatingGame,
            onStatusTimeout: () => setUpdateStatus("idle"),
            children: "Update Game"
          })]
        })
      })]
    }), /* @__PURE__ */ jsxs("div", {
      children: [/* @__PURE__ */ jsx("h2", {
        className: "text-2xl font-bold mb-6",
        children: "Resources"
      }), /* @__PURE__ */ jsx("div", {
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDrop,
        children: resources2.length === 0 ? /* @__PURE__ */ jsx("div", {
          className: `flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border ${isDragging ? "border-primary bg-primary/10" : "border-dashed"} shadow-sm p-6 bg-muted min-h-64 cursor-pointer hover:bg-muted/80 transition-colors`,
          onClick: triggerFileInput,
          children: /* @__PURE__ */ jsxs("div", {
            className: "flex flex-col items-center gap-1 text-center",
            children: [/* @__PURE__ */ jsx("h3", {
              className: "text-2xl font-bold tracking-tight",
              children: "There are no resources"
            }), /* @__PURE__ */ jsx("p", {
              className: "text-sm text-muted-foreground",
              children: "Drag a PDF file of a rulebook here, or click to browse files."
            })]
          })
        }) : /* @__PURE__ */ jsxs("div", {
          className: "flex flex-col gap-4",
          children: [/* @__PURE__ */ jsx("div", {
            className: "flex justify-end",
            children: /* @__PURE__ */ jsx(Button, {
              onClick: triggerFileInput,
              children: "Add Resource"
            })
          }), /* @__PURE__ */ jsxs(Table, {
            children: [/* @__PURE__ */ jsx(TableHeader, {
              children: /* @__PURE__ */ jsxs(TableRow, {
                children: [/* @__PURE__ */ jsx(TableHead, {
                  children: "Resource"
                }), /* @__PURE__ */ jsx(TableHead, {
                  className: "w-[180px] text-center",
                  children: "Last Processed"
                }), /* @__PURE__ */ jsx(TableHead, {
                  className: "w-[60px] text-center",
                  children: "Version"
                }), /* @__PURE__ */ jsx(TableHead, {
                  className: "w-[120px] text-center",
                  children: "Actions"
                })]
              })
            }), /* @__PURE__ */ jsx(TableBody, {
              children: resources2.map((resource) => {
                const stats = [resource.pageCount && `${resource.pageCount} pages`, resource.imageCount > 0 && `${resource.imageCount} images`, resource.wordCount > 0 && `${(resource.wordCount / 1e3).toFixed(1)}k words`].filter(Boolean).join(", ");
                return /* @__PURE__ */ jsxs(TableRow, {
                  className: "cursor-pointer hover:bg-muted/50",
                  onClick: () => {
                    navigate(`/admin/games/${gameId}/resources/${resource.id}`);
                  },
                  children: [/* @__PURE__ */ jsxs(TableCell, {
                    children: [/* @__PURE__ */ jsx(Link, {
                      to: `/admin/games/${gameId}/resources/${resource.id}`,
                      className: "font-semibold hover:underline",
                      onClick: (e) => e.stopPropagation(),
                      children: resource.name
                    }), stats && /* @__PURE__ */ jsx("div", {
                      className: "text-xs text-muted-foreground mt-1",
                      children: stats
                    })]
                  }), /* @__PURE__ */ jsx(TableCell, {
                    className: "text-sm text-muted-foreground text-center align-middle",
                    children: resource.processedAt ? new Date(resource.processedAt).toLocaleString() : "-"
                  }), /* @__PURE__ */ jsx(TableCell, {
                    className: "text-center align-middle",
                    children: resource.version
                  }), /* @__PURE__ */ jsx(TableCell, {
                    className: "text-center align-middle",
                    children: /* @__PURE__ */ jsxs("div", {
                      className: "flex items-center justify-center gap-2",
                      children: [/* @__PURE__ */ jsx(Button, {
                        size: "sm",
                        variant: "ghost",
                        className: "h-8 w-8 p-0",
                        onClick: (e) => {
                          e.stopPropagation();
                          handleReprocess(resource.id, resource.name);
                        },
                        title: "Reprocess",
                        children: /* @__PURE__ */ jsx(RefreshCw, {
                          className: "h-4 w-4"
                        })
                      }), /* @__PURE__ */ jsx(Button, {
                        size: "sm",
                        variant: "ghost",
                        className: "h-8 w-8 p-0",
                        asChild: true,
                        title: "Download PDF",
                        onClick: (e) => e.stopPropagation(),
                        children: /* @__PURE__ */ jsx("a", {
                          href: resource.url,
                          target: "_blank",
                          rel: "noopener noreferrer",
                          children: /* @__PURE__ */ jsx(Download, {
                            className: "h-4 w-4"
                          })
                        })
                      }), /* @__PURE__ */ jsx(Button, {
                        size: "sm",
                        variant: "ghost",
                        className: "h-8 w-8 p-0",
                        onClick: (e) => {
                          e.stopPropagation();
                          handleDelete(resource.id, resource.name);
                        },
                        title: "Delete",
                        children: /* @__PURE__ */ jsx(Trash2, {
                          className: "h-4 w-4 text-red-500"
                        })
                      })]
                    })
                  })]
                }, resource.id);
              })
            })]
          })]
        })
      })]
    })]
  });
});
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: admin_games_$gameId_details
}, Symbol.toStringTag, { value: "Module" }));
const attachmentSchema = z.object({
  id: z.string(),
  resourceId: z.string(),
  resourceName: z.string(),
  type: z.string(),
  url: z.string(),
  mimeType: z.string(),
  originalFilename: z.string().nullable(),
  pageNumber: z.number().nullable(),
  caption: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  description: z.string().nullable(),
  isGoodQuality: z.boolean().nullable(),
  createdAt: z.string()
});
const attachmentsListSchema = z.array(attachmentSchema);
async function loader$2({
  params,
  context
}) {
  const response = await context.api.fetch(`/games/${params.gameId}/attachments`);
  if (!response.ok) {
    throw new Error(`Failed to load attachments (${response.status})`);
  }
  const attachmentsData = attachmentsListSchema.parse(await response.json());
  return {
    attachments: attachmentsData
  };
}
const admin_games_$gameId_attachments = UNSAFE_withComponentProps(function GameAttachmentsTab() {
  const {
    gameId
  } = useParams();
  const {
    attachments: attachments2
  } = useLoaderData();
  const groupedByResource = attachments2.reduce((acc, attachment) => {
    const key = attachment.resourceId;
    if (!acc[key]) {
      acc[key] = {
        resourceName: attachment.resourceName,
        resourceId: attachment.resourceId,
        attachments: []
      };
    }
    acc[key].attachments.push(attachment);
    return acc;
  }, {});
  const resources2 = Object.values(groupedByResource);
  if (attachments2.length === 0) {
    return /* @__PURE__ */ jsx("div", {
      className: "flex flex-1 flex-col gap-6 items-center justify-center rounded-lg border border-dashed shadow-sm p-6 bg-muted min-h-64",
      children: /* @__PURE__ */ jsxs("div", {
        className: "flex flex-col items-center gap-1 text-center",
        children: [/* @__PURE__ */ jsx("h3", {
          className: "text-2xl font-bold tracking-tight",
          children: "No attachments yet"
        }), /* @__PURE__ */ jsx("p", {
          className: "text-sm text-muted-foreground",
          children: "Attachments are extracted from PDF resources when they are processed."
        })]
      })
    });
  }
  return /* @__PURE__ */ jsxs("div", {
    className: "space-y-8",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "text-sm text-muted-foreground",
      children: [attachments2.length, " ", attachments2.length === 1 ? "attachment" : "attachments", " across ", resources2.length, " ", resources2.length === 1 ? "resource" : "resources"]
    }), resources2.map((resource) => /* @__PURE__ */ jsxs("div", {
      className: "space-y-4",
      children: [/* @__PURE__ */ jsxs("h2", {
        className: "text-xl font-semibold",
        children: [/* @__PURE__ */ jsx(Link, {
          to: `/admin/games/${gameId}/resources/${resource.resourceId}`,
          className: "hover:underline",
          children: resource.resourceName
        }), /* @__PURE__ */ jsxs("span", {
          className: "text-sm text-muted-foreground font-normal ml-2",
          children: ["(", resource.attachments.length, " ", resource.attachments.length === 1 ? "attachment" : "attachments", ")"]
        })]
      }), /* @__PURE__ */ jsx("div", {
        className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4",
        children: resource.attachments.map((attachment) => /* @__PURE__ */ jsxs(Link, {
          to: `/admin/games/${gameId}/resources/${attachment.resourceId}/attachments/${attachment.id}`,
          className: "group relative aspect-square rounded-lg border border-border bg-card hover:border-primary/50 overflow-hidden transition-colors",
          children: [/* @__PURE__ */ jsx("img", {
            src: attachment.url,
            alt: attachment.caption || attachment.originalFilename || "Attachment",
            className: "w-full h-full object-cover",
            loading: "lazy"
          }), /* @__PURE__ */ jsx("div", {
            className: "absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity",
            children: /* @__PURE__ */ jsxs("div", {
              className: "absolute bottom-0 left-0 right-0 p-3 text-white",
              children: [attachment.pageNumber && /* @__PURE__ */ jsxs("div", {
                className: "text-xs font-medium mb-1",
                children: ["Page ", attachment.pageNumber]
              }), attachment.caption && /* @__PURE__ */ jsx("div", {
                className: "text-xs line-clamp-2",
                children: attachment.caption
              }), attachment.isGoodQuality === false && /* @__PURE__ */ jsx("div", {
                className: "text-xs text-yellow-300 mt-1",
                children: "⚠ Low quality"
              })]
            })
          }), attachment.pageNumber && /* @__PURE__ */ jsxs("div", {
            className: "absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded",
            children: ["p", attachment.pageNumber]
          })]
        }, attachment.id))
      })]
    }, resource.resourceId))]
  });
});
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: admin_games_$gameId_attachments,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const admin_games_$gameId_edit = UNSAFE_withComponentProps(function EditGame() {
  const {
    gameId
  } = useParams();
  if (!gameId) {
    return /* @__PURE__ */ jsx(Navigate, {
      to: "/admin/games",
      replace: true
    });
  }
  return /* @__PURE__ */ jsx(Navigate, {
    to: `/admin/games/${gameId}`,
    replace: true
  });
});
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: admin_games_$gameId_edit
}, Symbol.toStringTag, { value: "Module" }));
function AttachmentList({ attachments: attachments2, gameId, resourceId }) {
  if (attachments2.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: "text-sm text-muted-foreground", children: "No media attachments found for this resource." });
  }
  return /* @__PURE__ */ jsx("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4", children: attachments2.map((attachment) => {
    return /* @__PURE__ */ jsxs(
      "div",
      {
        className: "border rounded-lg overflow-hidden hover:border-primary transition-colors group relative",
        children: [
          /* @__PURE__ */ jsx(
            "a",
            {
              href: attachment.url,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "block",
              children: attachment.type === "image" && attachment.mimeType?.startsWith("image/") ? /* @__PURE__ */ jsx("div", { className: "relative aspect-square bg-muted flex items-center justify-center", children: /* @__PURE__ */ jsx(
                "img",
                {
                  src: attachment.url,
                  alt: attachment.caption || attachment.originalFilename || "Attachment",
                  className: "w-full h-full object-contain"
                }
              ) }) : /* @__PURE__ */ jsx("div", { className: "relative aspect-square bg-muted flex items-center justify-center", children: /* @__PURE__ */ jsx(FileIcon, { className: "h-12 w-12 text-muted-foreground" }) })
            }
          ),
          /* @__PURE__ */ jsx(
            Link,
            {
              to: `/admin/games/${gameId}/resources/${resourceId}/attachments/${attachment.id}`,
              className: "absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 hover:bg-background border rounded-md p-1.5",
              title: "Edit attachment",
              children: /* @__PURE__ */ jsx(Pencil, { className: "h-4 w-4" })
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "p-2 space-y-1", children: [
            /* @__PURE__ */ jsx("div", { className: "flex items-center justify-between gap-1", children: attachment.pageNumber && /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground", children: [
              "Page ",
              attachment.pageNumber
            ] }) }),
            attachment.caption && /* @__PURE__ */ jsx("p", { className: "text-xs line-clamp-2", title: attachment.caption, children: attachment.caption }),
            attachment.originalFilename && /* @__PURE__ */ jsx(
              "p",
              {
                className: "text-xs text-muted-foreground font-mono truncate",
                title: attachment.originalFilename,
                children: attachment.originalFilename
              }
            ),
            attachment.width && attachment.height && /* @__PURE__ */ jsxs("p", { className: "text-xs text-muted-foreground", children: [
              attachment.width,
              " × ",
              attachment.height
            ] })
          ] })
        ]
      },
      attachment.id
    );
  }) });
}
const meta$1 = ({
  data
}) => {
  if (!data?.resource) {
    return createMeta({
      title: createAdminTitle("Resource Not Found"),
      noIndex: true
    });
  }
  return createMeta({
    title: createAdminTitle(data.resource.name, data.game.name),
    description: `Manage ${data.resource.name} for ${data.game.name}.`,
    noIndex: true
  });
};
const extendedResourceSchema = resourceSchema.extend({
  originalFilename: z.string().optional(),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  attributionUrl: z.string().nullable().optional(),
  content: z.string().optional()
  // createdAt and updatedAt already defined in base schema as coerced numbers
});
async function loader$1({
  params,
  context
}) {
  const [resourceRes, attachmentsRes, gameRes] = await Promise.all([context.api.fetch(`/resources/${params.resourceId}`), context.api.fetch(`/resources/${params.resourceId}/attachments`), context.api.fetch(`/games/${params.gameId}`)]);
  if (!resourceRes.ok) throw new Error("Resource not found");
  if (!attachmentsRes.ok) throw new Error("Failed to load attachments");
  if (!gameRes.ok) throw new Error("Game not found");
  const [resourceJson, attachmentsJson, gameJson] = await Promise.all([resourceRes.json(), attachmentsRes.json(), gameRes.json()]);
  const resource = extendedResourceSchema.parse(resourceJson);
  const attachments2 = attachmentsListSchema$1.parse(attachmentsJson);
  const game = gameJson;
  return {
    resource,
    attachments: attachments2,
    game
  };
}
const admin_games_$gameId_resources_$resourceId = UNSAFE_withComponentProps(function AdminResourceDetail() {
  const {
    gameId,
    resourceId
  } = useParams();
  const {
    resource: initialResource,
    attachments: attachments2,
    game
  } = useLoaderData();
  const [resource, setResource] = useState(initialResource);
  const [name, setName] = useState(initialResource.name || "");
  const [content, setContent] = useState(initialResource.content || "");
  const [description, setDescription] = useState(initialResource.description || "");
  const [author, setAuthor] = useState(initialResource.author || "");
  const [attributionUrl, setAttributionUrl] = useState(initialResource.attributionUrl || "");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const {
    addToast,
    addPendingJobNotification,
    updatePendingJobWithId
  } = useFlashNotifications();
  const {
    notifications,
    removeNotification
  } = useNotifications();
  const completedJobsRef = useRef(/* @__PURE__ */ new Set());
  useEffect(() => {
    const jobNotifications = notifications.filter((n) => n.type === "job");
    for (const job of jobNotifications) {
      if (job.status === "completed" && !completedJobsRef.current.has(job.jobId)) {
        completedJobsRef.current.add(job.jobId);
        const reloadResource = async () => {
          try {
            const response = await apiClient.fetch(`/resources/${resourceId}`);
            if (response.ok) {
              const updatedResource = extendedResourceSchema.parse(await response.json());
              setResource(updatedResource);
              setName(updatedResource.name || "");
              setContent(updatedResource.content || "");
              setDescription(updatedResource.description || "");
              setAuthor(updatedResource.author || "");
              setAttributionUrl(updatedResource.attributionUrl || "");
              console.log("Resource data reloaded after job completion");
            }
          } catch (error) {
            console.error("Failed to reload resource after job completion:", error);
          }
        };
        reloadResource();
      }
    }
  }, [notifications, resourceId]);
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("idle");
    try {
      const payload = {
        name,
        // Note: content is managed by the processing pipeline and cannot be updated directly
        description: description.trim() ? description : null,
        author: author.trim() ? author : null,
        attributionUrl: attributionUrl.trim() ? attributionUrl : null
      };
      const response = await apiClient.fetch(`/resources/${resource.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const updatedResource = extendedResourceSchema.parse(await response.json());
        setResource((prev) => prev ? {
          ...prev,
          ...updatedResource
        } : updatedResource);
        setName(updatedResource.name || "");
        setContent(updatedResource.content || "");
        setDescription(updatedResource.description || "");
        setAuthor(updatedResource.author || "");
        setAttributionUrl(updatedResource.attributionUrl || "");
        setSaveStatus("success");
        addToast("success", "Resource details saved successfully!");
      } else {
        setSaveStatus("error");
        addToast("error", "Failed to save resource details. Please try again.");
      }
    } catch (error) {
      console.error("Update error:", error);
      setSaveStatus("error");
      addToast("error", "Failed to save resource details. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const handleReprocess = async (from = "cleanup") => {
    const jobTitles = {
      ingest: {
        title: "Full Reprocess",
        description: "Complete pipeline from scratch"
      },
      vision: {
        title: "Improve Image Descriptions",
        description: "Re-analyzing image content"
      },
      cleanup: {
        title: "Clean Up Markdown",
        description: "Fixing formatting issues"
      },
      metadata: {
        title: "Regenerate Metadata",
        description: "Updating document title and description"
      },
      embed: {
        title: "Regenerate Embeddings",
        description: "Updating search index"
      }
    };
    const {
      title,
      description: description2
    } = jobTitles[from];
    const notificationId = addPendingJobNotification(title, description2);
    try {
      const url = from === "ingest" ? `/resources/${resourceId}/reprocess` : `/resources/${resourceId}/reprocess?from=${from}`;
      const response = await apiClient.fetch(url, {
        method: "POST"
      });
      if (response.ok) {
        const data = await response.json();
        if (data.jobId) {
          updatePendingJobWithId(notificationId, data.jobId);
        } else {
          removeNotification(notificationId);
          addToast("success", data.message || "Resource queued for reprocessing.");
        }
      } else {
        removeNotification(notificationId);
        const error = await response.json();
        addToast("error", error.error || "Failed to reprocess resource");
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      removeNotification(notificationId);
      addToast("error", "Failed to reprocess resource");
    }
  };
  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete "${resource.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const response = await apiClient.fetch(`/resources/${resourceId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        addToast("success", "Resource deleted successfully");
        window.location.href = `/admin/games/${gameId}`;
      } else {
        const error = await response.json();
        addToast("error", error.error || "Failed to delete resource");
      }
    } catch (error) {
      console.error("Delete error:", error);
      addToast("error", "Failed to delete resource");
    }
  };
  if (!resource) {
    return /* @__PURE__ */ jsx(AdminLayout, {
      children: /* @__PURE__ */ jsxs("div", {
        className: "text-center py-12",
        children: [/* @__PURE__ */ jsx("p", {
          className: "text-xl mb-4",
          children: "Resource not found"
        }), /* @__PURE__ */ jsx(Button, {
          asChild: true,
          children: /* @__PURE__ */ jsx(Link, {
            to: `/admin/games/${gameId}`,
            children: "Back to Game"
          })
        })]
      })
    });
  }
  const stats = [typeof resource.fragmentCount === "number" ? `${resource.fragmentCount.toLocaleString()} chunks` : null, typeof resource.pageCount === "number" ? `${resource.pageCount} pages` : null, resource.imageCount > 0 ? `${resource.imageCount} images` : null, resource.wordCount > 0 ? `${(resource.wordCount / 1e3).toFixed(1)}k words` : null].filter(Boolean).join(" • ");
  return /* @__PURE__ */ jsxs(AdminLayout, {
    children: [/* @__PURE__ */ jsx(PageHeader, {
      breadcrumbs: [{
        label: "Admin",
        href: "/admin"
      }, {
        label: "Games",
        href: "/admin"
      }, {
        label: game.name,
        href: `/admin/games/${gameId}`
      }, {
        label: resource.name
      }],
      title: resource.name,
      stats
    }), /* @__PURE__ */ jsxs("div", {
      className: "grid grid-cols-1 lg:grid-cols-[1fr,380px] gap-8",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "space-y-12",
        children: [/* @__PURE__ */ jsxs(Card, {
          className: "max-w-2xl",
          children: [/* @__PURE__ */ jsx(CardHeader, {
            children: /* @__PURE__ */ jsx(CardTitle, {
              children: "Resource Details"
            })
          }), /* @__PURE__ */ jsx(CardContent, {
            children: /* @__PURE__ */ jsxs("form", {
              onSubmit: handleSave,
              className: "space-y-6",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "space-y-2",
                children: [/* @__PURE__ */ jsx(Label, {
                  htmlFor: "name",
                  children: "Document Title"
                }), /* @__PURE__ */ jsx(Input, {
                  id: "name",
                  type: "text",
                  value: name,
                  onChange: (e) => setName(e.target.value),
                  placeholder: "Game Manual.pdf",
                  required: true
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "space-y-2",
                children: [/* @__PURE__ */ jsx(Label, {
                  htmlFor: "originalFilename",
                  children: "Original Filename"
                }), /* @__PURE__ */ jsx(Input, {
                  id: "originalFilename",
                  type: "text",
                  value: resource.originalFilename,
                  readOnly: true,
                  className: "font-mono"
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "space-y-2",
                children: [/* @__PURE__ */ jsx(Label, {
                  htmlFor: "description",
                  children: "Description"
                }), /* @__PURE__ */ jsx("textarea", {
                  id: "description",
                  value: description,
                  onChange: (e) => setDescription(e.target.value),
                  rows: 4,
                  placeholder: "Short description of this resource",
                  className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono"
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "space-y-2",
                children: [/* @__PURE__ */ jsx(Label, {
                  htmlFor: "author",
                  children: "Author / Creator"
                }), /* @__PURE__ */ jsx(Input, {
                  id: "author",
                  type: "text",
                  value: author,
                  onChange: (e) => setAuthor(e.target.value),
                  placeholder: "e.g. Fantasy Flight Games"
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "space-y-2",
                children: [/* @__PURE__ */ jsx(Label, {
                  htmlFor: "attributionUrl",
                  children: "Attribution URL"
                }), /* @__PURE__ */ jsx(Input, {
                  id: "attributionUrl",
                  type: "url",
                  value: attributionUrl,
                  onChange: (e) => setAttributionUrl(e.target.value),
                  placeholder: "https://publisher.com/rulebook"
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: "space-y-2",
                children: [/* @__PURE__ */ jsx(Label, {
                  htmlFor: "content",
                  children: "Markdown Content"
                }), /* @__PURE__ */ jsx("textarea", {
                  id: "content",
                  value: content,
                  readOnly: true,
                  rows: 16,
                  placeholder: "Markdown Content",
                  className: "w-full rounded-md border border-input bg-muted px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground font-mono cursor-not-allowed"
                }), /* @__PURE__ */ jsx("p", {
                  className: "text-xs text-muted-foreground",
                  children: 'Content is managed by the processing pipeline. Use the "Advanced Reprocessing" panel to regenerate content.'
                })]
              }), /* @__PURE__ */ jsx(SaveButton, {
                type: "submit",
                status: saveStatus,
                isLoading: saving,
                onStatusTimeout: () => setSaveStatus("idle")
              })]
            })
          })]
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h2", {
            className: "text-2xl font-bold mb-6",
            children: "Media Attachments"
          }), /* @__PURE__ */ jsx(AttachmentList, {
            attachments: attachments2,
            gameId,
            resourceId
          })]
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "space-y-8",
        children: [/* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h3", {
            className: "text-sm font-semibold mb-3",
            children: "Reprocessing"
          }), /* @__PURE__ */ jsxs("div", {
            className: "space-y-2",
            children: [/* @__PURE__ */ jsx("button", {
              onClick: () => handleReprocess("ingest"),
              className: "w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group",
              children: /* @__PURE__ */ jsxs("div", {
                className: "flex items-start gap-3",
                children: [/* @__PURE__ */ jsx(RefreshCw, {
                  className: "h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground"
                }), /* @__PURE__ */ jsxs("div", {
                  className: "flex-1 min-w-0",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "font-medium text-sm mb-1",
                    children: "Full Reprocess"
                  }), /* @__PURE__ */ jsx("div", {
                    className: "text-xs text-muted-foreground leading-relaxed",
                    children: "Complete pipeline from scratch"
                  })]
                })]
              })
            }), /* @__PURE__ */ jsx("button", {
              onClick: () => handleReprocess("vision"),
              className: "w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group",
              children: /* @__PURE__ */ jsxs("div", {
                className: "flex items-start gap-3",
                children: [/* @__PURE__ */ jsx(RefreshCw, {
                  className: "h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground"
                }), /* @__PURE__ */ jsxs("div", {
                  className: "flex-1 min-w-0",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "font-medium text-sm mb-1",
                    children: "Improve Image Descriptions"
                  }), /* @__PURE__ */ jsx("div", {
                    className: "text-xs text-muted-foreground leading-relaxed",
                    children: "Re-analyze image content"
                  })]
                })]
              })
            }), /* @__PURE__ */ jsx("button", {
              onClick: () => handleReprocess("cleanup"),
              className: "w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group",
              children: /* @__PURE__ */ jsxs("div", {
                className: "flex items-start gap-3",
                children: [/* @__PURE__ */ jsx(RefreshCw, {
                  className: "h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground"
                }), /* @__PURE__ */ jsxs("div", {
                  className: "flex-1 min-w-0",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "font-medium text-sm mb-1",
                    children: "Clean Up Markdown"
                  }), /* @__PURE__ */ jsx("div", {
                    className: "text-xs text-muted-foreground leading-relaxed",
                    children: "Fix formatting issues"
                  })]
                })]
              })
            }), /* @__PURE__ */ jsx("button", {
              onClick: () => handleReprocess("metadata"),
              className: "w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group",
              children: /* @__PURE__ */ jsxs("div", {
                className: "flex items-start gap-3",
                children: [/* @__PURE__ */ jsx(RefreshCw, {
                  className: "h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground"
                }), /* @__PURE__ */ jsxs("div", {
                  className: "flex-1 min-w-0",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "font-medium text-sm mb-1",
                    children: "Regenerate Metadata"
                  }), /* @__PURE__ */ jsx("div", {
                    className: "text-xs text-muted-foreground leading-relaxed",
                    children: "Update document title and description"
                  })]
                })]
              })
            }), /* @__PURE__ */ jsx("button", {
              onClick: () => handleReprocess("embed"),
              className: "w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group",
              children: /* @__PURE__ */ jsxs("div", {
                className: "flex items-start gap-3",
                children: [/* @__PURE__ */ jsx(RefreshCw, {
                  className: "h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground"
                }), /* @__PURE__ */ jsxs("div", {
                  className: "flex-1 min-w-0",
                  children: [/* @__PURE__ */ jsx("div", {
                    className: "font-medium text-sm mb-1",
                    children: "Regenerate Embeddings"
                  }), /* @__PURE__ */ jsx("div", {
                    className: "text-xs text-muted-foreground leading-relaxed",
                    children: "Update search index"
                  })]
                })]
              })
            })]
          })]
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h3", {
            className: "text-sm font-semibold mb-3",
            children: "Download"
          }), /* @__PURE__ */ jsx("a", {
            href: resource.url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "block w-full text-left p-3 rounded-lg border border-border bg-card hover:bg-accent hover:border-accent-foreground/20 transition-colors group",
            children: /* @__PURE__ */ jsxs("div", {
              className: "flex items-start gap-3",
              children: [/* @__PURE__ */ jsx(Download, {
                className: "h-4 w-4 mt-0.5 text-muted-foreground group-hover:text-foreground"
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex-1 min-w-0",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "font-medium text-sm mb-1",
                  children: "Download PDF"
                }), /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-muted-foreground leading-relaxed",
                  children: "Get the original source file"
                })]
              })]
            })
          })]
        }), /* @__PURE__ */ jsxs("div", {
          children: [/* @__PURE__ */ jsx("h3", {
            className: "text-sm font-semibold mb-3",
            children: "Danger Zone"
          }), /* @__PURE__ */ jsx("button", {
            onClick: handleDelete,
            className: "w-full text-left p-3 rounded-lg border border-red-500/50 bg-card hover:bg-red-500/10 hover:border-red-500 transition-colors group",
            children: /* @__PURE__ */ jsxs("div", {
              className: "flex items-start gap-3",
              children: [/* @__PURE__ */ jsx(Trash2, {
                className: "h-4 w-4 mt-0.5 text-red-500"
              }), /* @__PURE__ */ jsxs("div", {
                className: "flex-1 min-w-0",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "font-medium text-sm mb-1 text-red-500",
                  children: "Delete Resource"
                }), /* @__PURE__ */ jsx("div", {
                  className: "text-xs text-muted-foreground leading-relaxed",
                  children: "Permanently removes all data"
                })]
              })]
            })
          })]
        })]
      })]
    })]
  });
});
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: admin_games_$gameId_resources_$resourceId,
  loader: loader$1,
  meta: meta$1
}, Symbol.toStringTag, { value: "Module" }));
const meta = ({
  data
}) => {
  if (!data?.attachment) {
    return createMeta({
      title: createAdminTitle("Attachment Not Found"),
      noIndex: true
    });
  }
  const attachmentName = data.attachment.originalFilename || data.attachment.description || `Attachment ${data.attachment.id}`;
  return createMeta({
    title: createAdminTitle(attachmentName, data.resource.name, data.game.name),
    description: `Edit attachment from ${data.resource.name}.`,
    noIndex: true
  });
};
const extendedAttachmentSchema = attachmentSchema$1.extend({
  description: z.string().nullable().optional(),
  isGoodQuality: z.boolean().nullable().optional()
});
async function loader({
  params,
  context
}) {
  const [attachmentRes, resourceRes, gameRes] = await Promise.all([context.api.fetch(`/attachments/${params.attachmentId}`), context.api.fetch(`/resources/${params.resourceId}`), context.api.fetch(`/games/${params.gameId}`)]);
  if (!attachmentRes.ok) throw new Error("Attachment not found");
  if (!resourceRes.ok) throw new Error("Resource not found");
  if (!gameRes.ok) throw new Error("Game not found");
  const [attachmentJson, resourceJson, gameJson] = await Promise.all([attachmentRes.json(), resourceRes.json(), gameRes.json()]);
  const attachment = extendedAttachmentSchema.parse(attachmentJson);
  const resource = resourceJson;
  const game = gameJson;
  return {
    attachment,
    resource,
    game
  };
}
const admin_games_$gameId_resources_$resourceId_attachments_$attachmentId = UNSAFE_withComponentProps(function AdminEditAttachment() {
  const {
    gameId,
    resourceId
  } = useParams();
  const {
    attachment: initialAttachment,
    resource,
    game
  } = useLoaderData();
  const [attachment, setAttachment] = useState(initialAttachment);
  const [description, setDescription] = useState(initialAttachment.description || "");
  const [originalFilename, setOriginalFilename] = useState(initialAttachment.originalFilename || "");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [reprocessing, setReprocessing] = useState(false);
  const {
    addToast
  } = useFlashNotifications();
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveStatus("idle");
    try {
      const payload = {
        description: description.trim() ? description : null,
        originalFilename: originalFilename.trim() ? originalFilename : null
      };
      const response = await apiClient.fetch(`/attachments/${attachment.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        const updatedAttachment = extendedAttachmentSchema.parse(await response.json());
        setAttachment(updatedAttachment);
        setDescription(updatedAttachment.description || "");
        setOriginalFilename(updatedAttachment.originalFilename || "");
        setSaveStatus("success");
        addToast("success", "Attachment details saved successfully!");
      } else {
        setSaveStatus("error");
        addToast("error", "Failed to save attachment details. Please try again.");
      }
    } catch (error) {
      console.error("Update error:", error);
      setSaveStatus("error");
      addToast("error", "Failed to save attachment details. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      const response = await apiClient.fetch(`/attachments/${attachment.id}/reprocess`, {
        method: "POST"
      });
      if (response.ok) {
        const updatedAttachment = extendedAttachmentSchema.parse(await response.json());
        setAttachment(updatedAttachment);
        setDescription(updatedAttachment.description || "");
        addToast("success", "Vision analysis completed successfully!");
      } else {
        const errorJson = await response.json();
        const errorMsg = errorJson.error || "Unknown error";
        addToast("error", `Reprocessing failed: ${errorMsg}`);
      }
    } catch (error) {
      console.error("Reprocess error:", error);
      addToast("error", "Failed to reprocess attachment");
    } finally {
      setReprocessing(false);
    }
  };
  return /* @__PURE__ */ jsxs(AdminLayout, {
    children: [/* @__PURE__ */ jsx(PageHeader, {
      breadcrumbs: [{
        label: "Admin",
        href: "/admin"
      }, {
        label: "Games",
        href: "/admin"
      }, {
        label: game.name,
        href: `/admin/games/${gameId}`
      }, {
        label: resource.name,
        href: `/admin/games/${gameId}/resources/${resourceId}`
      }, {
        label: "Edit Attachment"
      }],
      title: "Edit Attachment",
      stats: attachment.pageNumber ? `Page ${attachment.pageNumber}` : void 0
    }), /* @__PURE__ */ jsxs("div", {
      className: "space-y-12",
      children: [/* @__PURE__ */ jsxs("div", {
        children: [/* @__PURE__ */ jsx(Label, {
          className: "mb-2 block",
          children: "Preview"
        }), /* @__PURE__ */ jsx("div", {
          className: "border rounded-lg overflow-hidden max-w-2xl bg-muted",
          children: attachment.type === "image" && attachment.mimeType?.startsWith("image/") ? /* @__PURE__ */ jsx("img", {
            src: attachment.url,
            alt: attachment.description || attachment.originalFilename || "Attachment",
            className: "w-full"
          }) : /* @__PURE__ */ jsx("div", {
            className: "flex items-center justify-center p-12",
            children: /* @__PURE__ */ jsx("p", {
              className: "text-muted-foreground",
              children: "Preview not available"
            })
          })
        }), attachment.width && attachment.height && /* @__PURE__ */ jsxs("p", {
          className: "text-sm text-muted-foreground mt-2",
          children: [attachment.width, " × ", attachment.height]
        }), attachment.isGoodQuality !== null && /* @__PURE__ */ jsxs("p", {
          className: "text-sm text-muted-foreground mt-1",
          children: ["Quality: ", attachment.isGoodQuality ? "✓ Good" : "✗ Bad"]
        })]
      }), /* @__PURE__ */ jsxs(Card, {
        className: "max-w-2xl",
        children: [/* @__PURE__ */ jsx(CardHeader, {
          children: /* @__PURE__ */ jsx(CardTitle, {
            children: "Attachment Details"
          })
        }), /* @__PURE__ */ jsx(CardContent, {
          children: /* @__PURE__ */ jsxs("form", {
            onSubmit: handleSave,
            className: "space-y-6",
            children: [/* @__PURE__ */ jsxs("div", {
              className: "space-y-2",
              children: [/* @__PURE__ */ jsx(Label, {
                htmlFor: "originalFilename",
                children: "Filename"
              }), /* @__PURE__ */ jsx(Input, {
                id: "originalFilename",
                type: "text",
                value: originalFilename,
                onChange: (e) => setOriginalFilename(e.target.value),
                placeholder: "image.png"
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "space-y-2",
              children: [/* @__PURE__ */ jsx(Label, {
                htmlFor: "description",
                children: "Description"
              }), /* @__PURE__ */ jsx("textarea", {
                id: "description",
                value: description,
                onChange: (e) => setDescription(e.target.value),
                rows: 4,
                placeholder: "AI-generated description of the image content",
                className: "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              }), /* @__PURE__ */ jsx("p", {
                className: "text-xs text-muted-foreground",
                children: "This description helps the AI understand what's in the image when answering questions."
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: "flex gap-4",
              children: [/* @__PURE__ */ jsx(SaveButton, {
                type: "submit",
                status: saveStatus,
                isLoading: saving,
                onStatusTimeout: () => setSaveStatus("idle")
              }), /* @__PURE__ */ jsx(Button, {
                type: "button",
                variant: "outline",
                onClick: handleReprocess,
                disabled: reprocessing,
                children: reprocessing ? /* @__PURE__ */ jsxs(Fragment, {
                  children: [/* @__PURE__ */ jsx(Spinner, {
                    size: "sm",
                    className: "mr-2"
                  }), "Reprocessing..."]
                }) : /* @__PURE__ */ jsxs(Fragment, {
                  children: [/* @__PURE__ */ jsx(RefreshCw, {
                    className: "h-4 w-4 mr-2"
                  }), "Reprocess with Vision"]
                })
              })]
            })]
          })
        })]
      }), /* @__PURE__ */ jsxs(Card, {
        className: "max-w-2xl",
        children: [/* @__PURE__ */ jsx(CardHeader, {
          children: /* @__PURE__ */ jsx(CardTitle, {
            children: "Metadata"
          })
        }), /* @__PURE__ */ jsx(CardContent, {
          children: /* @__PURE__ */ jsxs("dl", {
            className: "grid grid-cols-2 gap-4 text-sm",
            children: [/* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("dt", {
                className: "font-medium text-muted-foreground",
                children: "ID"
              }), /* @__PURE__ */ jsx("dd", {
                className: "font-mono",
                children: attachment.id
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("dt", {
                className: "font-medium text-muted-foreground",
                children: "Type"
              }), /* @__PURE__ */ jsx("dd", {
                children: attachment.type
              })]
            }), /* @__PURE__ */ jsxs("div", {
              children: [/* @__PURE__ */ jsx("dt", {
                className: "font-medium text-muted-foreground",
                children: "MIME Type"
              }), /* @__PURE__ */ jsx("dd", {
                className: "font-mono",
                children: attachment.mimeType || "N/A"
              })]
            }), attachment.caption && /* @__PURE__ */ jsxs("div", {
              className: "col-span-2",
              children: [/* @__PURE__ */ jsx("dt", {
                className: "font-medium text-muted-foreground",
                children: "Caption"
              }), /* @__PURE__ */ jsx("dd", {
                children: attachment.caption
              })]
            })]
          })
        })]
      })]
    })]
  });
});
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: admin_games_$gameId_resources_$resourceId_attachments_$attachmentId,
  loader,
  meta
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-BdAkpNmB.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/root-NKscd1_W.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/useFlashNotifications-C7fjaguF.js", "/assets/clsx-B-dksMZM.js", "/assets/load-context-D2Z0WZnA.js"], "css": ["/assets/root-B0Bq4Hyv.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/home": { "id": "routes/home", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/home-CM1mTOLX.js", "imports": ["/assets/meta-CNUq8pDr.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/games": { "id": "routes/games", "parentId": "root", "path": "games", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/games-BoP3ZPyd.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/Layout-CdM4gSDL.js", "/assets/Heading-BI2qZzop.js", "/assets/card-wVL4LoAa.js", "/assets/input-zx54fJn0.js", "/assets/meta-CNUq8pDr.js", "/assets/Footer-DTQqYS18.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/utils-CyyZbp74.js", "/assets/clsx-B-dksMZM.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/games.$gameId": { "id": "routes/games.$gameId", "parentId": "root", "path": "games/:gameId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/games._gameId-J-jDyykd.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/Layout-CdM4gSDL.js", "/assets/card-wVL4LoAa.js", "/assets/button-CEVJ8gNb.js", "/assets/schemas-q1bgCdS2.js", "/assets/input-zx54fJn0.js", "/assets/spinner-BGxtjiPJ.js", "/assets/load-context-D2Z0WZnA.js", "/assets/Footer-DTQqYS18.js", "/assets/utils-CyyZbp74.js", "/assets/meta-CNUq8pDr.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/clsx-B-dksMZM.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/login": { "id": "routes/login", "parentId": "root", "path": "login", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/login-BUEacuHB.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/Layout-CdM4gSDL.js", "/assets/button-CEVJ8gNb.js", "/assets/input-zx54fJn0.js", "/assets/label-Byw-aLkP.js", "/assets/card-wVL4LoAa.js", "/assets/Heading-BI2qZzop.js", "/assets/load-context-D2Z0WZnA.js", "/assets/meta-CNUq8pDr.js", "/assets/Footer-DTQqYS18.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/utils-CyyZbp74.js", "/assets/clsx-B-dksMZM.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/login.verify": { "id": "routes/login.verify", "parentId": "root", "path": "login/verify", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/login.verify-b6p4b1MQ.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/Layout-CdM4gSDL.js", "/assets/spinner-BGxtjiPJ.js", "/assets/card-wVL4LoAa.js", "/assets/button-CEVJ8gNb.js", "/assets/Heading-BI2qZzop.js", "/assets/load-context-D2Z0WZnA.js", "/assets/meta-CNUq8pDr.js", "/assets/schemas-q1bgCdS2.js", "/assets/Footer-DTQqYS18.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/utils-CyyZbp74.js", "/assets/clsx-B-dksMZM.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin": { "id": "routes/admin", "parentId": "root", "path": "admin", "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin-1UIDCASO.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/PageHeader-B5wU8QjJ.js", "/assets/button-CEVJ8gNb.js", "/assets/useFlashNotifications-C7fjaguF.js", "/assets/table-CNKxbFI8.js", "/assets/load-context-D2Z0WZnA.js", "/assets/meta-CNUq8pDr.js", "/assets/Footer-DTQqYS18.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/utils-CyyZbp74.js", "/assets/clsx-B-dksMZM.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin.add-game": { "id": "routes/admin.add-game", "parentId": "root", "path": "admin/add-game", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin.add-game-DimS584H.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/PageHeader-B5wU8QjJ.js", "/assets/button-CEVJ8gNb.js", "/assets/input-zx54fJn0.js", "/assets/spinner-BGxtjiPJ.js", "/assets/card-wVL4LoAa.js", "/assets/useFlashNotifications-C7fjaguF.js", "/assets/schemas-DjVLYPCh.js", "/assets/load-context-D2Z0WZnA.js", "/assets/meta-CNUq8pDr.js", "/assets/Footer-DTQqYS18.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/utils-CyyZbp74.js", "/assets/clsx-B-dksMZM.js", "/assets/schemas-q1bgCdS2.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin.games.$gameId": { "id": "routes/admin.games.$gameId", "parentId": "root", "path": "admin/games/:gameId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin.games._gameId-D6G4oeZw.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/PageHeader-B5wU8QjJ.js", "/assets/utils-CyyZbp74.js", "/assets/useFlashNotifications-C7fjaguF.js", "/assets/schemas-DjVLYPCh.js", "/assets/load-context-D2Z0WZnA.js", "/assets/meta-CNUq8pDr.js", "/assets/refresh-cw-DDuh3l6L.js", "/assets/trash-2-cpGvWXp4.js", "/assets/Footer-DTQqYS18.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/clsx-B-dksMZM.js", "/assets/schemas-q1bgCdS2.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin.games.$gameId.details": { "id": "routes/admin.games.$gameId.details", "parentId": "routes/admin.games.$gameId", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin.games._gameId.details-BSD3QAjY.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/button-CEVJ8gNb.js", "/assets/input-zx54fJn0.js", "/assets/label-Byw-aLkP.js", "/assets/card-wVL4LoAa.js", "/assets/save-button-xmYfvY0u.js", "/assets/useFlashNotifications-C7fjaguF.js", "/assets/table-CNKxbFI8.js", "/assets/schemas-DjVLYPCh.js", "/assets/load-context-D2Z0WZnA.js", "/assets/refresh-cw-DDuh3l6L.js", "/assets/download--uOzgjC5.js", "/assets/trash-2-cpGvWXp4.js", "/assets/schemas-q1bgCdS2.js", "/assets/utils-CyyZbp74.js", "/assets/clsx-B-dksMZM.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin.games.$gameId.attachments": { "id": "routes/admin.games.$gameId.attachments", "parentId": "routes/admin.games.$gameId", "path": "attachments", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin.games._gameId.attachments-B0lafAMX.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin.games.$gameId.edit": { "id": "routes/admin.games.$gameId.edit", "parentId": "root", "path": "admin/games/:gameId/edit", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin.games._gameId.edit-BUU3FnCH.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin.games.$gameId.resources.$resourceId": { "id": "routes/admin.games.$gameId.resources.$resourceId", "parentId": "root", "path": "admin/games/:gameId/resources/:resourceId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin.games._gameId.resources._resourceId-EdrdiNS2.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/PageHeader-B5wU8QjJ.js", "/assets/button-CEVJ8gNb.js", "/assets/input-zx54fJn0.js", "/assets/label-Byw-aLkP.js", "/assets/save-button-xmYfvY0u.js", "/assets/useFlashNotifications-C7fjaguF.js", "/assets/card-wVL4LoAa.js", "/assets/utils-CyyZbp74.js", "/assets/schemas-DjVLYPCh.js", "/assets/load-context-D2Z0WZnA.js", "/assets/meta-CNUq8pDr.js", "/assets/refresh-cw-DDuh3l6L.js", "/assets/download--uOzgjC5.js", "/assets/trash-2-cpGvWXp4.js", "/assets/schemas-q1bgCdS2.js", "/assets/Footer-DTQqYS18.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/clsx-B-dksMZM.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin.games.$gameId.resources.$resourceId.attachments.$attachmentId": { "id": "routes/admin.games.$gameId.resources.$resourceId.attachments.$attachmentId", "parentId": "root", "path": "admin/games/:gameId/resources/:resourceId/attachments/:attachmentId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin.games._gameId.resources._resourceId.attachments._attachmentId-CtxWVL6G.js", "imports": ["/assets/chunk-OIYGIGL5-CJLaNaD0.js", "/assets/PageHeader-B5wU8QjJ.js", "/assets/useFlashNotifications-C7fjaguF.js", "/assets/button-CEVJ8gNb.js", "/assets/input-zx54fJn0.js", "/assets/label-Byw-aLkP.js", "/assets/spinner-BGxtjiPJ.js", "/assets/save-button-xmYfvY0u.js", "/assets/card-wVL4LoAa.js", "/assets/schemas-DjVLYPCh.js", "/assets/load-context-D2Z0WZnA.js", "/assets/meta-CNUq8pDr.js", "/assets/refresh-cw-DDuh3l6L.js", "/assets/schemas-q1bgCdS2.js", "/assets/Footer-DTQqYS18.js", "/assets/auth-context-kPJ7oDZw.js", "/assets/utils-CyyZbp74.js", "/assets/clsx-B-dksMZM.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-f82c03c5.js", "version": "f82c03c5", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "v8_middleware": false, "unstable_optimizeDeps": false, "unstable_splitRouteModules": false, "unstable_subResourceIntegrity": false, "unstable_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/home": {
    id: "routes/home",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route1
  },
  "routes/games": {
    id: "routes/games",
    parentId: "root",
    path: "games",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/games.$gameId": {
    id: "routes/games.$gameId",
    parentId: "root",
    path: "games/:gameId",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/login": {
    id: "routes/login",
    parentId: "root",
    path: "login",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/login.verify": {
    id: "routes/login.verify",
    parentId: "root",
    path: "login/verify",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/admin": {
    id: "routes/admin",
    parentId: "root",
    path: "admin",
    index: true,
    caseSensitive: void 0,
    module: route6
  },
  "routes/admin.add-game": {
    id: "routes/admin.add-game",
    parentId: "root",
    path: "admin/add-game",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/admin.games.$gameId": {
    id: "routes/admin.games.$gameId",
    parentId: "root",
    path: "admin/games/:gameId",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/admin.games.$gameId.details": {
    id: "routes/admin.games.$gameId.details",
    parentId: "routes/admin.games.$gameId",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route9
  },
  "routes/admin.games.$gameId.attachments": {
    id: "routes/admin.games.$gameId.attachments",
    parentId: "routes/admin.games.$gameId",
    path: "attachments",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/admin.games.$gameId.edit": {
    id: "routes/admin.games.$gameId.edit",
    parentId: "root",
    path: "admin/games/:gameId/edit",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/admin.games.$gameId.resources.$resourceId": {
    id: "routes/admin.games.$gameId.resources.$resourceId",
    parentId: "root",
    path: "admin/games/:gameId/resources/:resourceId",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/admin.games.$gameId.resources.$resourceId.attachments.$attachmentId": {
    id: "routes/admin.games.$gameId.resources.$resourceId.attachments.$attachmentId",
    parentId: "root",
    path: "admin/games/:gameId/resources/:resourceId/attachments/:attachmentId",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
