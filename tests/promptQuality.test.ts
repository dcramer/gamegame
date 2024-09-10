/**
 * @jest-environment node
 */

import { expect, test, describe } from "vitest";

const baseUrl = "http://localhost:3000";

async function readableStreamToString(readableStream: ReadableStream) {
  const reader = readableStream.getReader();
  let result = "";
  let done = false;

  while (!done) {
    const { value, done: readDone } = await reader.read();
    if (readDone) {
      done = true;
    } else {
      result += new TextDecoder().decode(value);
    }
  }

  return result;
}

describe("llm qualitative tests", () => {
  test("number of dice in combat", async () => {
    const res = await fetch(`${baseUrl}/api/ask/6791qkvb6wxutz0clqbmk`, {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "How many dice do you roll in battle?",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    console.log(res.headers);

    const body = await readableStreamToString(res.body as ReadableStream);
    console.log(body);
    expect(await JSON.parse(body)).toMatchObject([
      {
        userId: 1,
        id: 1,
        title: "first post title",
        body: "first post body",
      },
    ]);
  });

  test("number of dice in battle", async () => {
    const res = await fetch(`${baseUrl}/api/ask/6791qkvb6wxutz0clqbmk`, {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "How many dice do you roll in battle?",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    console.log(res.headers);

    const body = await readableStreamToString(res.body as ReadableStream);
    console.log(body);
    expect(await JSON.parse(body)).toMatchObject([
      {
        userId: 1,
        id: 1,
        title: "first post title",
        body: "first post body",
      },
    ]);
  });

  test("number of dice", async () => {
    const res = await fetch(`${baseUrl}/api/ask/6791qkvb6wxutz0clqbmk`, {
      method: "POST",
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: "How many dice do you roll?",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    console.log(res.headers);

    const body = await readableStreamToString(res.body as ReadableStream);
    console.log(body);
    expect(await JSON.parse(body)).toMatchObject([
      {
        userId: 1,
        id: 1,
        title: "first post title",
        body: "first post body",
      },
    ]);
  });
});
