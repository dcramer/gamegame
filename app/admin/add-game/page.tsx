import Heading from "@/components/heading";
import AdminLayout from "@/components/admin-layout";
import Form from "./form";

export default function Page() {
  return (
    <AdminLayout>
      <div className="w-full">
        <div className="mx-auto w-full max-w-2xl px-4 py-12">
          <div className="grid gap-6">
            <Heading>Add Game</Heading>
            <Form />
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
