import { spawnSync, type SpawnSyncOptions } from 'node:child_process';

/** Runs a command and returns stdout; throws with its stderr if it fails. */
export function run(cmd: string, args: string[], options: SpawnSyncOptions = {}): Buffer {
  const result = spawnSync(cmd, args, { maxBuffer: 1 << 30, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim().split('\n').slice(-15).join('\n');
    throw new Error(`${cmd} ${args.join(' ')}\nexited with ${result.status}\n${stderr}`);
  }
  return result.stdout as Buffer;
}
