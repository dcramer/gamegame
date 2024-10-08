import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "./lib/db/schema/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    // i dont fucking have a clue what i'm doing
    usersTable: users as any,
    accountsTable: accounts as any,
    sessionsTable: sessions as any,
    verificationTokensTable: verificationTokens as any,
  }),

  providers: [
    Resend({
      from: "no-reply@gamegame.ai",
    }),
  ],
  callbacks: {
    authorized: async ({ request, auth }) => {
      if (
        !auth &&
        request.nextUrl.pathname !== "/login" &&
        request.nextUrl.pathname !== "/"
      ) {
        const newUrl = new URL("/login", request.nextUrl.origin);
        return Response.redirect(newUrl);
      }
    },
  },
});
