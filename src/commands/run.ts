import { Command } from 'commander';
import { runJetStream, type ShellName } from '../jetstream.js';

function collect(val: string, acc: string[]): string[] {
  acc.push(val);
  return acc;
}

function parseIterations(value: string): number {
  const iterations = Number(value);
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(`Invalid iterations: ${value}`);
  }
  return iterations;
}

function resolveShell(opts: {
  spidermonkey?: string;
  v8?: string;
  binary?: string;
  shell?: string;
}): { shell: ShellName; binaryPath: string } {
  if (opts.spidermonkey) return { shell: 'spidermonkey', binaryPath: opts.spidermonkey };
  if (opts.v8) return { shell: 'v8', binaryPath: opts.v8 };

  const binaryPath = opts.binary ?? process.env.JS_SHELL_BINARY ?? '';
  const shell = opts.shell ?? process.env.JS_SHELL ?? '';
  if (!binaryPath || !shell) {
    throw new Error('No shell specified. Use --spidermonkey, --v8, or --binary with --shell.');
  }
  if (shell !== 'spidermonkey' && shell !== 'v8') {
    throw new Error(`Invalid shell: ${shell}. Expected "spidermonkey" or "v8".`);
  }
  return { shell, binaryPath };
}

export function runCommand(): Command {
  return new Command('run')
    .description('Run JetStream3 in a SpiderMonkey or V8 shell and output score and subtest breakdown as JSON')
    .option('--spidermonkey <path>', 'Path to SpiderMonkey js shell')
    .option('--v8 <path>', 'Path to V8 shell (d8/jsvu v8)')
    .option('--binary <path>', 'Path to JS shell binary (or JS_SHELL_BINARY env var)')
    .option('--shell <name>', 'Shell type for --binary: spidermonkey or v8 (or JS_SHELL env var)')
    .option('--iterations <n>', 'Default JetStream iteration count; must be at least 17 for upstream JetStream construction', '17')
    .option('--test <names>', 'Run a specific JetStream test or comma-separated test list')
    .option('--tag <names>', 'Run tests with a JetStream tag or comma-separated tag list')
    .option('--no-prefetch', 'Disable shell resource prefetching')
    .option('--force-gc', 'Force GC before each benchmark when the shell supports it')
    .option('--group-details', 'Display detailed group items')
    .option('--profile-shell', 'Enable shell-specific profiling flags/env without invoking samply')
    .option('--samply <output>', 'Record this shell run with samply and save to the given profile path')
    .option('--shell-arg <arg>', 'Extra argument passed to the JS shell before cli.js', collect, [])
    .option('--jetstream-arg <arg>', 'Extra argument passed to JetStream cli.js', collect, [])
    .option('--timeout-ms <n>', 'Run timeout in milliseconds')
    .option('--verbose', 'Print the shell command to stderr')
    .action(async (opts) => {
      let exitCode = 0;
      try {
        const { shell, binaryPath } = resolveShell(opts);
        const iterations = parseIterations(opts.iterations);
        const timeoutMs = opts.timeoutMs === undefined ? undefined : parseIterations(opts.timeoutMs);
        const result = await runJetStream({
          shell,
          binaryPath,
          iterations,
          test: opts.test,
          tag: opts.tag,
          noPrefetch: opts.prefetch === false,
          forceGC: !!opts.forceGc,
          groupDetails: !!opts.groupDetails,
          profileShell: !!opts.profileShell,
          samplyOutput: opts.samply,
          shellArgs: opts.shellArg,
          jetstreamArgs: opts.jetstreamArg,
          timeoutMs,
          verbose: !!opts.verbose,
        });
        console.log(JSON.stringify({ score: result.score, breakdown: result.breakdown }));
      } catch (e) {
        console.error(JSON.stringify({ error: (e as Error).message }));
        exitCode = 1;
      }
      process.exit(exitCode);
    });
}
