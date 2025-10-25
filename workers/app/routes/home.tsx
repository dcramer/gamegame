import { redirect } from "react-router";
import { createMeta, createHomeTitle } from "../lib/meta";

export const meta = () => {
  return createMeta({
    title: createHomeTitle(),
    description: "Get instant answers to board game rules with AI-powered assistance. Search hundreds of games and rulebooks.",
  });
};

export function loader() {
  return redirect("/games");
}
