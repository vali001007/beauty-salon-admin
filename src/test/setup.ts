import '@testing-library/jest-dom';
import { afterAll, beforeAll } from 'vitest';

const expectedErrorBoundaryMessages = ['Test error message', 'Temporary error'];
const originalStderrWrite = process.stderr.write.bind(process.stderr);

beforeAll(() => {
  process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk ?? '');
    if (expectedErrorBoundaryMessages.some((message) => text.includes(message))) {
      return true;
    }

    return originalStderrWrite(chunk as never, ...(args as never[]));
  }) as typeof process.stderr.write;
});

afterAll(() => {
  process.stderr.write = originalStderrWrite as typeof process.stderr.write;
});
