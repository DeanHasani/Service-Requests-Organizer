import { describe, expect, it } from 'vitest';
import { safeNext } from '../pages/LoginPage';

describe('post-login redirect guard', () => {
  it.each([
    ['/requests/7', '/requests/7'],
    ['/my?status=OPEN', '/my?status=OPEN'],
    [null, '/'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});
