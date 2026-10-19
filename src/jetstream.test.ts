import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkArgs,
  buildShellArgs,
  extractBreakdownFromResults,
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

describe('extractBreakdownFromResults', () => {
  it('returns per-workload scores and per-subscore times', () => {
    const stdout = JSON.stringify({
      'JetStream3.0': {
        metrics: { Score: ['Geometric'] },
        tests: {
          'proxy-mobx': {
            metrics: { Score: { current: [125] }, Time: ['Geometric'] },
            tests: {
              First: { metrics: { Time: { current: [50] } } },
              Worst: { metrics: { Time: { current: [40] } } },
              Average: { metrics: { Time: { current: [30] } } },
            },
          },
          'WSL': {
            metrics: { Score: { current: [10] }, Time: ['Geometric'] },
            tests: {
              Stdlib: { metrics: { Time: { current: [500] } } },
              MainRun: { metrics: { Time: { current: [null] } } },
            },
          },
        },
      },
    });

    expect(extractBreakdownFromResults(stdout)).toEqual([
      { suite_id: 'proxy-mobx', subtest_id: '__total__', label: 'proxy-mobx', unit: 'score', higher_is_better: true, samples: [125], mean: 125, stddev: 0 },
      { suite_id: 'proxy-mobx', subtest_id: 'first', label: 'proxy-mobx/First', unit: 'ms', higher_is_better: false, samples: [50], mean: 50, stddev: 0 },
      { suite_id: 'proxy-mobx', subtest_id: 'worst', label: 'proxy-mobx/Worst', unit: 'ms', higher_is_better: false, samples: [40], mean: 40, stddev: 0 },
      { suite_id: 'proxy-mobx', subtest_id: 'average', label: 'proxy-mobx/Average', unit: 'ms', higher_is_better: false, samples: [30], mean: 30, stddev: 0 },
      { suite_id: 'wsl', subtest_id: '__total__', label: 'WSL', unit: 'score', higher_is_better: true, samples: [10], mean: 10, stddev: 0 },
      { suite_id: 'wsl', subtest_id: 'stdlib', label: 'WSL/Stdlib', unit: 'ms', higher_is_better: false, samples: [500], mean: 500, stddev: 0 },
    ]);
  });
});
