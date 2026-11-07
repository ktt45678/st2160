import { describe, expect, it } from 'vitest';
import { isSt2160Error, St2160Error } from '../src/index.ts';

describe('St2160Error', () => {
  it('carries a code, details and cause', () => {
    const cause = new Error('inner');
    const error = new St2160Error('invalid-argument', 'bad input', {
      cause,
      details: { field: 'url' },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('St2160Error');
    expect(error.code).toBe('invalid-argument');
    expect(error.details).toEqual({ field: 'url' });
    expect(error.cause).toBe(cause);
  });

  it('is recognised by isSt2160Error, optionally by code', () => {
    const error = new St2160Error('aborted', 'stopped');
    expect(isSt2160Error(error)).toBe(true);
    expect(isSt2160Error(error, 'aborted')).toBe(true);
    expect(isSt2160Error(error, 'internal')).toBe(false);
    expect(isSt2160Error(new Error('plain'))).toBe(false);
  });
});
