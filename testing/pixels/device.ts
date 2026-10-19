/**
 * What the pixel driver needs from a device: copy files to it, open a link in the demo, and take
 * a lossless screenshot.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { run } from '../lib/run.ts';

const ANDROID_PACKAGE = 'com.alphavideotest';
const IOS_BUNDLE_ID = 'org.reactjs.native.example.AlphaVideoTest';

export interface Screenshot {
  width: number;
  height: number;
  /** RGBA, row-major, no padding; the alpha channel is ignored. */
  data: Uint8Array;
}

export interface Device {
  platform: 'android' | 'ios';
  /** An Android emulator or the iOS Simulator, rather than real hardware. */
  emulator: boolean;
  /** The folder the fixtures are copied to, as the app sees it. */
  root: string;
  /** Copies a file to `root/relPath`, unless the same size is already there. */
  push(localPath: string, relPath: string): void;
  open(url: string): void;
  /** Stops the app; the next `open` starts it again. */
  restart(): void;
  screenshot(): Screenshot;
  /** The app's JavaScript console output since the last call, or since `connect`. */
  consoleLog(): string;
}

function android(): Device {
  const sdk = process.env.ANDROID_HOME ?? path.join(os.homedir(), 'Library/Android/sdk');
  const adbPath = process.env.ADB ?? path.join(sdk, 'platform-tools/adb');
  const adb = (args: string[]) => run(adbPath, args);
  // Apps can read world-readable files here. Android/data/<package> doesn't work: a folder adb
  // creates there belongs to the shell user, and the app gets EACCES.
  const root = '/data/local/tmp/pixeltest';
  const sizes = new Map<string, number>();
  for (const line of adb(['shell', `mkdir -p ${root} && cd ${root} && find . -type f -exec stat -c '%s %n' {} +`]).toString().split('\n')) {
    const m = /^(\d+) \.\/(.+)$/.exec(line.trim());
    if (m) sizes.set(m[2], Number(m[1]));
  }
  adb(['logcat', '-c']);
  // Not cleared after each read: a line logged between the read and the clear would be lost
  let logSeenUntil = 0;
  return {
    platform: 'android',
    emulator: adb(['shell', 'getprop ro.kernel.qemu']).toString().trim() === '1',
    root,
    push(localPath, relPath) {
      if (sizes.get(relPath) === fs.statSync(localPath).size) return;
      adb(['shell', `mkdir -p '${path.posix.dirname(`${root}/${relPath}`)}'`]);
      adb(['push', localPath, `${root}/${relPath}`]);
      adb(['shell', `chmod -R a+rX ${root}`]);
      sizes.set(relPath, fs.statSync(localPath).size);
    },
    open(url) {
      adb(['shell', `am start -W -a android.intent.action.VIEW -d '${url}' ${ANDROID_PACKAGE}`]);
    },
    restart() {
      adb(['shell', `am force-stop ${ANDROID_PACKAGE}`]);
    },
    screenshot() {
      // Raw screencap: a 16-byte header (width, height, format, colour space), then RGBA_8888.
      // gzip makes the transfer six times faster than the raw or PNG forms.
      // Samsung phones sometimes capture nothing while a window changes
      let raw = gunzipSync(adb(['exec-out', 'screencap | gzip -1']));
      for (let retry = 0; raw.length < 16 && retry < 5; retry++) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
        raw = gunzipSync(adb(['exec-out', 'screencap | gzip -1']));
      }
      if (raw.length < 16) throw new Error('screencap captured nothing');
      const width = raw.readUInt32LE(0), height = raw.readUInt32LE(4), format = raw.readUInt32LE(8);
      if (format !== 1) throw new Error(`screencap pixel format ${format}, expected 1 (RGBA_8888)`);
      return { width, height, data: raw.subarray(raw.length - width * height * 4) };
    },
    consoleLog() {
      const lines = adb(['logcat', '-d', '-v', 'epoch', '-s', 'ReactNativeJS:V']).toString().split('\n');
      const fresh: string[] = [];
      for (const line of lines) {
        const time = parseFloat(line);
        if (!(time > logSeenUntil)) continue;
        fresh.push(line);
        logSeenUntil = time;
      }
      return fresh.join('\n');
    },
  };
}

function ios(): Device {
  const udid = process.env.SIMULATOR_ID ?? 'booted';
  const simctl = (args: string[]) => run('xcrun', ['simctl', ...args]);
  const container = simctl(['get_app_container', udid, IOS_BUNDLE_ID, 'data']).toString().trim();
  const root = path.join(container, 'Documents/pixeltest');
  const shotPath = path.join(os.tmpdir(), `pixeltest-${process.pid}.png`);
  // The app watches root/link.txt for links (see AppDelegate.swift), but only if root exists at
  // launch, and the first link is lost if JavaScript isn't listening yet.
  fs.mkdirSync(root, { recursive: true });
  const launch = () => {
    fs.rmSync(path.join(root, 'link.txt'), { force: true });
    spawnSync('xcrun', ['simctl', 'terminate', udid, IOS_BUNDLE_ID]);
    simctl(['launch', udid, IOS_BUNDLE_ID]);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  };
  launch();
  let logSince = new Date();
  return {
    platform: 'ios',
    emulator: true,
    root,
    push(localPath, relPath) {
      const target = path.join(root, relPath);
      if (fs.existsSync(target) && fs.statSync(target).size === fs.statSync(localPath).size) return;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(localPath, target);
    },
    open(url) {
      fs.writeFileSync(path.join(root, 'link.tmp'), url);
      fs.renameSync(path.join(root, 'link.tmp'), path.join(root, 'link.txt'));
    },
    restart: launch,
    screenshot() {
      simctl(['io', udid, 'screenshot', '--type=png', shotPath]);
      const png = fs.readFileSync(shotPath);
      const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
      const data = run('ffmpeg', ['-v', 'error', '-i', shotPath, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']);
      return { width, height, data };
    },
    consoleLog() {
      const until = new Date();
      // `log show` takes local times as "YYYY-MM-DD HH:MM:SS"
      const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 19).replace('T', ' ');
      const log = simctl(['spawn', udid, 'log', 'show', '--style', 'compact', '--start', local(logSince),
        '--predicate', 'subsystem == "com.facebook.react.log" AND category == "javascript"']).toString();
      logSince = until;
      return log;
    },
  };
}

export function connect(platform: string): Device {
  if (platform === 'android') return android();
  if (platform === 'ios') return ios();
  throw new Error(`--platform must be android or ios, not ${platform}`);
}
