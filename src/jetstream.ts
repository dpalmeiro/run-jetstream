import { spawn, type SpawnOptions } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';

export type ShellName = 'spidermonkey' | 'v8';

export interface JetStreamRunOptions {
  shell: ShellName;
  binaryPath: string;
  iterations: number;
  test?: string;
  tag?: string;
  noPrefetch?: boolean;
  forceGC?: boolean;
  groupDetails?: boolean;
  profileShell?: boolean;
  samplyOutput?: string;
  shellArgs?: string[];
  jetstreamArgs?: string[];
  timeoutMs?: number;
  verbose?: boolean;
}

export interface BenchmarkBreakdownEntry {
  suite_id: string;
  subtest_id: string;
  label: string;
  unit: string;
  higher_is_better: boolean;
  samples: number[];
  mean: number;
  stddev: number;
}

export interface JetStreamRunResult {
  score: number;
  breakdown: BenchmarkBreakdownEntry[];
  stdout: string;
  stderr: string;
}

export const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

export function jetstreamRoot(): string {
  return join(fileURLToPath(import.meta.url), '../../jetstream');
}

export function buildBenchmarkArgs(opts: {
  iterations: number;
  test?: string;
  tag?: string;
  noPrefetch?: boolean;
  forceGC?: boolean;
  groupDetails?: boolean;
  jetstreamArgs?: string[];
}): string[] {
  const args = [
    `--iteration-count=${opts.iterations}`,
    '--dump-json-results',
  ];

  if (opts.test) args.push(`--test=${opts.test}`);
  if (opts.tag) args.push(`--tag=${opts.tag}`);
  if (opts.noPrefetch) args.push('--no-prefetch');
  if (opts.forceGC) args.push('--force-gc');
  if (opts.groupDetails) args.push('--group-details');
  args.push(...(opts.jetstreamArgs ?? []));

  return args;
}

export function buildShellArgs(shell: ShellName, benchmarkArgs: string[], shellArgs: string[] = []): string[] {
  const args = [...shellArgs, 'cli.js'];
  if (shell === 'v8') args.push('--');
  args.push(...benchmarkArgs);
  return args;
}

export function profilingShellArgs(shell: ShellName): string[] {
  if (shell !== 'v8') return [];
  return ['--perf-prof', '--interpreted-frames-native-stack'];
}

function profilingEnv(shell: ShellName, perfDir: string | undefined): NodeJS.ProcessEnv {
  if (shell !== 'spidermonkey') return {};

  return {
    IONPERF: 'src',
    ...(perfDir ? {
      PERF_SPEW_DIR: perfDir,
      MOZ_PERFORMANCE_MARKER_DIR: perfDir,
    } : {}),
    MOZ_USE_PERFORMANCE_MARKER_FILE: '1',
    JIT_OPTION_enableICFramePointers: 'true',
    JIT_OPTION_onlyInlineSelfHosted: 'true',
    JIT_OPTION_emitInterpreterEntryTrampoline: 'true',
  };
}

interface JetStreamPayload {
  'JetStream3.0'?: {
    tests?: Record<string, {
      metrics?: { Score?: { current?: number[] } };
      tests?: Record<string, { metrics?: { Time?: { current?: number[] } } }>;
    }>;
  };
}

