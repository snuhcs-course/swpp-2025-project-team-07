import { describe, it, expect } from 'vitest';
import { getUserInitials } from './user';

describe('getUserInitials', () => {
  it('returns the first letter of the username in uppercase', () => {
    expect(getUserInitials('alice')).toBe('A');
    expect(getUserInitials('Bob')).toBe('B');
  });

  it('falls back to the first letter of the email when username missing', () => {
    expect(getUserInitials(undefined, 'carol@example.com')).toBe('C');
  });

  it('returns default initial when no identifier provided', () => {
    expect(getUserInitials()).toBe('U');
  });
});
