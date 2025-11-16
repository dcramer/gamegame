/**
 * Test OpenAPI generation directly to see errors
 */
import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod';

// Import the router
const module = await import('./lib/procedures/router.ts');
const router = module.router;

const generator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
});

try {
  const spec = await generator.generate(router, {
    info: {
      title: 'GameGame API',
      version: '0.1.0',
      description: 'Test generation',
    },
    servers: [
      {
        url: '/api/v0',
        description: 'Development server',
      },
    ],
  });

  console.log('✅ OpenAPI spec generated successfully!');
  console.log('Paths:', Object.keys(spec.paths || {}).length);
} catch (error) {
  console.error('❌ Error generating OpenAPI spec:');
  console.error(error);
  console.error('\nStack trace:');
  console.error(error.stack);
}
