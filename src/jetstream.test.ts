import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkArgs,
  buildShellArgs,
  extractScoreFromResults,
  profilingShellArgs,
} from './jetstream.js';

describe('buildBenchmarkArgs', () => {
  it('builds JSON-output JetStream args', () => {
    expect(buildBenchmarkArgs({ iterations: 17 })).toEqual([
      '--iteration-count=17',
      '--dump-json-results',
    ]);
  });

  it('adds test, tag, and boolean flags', () => {
    expect(buildBenchmarkArgs({
      iterations: 2,
      test: 'proxy-mobx',
      tag: 'wasm',
      noPrefetch: true,
      forceGC: true,
      groupDetails: true,
      jetstreamArgs: ['--custom-post-iteration-code=gc()'],
    })).toEqual([
      '--iteration-count=2',
      '--dump-json-results',
      '--test=proxy-mobx',
      '--tag=wasm',
      '--no-prefetch',
      '--force-gc',
      '--group-details',
      '--custom-post-iteration-code=gc()',
    ]);
  });
});

describe('buildShellArgs', () => {
  it('passes SpiderMonkey benchmark args directly after cli.js', () => {
    expect(buildShellArgs('spidermonkey', ['--help'])).toEqual(['cli.js', '--help']);
  });

  it('inserts separator for V8', () => {
    expect(buildShellArgs('v8', ['--help'])).toEqual(['cli.js', '--', '--help']);
  });

  it('keeps shell args before cli.js', () => {
    expect(buildShellArgs('v8', ['--help'], ['--perf-prof'])).toEqual([
      '--perf-prof',
      'cli.js',
      '--',
      '--help',
    ]);
  });
});

describe('profilingShellArgs', () => {
  it('adds V8 perf integration flags only for V8', () => {
    expect(profilingShellArgs('v8')).toEqual(['--perf-prof', '--interpreted-frames-native-stack']);
    expect(profilingShellArgs('spidermonkey')).toEqual([]);
  });
});

describe('extractScoreFromResults', () => {
  it('extracts geometric mean score from JetStream JSON', () => {
    const stdout = `\nnoise\n${JSON.stringify({
      'JetStream3.0': {
        metrics: { Score: ['Geometric'] },
        tests: {
          a: { metrics: { Score: { current: [100] } } },
          b: { metrics: { Score: { current: [400] } } },
        },
      },
    })}\n`;

    expect(extractScoreFromResults(stdout)).toBe(200);
  });

  it('throws when no JSON is present', () => {
    expect(() => extractScoreFromResults('Overall Score 100')).toThrow('No JSON');
  });
});
