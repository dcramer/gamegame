import { reprocess } from './lib/procedures/resources';

async function main() {
  const resourceId = 'aXw-9SlP5-a57HVuvKv1R';

  console.log('Calling reprocess procedure...');
  const result = await reprocess.handler({
    input: {
      id: resourceId,
      fromStage: undefined,
    },
    context: {
      user: { userId: 'test', email: 'test@test.com', isAdmin: true },
    },
  });

  console.log('Result:', result);
}

main().catch(console.error);
