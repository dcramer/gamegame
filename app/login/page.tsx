import { auth } from "@/auth";
import Layout from "@/components/layout";
import SignIn from "@/components/sign-in";
import { redirect } from "next/navigation";

export default async function Page() {
  const session = await auth();
  if (session?.user) return redirect("/");

  return (
    <Layout>
      <SignIn />
    </Layout>
  );
}
