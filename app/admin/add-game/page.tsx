import Heading from "@/components/heading";
import Layout from "@/components/layout";
import Form from "./form";

export default function Page() {
  return (
    <Layout>
      <div className="w-full lg:grid lg:min-h-[600px] xl:min-h-[800px]">
        <div className="flex items-center justify-center py-12">
          <div className="mx-auto grid w-[350px] gap-6">
            <Heading>Add Game</Heading>
            <Form />
          </div>
        </div>
      </div>
    </Layout>
  );
}
