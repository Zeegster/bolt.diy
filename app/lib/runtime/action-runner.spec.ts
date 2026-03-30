import { describe, expect, it } from 'vitest';
import { assertPublisherFileWriteAllowed, ActionCommandError } from './action-runner';

describe('action runner publisher guard', () => {
  it('blocks publisher out-of-scope writes', () => {
    expect(() =>
      assertPublisherFileWriteAllowed('/home/project/.bolt/publisher/project.json', 'contracts-only'),
    ).not.toThrow();
    expect(() =>
      assertPublisherFileWriteAllowed('/home/project/.bolt/publisher/pages/home.json', 'contracts-only'),
    ).not.toThrow();
    expect(() =>
      assertPublisherFileWriteAllowed('/home/project/.bolt/publisher/checks.json', 'contracts-plus-checks'),
    ).not.toThrow();

    expect(() =>
      assertPublisherFileWriteAllowed('/home/project/.bolt/publisher/checks.json', 'contracts-only'),
    ).toThrowError(ActionCommandError);
    expect(() =>
      assertPublisherFileWriteAllowed('/home/project/.bolt/publisher/generated/index.html', 'contracts-only'),
    ).toThrowError(ActionCommandError);
    expect(() =>
      assertPublisherFileWriteAllowed('/home/project/.bolt/publisher/intake/session.json', 'contracts-plus-checks'),
    ).toThrowError(ActionCommandError);
    expect(() =>
      assertPublisherFileWriteAllowed('/home/project/.bolt/publisher/state.json', 'contracts-plus-checks'),
    ).toThrowError(/Blocked publisher file write/);
    expect(() => assertPublisherFileWriteAllowed('/home/project/src/routes/index.tsx', 'contracts-only')).not.toThrow();
  });
});
