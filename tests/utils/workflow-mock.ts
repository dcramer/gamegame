import { vi } from 'vitest';

type WorkflowFunction<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => Promise<unknown>;

type WorkflowMetadata = {
  workflowId: string;
};

type WorkflowLike<TArgs extends unknown[] = unknown[]> =
  | WorkflowFunction<TArgs>
  | WorkflowMetadata;

export interface WorkflowMockInvocation<TArgs extends unknown[] = unknown[]> {
  id: string;
  workflow: WorkflowLike<TArgs>;
  workflowName: string;
  args: TArgs;
  options?: unknown;
  recordedAt: Date;
}

function normalizeArgs(argsOrOptions?: unknown, maybeOptions?: unknown) {
  if (Array.isArray(argsOrOptions)) {
    return {
      args: argsOrOptions,
      options: maybeOptions,
    };
  }

  return {
    args: [] as unknown[],
    options: argsOrOptions,
  };
}

function extractWorkflowName(workflow: WorkflowLike<any>): string {
  if (typeof workflow === 'object' && workflow && 'workflowId' in workflow) {
    return workflow.workflowId as string;
  }

  if (typeof workflow === 'function') {
    const mockName = typeof (workflow as any).getMockName === 'function'
      ? (workflow as any).getMockName()
      : undefined;
    if (mockName && mockName !== 'vi.fn()') {
      return mockName;
    }
    if (workflow.name) {
      return workflow.name;
    }
  }

  return 'anonymous-workflow';
}

const workflowMockState = vi.hoisted(() => {
  const invocations: WorkflowMockInvocation[] = [];

  const defaultImpl = async (
    workflow: WorkflowLike,
    argsOrOptions?: unknown,
    maybeOptions?: unknown
  ) => {
    const { args, options } = normalizeArgs(argsOrOptions, maybeOptions);
    const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    const workflowName = extractWorkflowName(workflow);

    invocations.push({
      id,
      workflow,
      workflowName,
      args,
      options,
      recordedAt: new Date(),
    });

    if (typeof workflow === 'function') {
      await workflow(...args);
    }

    return { runId: id };
  };

  const startMock = vi.fn(defaultImpl);

  return {
    invocations,
    startMock,
    defaultImpl,
  };
});

vi.mock('workflow/api', () => ({
  start: workflowMockState.startMock,
}));

export const workflowStartMock = workflowMockState.startMock;

export function getWorkflowMockInvocations(): WorkflowMockInvocation[] {
  return [...workflowMockState.invocations];
}

export function getLastWorkflowMockInvocation():
  | WorkflowMockInvocation
  | null {
  return workflowMockState.invocations.at(-1) ?? null;
}

export function clearWorkflowMockInvocations() {
  workflowMockState.invocations.length = 0;
  workflowMockState.startMock.mockClear();
  workflowMockState.startMock.mockImplementation(workflowMockState.defaultImpl);
}
