import Heading from "@/components/heading";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGame } from "@/lib/actions/games";
import { redirect } from "next/navigation";

export default function Page() {
  return (
    <Layout>
      <div className="w-full lg:grid lg:min-h-[600px] xl:min-h-[800px]">
        <div className="flex items-center justify-center py-12">
          <div className="mx-auto grid w-[350px] gap-6">
            <Heading>Add Game</Heading>
            <form
              action={async (formData) => {
                "use server";
                const game = await createGame({
                  name: formData.get("name") as string,
                });
                redirect(`/admin/games/${game.id}`);
              }}
              className="grid gap-4"
            >
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="name"
                  type="text"
                  name="name"
                  placeholder="Settlers of Catan"
                  required
                />
              </div>
              <Button type="submit" className="w-full">
                Add Game
              </Button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
