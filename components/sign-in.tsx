import { signIn } from "@/auth";

export function SignIn() {
  return (
    <form
      action={async (formData) => {
        "use server";
        await signIn("resend", formData);
      }}
    >
      <input type="text" name="email" placeholder="Email" />
      <button type="submit">Sign-in</button>
    </form>
  );
}
