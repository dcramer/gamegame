import { spawn } from 'node:child_process';
import process from 'node:process';

type ProcConfig = {
  name: string;
  command: string;
  args: string[];
};

const processes: ProcConfig[] = [
  { name: 'web', command: 'pnpm', args: ['dev:web'] },
  { name: 'workflows', command: 'pnpm', args: ['dev:workflows'] },
];

const children = new Map<
  string,
  ReturnType<typeof spawn>
>();

let shuttingDown = false;
let exitCode = 0;

function startProcesses() {
  for (const proc of processes) {
    const child = spawn(proc.command, proc.args, {
      stdio: 'inherit',
      env: process.env,
    });

    children.set(proc.name, child);

    child.on('exit', (code, signal) => {
      if (!shuttingDown) {
        if (code && code !== 0) {
          console.error(`[dev] Process "${proc.name}" exited with code ${code}.`);
          exitCode = code;
        } else if (signal) {
          console.warn(`[dev] Process "${proc.name}" exited via signal ${signal}.`);
        } else {
          console.log(`[dev] Process "${proc.name}" exited. Stopping others...`);
        }
        shutdown();
      } else if (allChildrenExited()) {
        process.exit(exitCode);
      }
    });
  }
}

function allChildrenExited(): boolean {
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      return false;
    }
  }
  return true;
}

function shutdown(signal: NodeJS.Signals = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }
}

process.on('SIGINT', () => {
  exitCode = 0;
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  exitCode = 0;
  shutdown('SIGTERM');
});

startProcesses();
