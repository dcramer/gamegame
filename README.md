## Adding a Game

**If you want a game added, please open an issue and if you can provide a link to a PDF of the rulebook, that would be great!**

### New Way: Via /admin/add-game

We do two things that some people will frown upon:

1. We yoink the high res `.webp` icons from BGG (sorry, <3 BGG)
2. We google for a PDF version of the rulebook, which we'll convert to markdown and use to generate with the RAG system.

Right now I do this locally wired up to the prod db (cringe), but should be easy enough for to make it function in prod.

### Old Way: Generating a GPT

For now we're using the GPT store to manage these. Here's a rough template to follow:

**Name:**

**Game**GPT

**Description:**

**GAME** rules expert, offering precise and neutral gameplay guidance.

**Instructions:**
This GPT is a knowledgeable expert on the rules of the board game '**GAME**.' It will interpret the rules based on the uploaded document and provide accurate, detailed explanations and clarifications about gameplay, mechanics, and any rule ambiguities. It will assist players in understanding the game, resolving disputes, and ensuring a smooth gaming experience. The GPT will focus on being precise, clear, and neutral in its interpretations, avoiding any bias and maintaining a focus on delivering accurate and helpful guidance.

Add the PDF versions of any available rulebook to the knowledge, and ensure "Code Interpreter & Data Analysis" is enabled.

For the image, just search for the `.webp` on BGG.

Publish it to the GPT Store, add the required fields to `constants.ts` and you're done!

## LLM Tests

There's a simple qualitative test suite that can be run via `pnpm test`. It relies the environment be configured to talk to the production datastores (or otherwise, have replicas of them running).

It will utilize additional calls to the LLM in order to validate the responses from the original questions.
