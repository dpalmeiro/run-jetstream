import { describe, expect, it } from 'vitest';
import { program } from './program.js';

describe('CLI', () => {
  it('registers run command', () => {
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('run');
  });

  it('version is 0.1.0', () => {
    expect(program.version()).toBe('0.1.0');
  });

  it('has shell runner options', () => {
    const run = program.commands.find((c) => c.name() === 'run');
    expect(run).toBeDefined();
    const optionNames = run!.options.map((o) => o.long);
    expect(optionNames).toContain('--spidermonkey');
    expect(optionNames).toContain('--v8');
    expect(optionNames).toContain('--iterations');
    expect(optionNames).toContain('--profile-shell');
    expect(optionNames).toContain('--samply');
  });
});
