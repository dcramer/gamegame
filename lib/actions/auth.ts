"use server";

import { signIn } from "@/auth";

export async function login(formData: FormData) {
  await signIn("resend", formData);
}
