import { auth } from "@/auth";
import Layout from "@/components/layout";
import LayoutModal from "@/components/layout-modal";
import LoginForm from "@/components/login-form";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await auth();
  if (session?.user) return redirect("/");

  return (
    <LayoutModal>
      <LoginForm />
    </LayoutModal>
  );
}
