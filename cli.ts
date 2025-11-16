#!/usr/bin/env tsx

/**
 * CLI tool for GameGame
 * Usage: pnpm cli <command> [args]
 *
 * Commands:
 *   ask <gameId> <prompt>    - Ask a question about a game
 *   games                    - List all games with their IDs
 */

import { asc, eq } from "drizzle-orm";
import { db } from "./lib/db";
import { games } from "./lib/db/schema/games";
import { resources } from "./lib/db/schema/resources";

const command = process.argv[2];

if (!command) {
  console.error("Usage: pnpm cli <command> [args]");
  console.error("\nCommands:");
  console.error("  ask <gameId> <prompt>    Ask a question about a game");
  console.error("  games                    List all games with their IDs");
  process.exit(1);
}

// === ASK COMMAND ===
async function askCommand() {
  const gameId = process.argv[3];
  const prompt = process.argv[4];

  if (!gameId || !prompt) {
    console.error("Usage: pnpm cli ask <gameId> <prompt>");
    console.error('Example: pnpm cli ask 0nglgzyy60ax3fpfu4oz3 "How do I setup the game?"');
    process.exit(1);
  }

  const port = process.env.PORT || "3000";
  const url = `http://localhost:${port}/api/games/${gameId}/chat`;

  console.log(`Game ID: ${gameId}`);
  console.log(`Prompt: ${prompt}`);
  console.log("---\n");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            parts: [
              {
                type: "text",
                text: prompt,
              },
            ],
            id: `msg-${Date.now()}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Error ${response.status}:`, error);
      process.exit(1);
    }

    // Log rate limit headers
    const rateLimit = response.headers.get("X-RateLimit-Limit");
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");

    if (rateLimit) {
      console.log(`[Rate Limit: ${remaining}/${rateLimit}, resets at ${new Date(parseInt(reset!) * 1000).toLocaleTimeString()}]\n`);
    }

    // Handle streaming response
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      console.error("No response body");
      process.exit(1);
    }

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (SSE format)
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;

        try {
          const data = JSON.parse(line.slice(6)); // Remove "data: " prefix

          if (data.type === "text-delta") {
            // Text content being streamed
            process.stdout.write(data.delta);
          } else if (data.type === "tool-input-start") {
            // Tool call starting
            console.log(`\n\n[Tool: ${data.toolName}]`);
          } else if (data.type === "finish-step") {
            // Step finished
            console.log();
          }
        } catch {
          // Ignore parse errors for non-JSON lines
        }
      }
    }

    console.log("\n");
    process.exit(0);
  } catch (error) {
    console.error("Request failed:", error);
    process.exit(1);
  }
}

// === GAMES COMMAND ===
async function gamesCommand() {
  try {
    const gameList = await db
      .select({
        id: games.id,
        name: games.name,
        resourceCount: db.$count(resources, eq(resources.gameId, games.id)),
      })
      .from(games)
      .orderBy(asc(games.name));

    if (gameList.length === 0) {
      console.log("No games found.");
      process.exit(0);
    }

    console.log(`Found ${gameList.length} game${gameList.length === 1 ? "" : "s"}:\n`);

    // Find max name length for alignment
    const maxNameLength = Math.max(...gameList.map(g => g.name.length));

    for (const game of gameList) {
      const count = Number(game.resourceCount);
      const resourceText = count === 0
        ? "(no resources)"
        : `(${count} resource${count === 1 ? "" : "s"})`;

      console.log(`  ${game.id}  ${game.name.padEnd(maxNameLength)}  ${resourceText}`);
    }

    console.log("");
  } catch (error) {
    console.error("Failed to fetch games:", error);
    process.exit(1);
  }
}

// === COMMAND ROUTER ===
async function main() {
  switch (command) {
    case "ask":
      await askCommand();
      break;
    case "games":
      await gamesCommand();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("\nAvailable commands:");
      console.error("  ask <gameId> <prompt>    Ask a question about a game");
      console.error("  games                    List all games with their IDs");
      process.exit(1);
  }
}

main();
