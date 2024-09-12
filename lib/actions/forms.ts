"use server";

import { redirect } from "next/navigation";
import { createGame, updateGame } from "./games";
import { updateResource } from "./resources";

export const createGameForm = async (formData: FormData) => {
  const game = await createGame({
    name: formData.get("name") as string,
    imageUrl: (formData.get("imageUrl") as string) ?? null,
    bggUrl: (formData.get("bggUrl") as string) ?? null,
  });
  redirect(`/admin/games/${game.id}`);
};

export const updateGameForm = async (gameId: string, formData: FormData) => {
  const game = await updateGame(gameId, {
    name: (formData.get("name") as string) ?? undefined,
    imageUrl: (formData.get("imageUrl") as string) ?? undefined,
    bggUrl: (formData.get("bggUrl") as string) ?? undefined,
  });
  redirect(`/admin/games/${game.id}`);
};

export const updateResourceForm = async (
  resourceId: string,
  formData: FormData
) => {
  await updateResource(resourceId, {
    name: formData.has("name") ? (formData.get("name") as string) : undefined,
    content: formData.has("content")
      ? (formData.get("content") as string)
      : undefined,
  });
};
