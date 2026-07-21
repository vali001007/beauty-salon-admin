import { chmod, lstat, mkdir, mkdtemp, open, realpath, rm } from 'node:fs/promises';

export interface BrainCapabilityOutputFsPort {
  lstat(path: string): ReturnType<typeof lstat>;
  mkdtemp(prefix: string): Promise<string>;
  chmodPrivate(path: string): Promise<void>;
  mkdirExclusive(path: string): Promise<void>;
  realpath(path: string): Promise<string>;
  openExclusive(path: string, content: string): Promise<void>;
  removeFile(path: string): Promise<void>;
}

export const nodeCapabilityOutputFsPort: BrainCapabilityOutputFsPort = {
  lstat,
  mkdtemp,
  async chmodPrivate(path) {
    await chmod(path, 0o700);
  },
  async mkdirExclusive(path) {
    await mkdir(path, { recursive: false });
  },
  realpath,
  async openExclusive(path, content) {
    const handle = await open(path, 'wx');
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  },
  async removeFile(path) {
    await rm(path, { force: true });
  },
};
