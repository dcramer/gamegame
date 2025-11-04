import Heading from "@/components/heading";
import Layout from "@/components/layout";
import Form from "./form";

export default function Page() {
  return (
    <Layout>
      <div className="w-full">
        <div className="mx-auto w-full max-w-2xl px-4 py-12">
          <div className="grid gap-6">
            <Heading>Add Game</Heading>
            <Form />
          </div>
        </div>
      </div>
    </Layout>
  );
}