function parseTests(stdout: string): NonNullable<NonNullable<JetStreamPayload['JetStream3.0']>['tests']> {
  const payload = JSON.parse(extractLastJsonObject(stdout)) as JetStreamPayload;
  const tests = payload['JetStream3.0']?.tests;
  if (!tests) throw new Error('JetStream JSON payload missing JetStream3.0.tests');
  return tests;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function extractScoreFromResults(stdout: string): number {
  const scores = Object.values(parseTests(stdout))
    .map((test) => test.metrics?.Score?.current?.[0])
    .filter(isPositiveNumber);

  if (scores.length === 0) throw new Error('JetStream JSON payload contains no scores');

  const logSum = scores.reduce((sum, score) => sum + Math.log(score), 0);
  const geomean = Math.exp(logSum / scores.length);
  return Math.round(geomean * 100) / 100;
}

function stableId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function breakdownEntry(
  suite: string,
  subtestId: string,
  label: string,
  unit: string,
  higherIsBetter: boolean,
  value: number,
): BenchmarkBreakdownEntry {
  return {
    suite_id: stableId(suite),
    subtest_id: subtestId,
    label,
    unit,
    higher_is_better: higherIsBetter,
    samples: [value],
    mean: value,
    stddev: 0,
  };
}

/**
 * Each workload yields a `__total__` entry with its score plus one entry per
 * sub-score (First, Worst, Average, Startup, ...) with its time in ms. JetStream
 * reports a single aggregated value per metric, so every entry has one sample.
 */
export function extractBreakdownFromResults(stdout: string): BenchmarkBreakdownEntry[] {
  return Object.entries(parseTests(stdout)).flatMap(([workload, test]) => {
    const entries: BenchmarkBreakdownEntry[] = [];
    const score = test.metrics?.Score?.current?.[0];
    if (isPositiveNumber(score)) {
      entries.push(breakdownEntry(workload, '__total__', workload, 'score', true, score));
    }
    for (const [name, sub] of Object.entries(test.tests ?? {})) {
      const time = sub.metrics?.Time?.current?.[0];
      if (!isPositiveNumber(time)) continue;
      entries.push(breakdownEntry(workload, stableId(name), `${workload}/${name}`, 'ms', false, time));
    }
    return entries;
  });
}

function extractLastJsonObject(stdout: string): string {
  const end = stdout.lastIndexOf('}');
  if (end === -1) throw new Error('No JSON object found in JetStream stdout');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = end; index >= 0; index--) {
    const char = stdout[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '}') {
      depth++;
      continue;
    }
    if (char === '{') {
      depth--;
      if (depth === 0) return stdout.slice(index, end + 1);
    }
  }

  throw new Error('Could not isolate JetStream JSON payload');
}

export async function runJetStream(opts: JetStreamRunOptions): Promise<JetStreamRunResult> {
  const benchmarkArgs = buildBenchmarkArgs(opts);
  const profileShell = opts.profileShell || !!opts.samplyOutput;
  const profileDir = profileShell ? mkdtempSync(join(tmpdir(), 'run-jetstream-profile-')) : undefined;
  const shellArgs = [
    ...(profileShell ? profilingShellArgs(opts.shell) : []),
    ...(opts.shellArgs ?? []),
  ];
  const directArgs = buildShellArgs(opts.shell, benchmarkArgs, shellArgs);

  const env = {
    ...process.env,
    ...profilingEnv(opts.shell, profileDir),
  };

  const command = opts.samplyOutput ? 'samply' : opts.binaryPath;
  const args = opts.samplyOutput
    ? [
        'record',
        '--save-only',
        '--browsers',
        '--presymbolicate',
        '-o',
        opts.samplyOutput,
        '--',
        opts.binaryPath,
        ...directArgs,
      ]
    : directArgs;

  if (opts.verbose) {
    process.stderr.write(`[run-jetstream] ${command} ${args.join(' ')}\n`);
  }

  try {
    const { stdout, stderr } = await spawnCapture(command, args, {
      cwd: jetstreamRoot(),
      env,
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    let score: number;
    let breakdown: BenchmarkBreakdownEntry[];
    try {
      score = extractScoreFromResults(stdout);
      breakdown = extractBreakdownFromResults(stdout);
    } catch (e) {
      throw new Error(
        `${(e as Error).message}\n` +
        `stdout tail:\n${stdout.slice(-1000)}\n` +
        `stderr tail:\n${stderr.slice(-1000)}`
      );
    }
    return {
      stdout,
      stderr,
      score,
      breakdown,
    };
  } finally {
    if (profileDir) {
      try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  }
}

function spawnCapture(
  command: string,
  args: string[],
  opts: SpawnOptions & { timeoutMs: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const { timeoutMs, ...spawnOpts } = opts;
    const child = spawn(command, args, {
      ...spawnOpts,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`JetStream timed out after ${timeoutMs}ms`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`JetStream shell exited with code ${code ?? signal}\n${stderr.slice(0, 1000)}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
