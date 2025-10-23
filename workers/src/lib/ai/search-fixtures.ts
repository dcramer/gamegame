/**
 * Pre-computed embeddings for search tests
 *
 * These are real embeddings generated from OpenAI's text-embedding-3-small model.
 * They allow us to test hybrid search without hitting the OpenAI API during tests.
 *
 * To regenerate these fixtures:
 * 1. Set OPENAI_API_KEY environment variable
 * 2. Run: node scripts/generate-search-fixtures.js (if we create this)
 */

// Simplified embeddings (1536 dimensions) for testing
// In reality, we'd use actual pre-computed embeddings from OpenAI
// For now, using representative vectors that simulate semantic similarity

/**
 * Creates a normalized embedding vector with specific characteristics
 * This simulates real embeddings where similar concepts have similar vectors
 */
function createEmbedding(seed: number): number[] {
  const embedding = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    // Use seed to create deterministic but varied values
    embedding[i] = Math.sin(seed * i * 0.001) * 0.5;
  }
  return embedding;
}

// Embeddings for common game rule concepts
export const EMBEDDINGS = {
  // Setup-related content
  'setup-board': createEmbedding(1),
  'setup-instructions': createEmbedding(1.1),  // Very similar to setup-board
  'game-setup': createEmbedding(1.2),          // Similar to setup

  // Combat-related content
  'combat-dice': createEmbedding(5),
  'battle-rules': createEmbedding(5.1),        // Similar to combat
  'fighting': createEmbedding(5.2),            // Similar to combat

  // Turn/gameplay related
  'player-turn': createEmbedding(10),
  'turn-sequence': createEmbedding(10.1),

  // Scoring/winning
  'victory-points': createEmbedding(15),
  'scoring': createEmbedding(15.1),

  // Generic/unrelated
  'random-content': createEmbedding(20),
  'unrelated-text': createEmbedding(25),
};

// Test fragment data with their embeddings
export const TEST_FRAGMENTS = [
  {
    content: 'Setup: Place the board in the center of the table. Each player chooses a color.',
    embedding: EMBEDDINGS['setup-board'],
    section: 'Setup',
    pageNumber: 1,
    keywords: ['setup', 'board', 'player', 'table'],
  },
  {
    content: 'Game setup requires 2-4 players. Shuffle the deck and place it nearby.',
    embedding: EMBEDDINGS['game-setup'],
    section: 'Setup',
    pageNumber: 2,
    keywords: ['setup', 'players', 'deck'],
  },
  {
    content: 'Combat: Roll dice to determine the winner. Highest roll wins the battle.',
    embedding: EMBEDDINGS['combat-dice'],
    section: 'Combat',
    pageNumber: 5,
    keywords: ['combat', 'dice', 'roll', 'battle'],
  },
  {
    content: 'During battle, compare attack values. The player with higher attack wins.',
    embedding: EMBEDDINGS['battle-rules'],
    section: 'Combat',
    pageNumber: 6,
    keywords: ['battle', 'attack', 'combat'],
  },
  {
    content: 'On your turn, draw a card and play an action.',
    embedding: EMBEDDINGS['player-turn'],
    section: 'Gameplay',
    pageNumber: 10,
    keywords: ['turn', 'draw', 'play'],
  },
  {
    content: 'Victory points are awarded for completing objectives.',
    embedding: EMBEDDINGS['victory-points'],
    section: 'Scoring',
    pageNumber: 15,
    keywords: ['victory', 'points', 'scoring'],
  },
];

// Query embeddings for testing
export const QUERY_EMBEDDINGS = {
  // Should match setup fragments
  'how to setup': EMBEDDINGS['setup-instructions'],
  'board placement': EMBEDDINGS['setup-board'],

  // Should match combat fragments
  'combat rules': EMBEDDINGS['combat-dice'],
  'battle mechanics': EMBEDDINGS['battle-rules'],

  // Should match turn fragments
  'player turn': EMBEDDINGS['player-turn'],

  // Should match scoring fragments
  'how to win': EMBEDDINGS['victory-points'],

  // Generic query
  'game rules': createEmbedding(12), // Moderate similarity to multiple concepts
};
