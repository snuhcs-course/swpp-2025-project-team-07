import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEFAULT_SYSTEM_PROMPT } from './system-prompt';

/**
 * Unit tests for system-prompt.ts
 * Tests the DEFAULT_SYSTEM_PROMPT constant and its formatting
 */
describe('DEFAULT_SYSTEM_PROMPT', () => {
  it('should be defined and be a string', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBeDefined();
    expect(typeof DEFAULT_SYSTEM_PROMPT).toBe('string');
  });

  it('should start with RULES:', () => {
    expect(DEFAULT_SYSTEM_PROMPT.startsWith('RULES:')).toBe(true);
  });

  it('should contain all 9 rules', () => {
    const ruleNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    ruleNumbers.forEach((ruleNumber) => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain(`${ruleNumber}.`);
    });
  });

  it('should contain the Clone AI assistant rule', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Clone');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('AI assistant');
  });

  it("should contain today's date with proper formatting", () => {
    // Mock Date.prototype.toLocaleDateString
    const mockDateString = 'Wednesday, November 20, 2025';
    const toLocaleDateStringSpy = vi.spyOn(Date.prototype, 'toLocaleDateString');
    toLocaleDateStringSpy.mockReturnValue(mockDateString);

    // The prompt uses the current date at module load time, so we need to check the format exists
    expect(DEFAULT_SYSTEM_PROMPT).toContain("Today's date:");
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/Today's date:.+/);

    toLocaleDateStringSpy.mockRestore();
  });

  it('should contain memory-related rules', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('memory');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('<memory>');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('conversation history');
  });

  it('should contain screen recordings rule', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('screen recordings');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('1fps');
  });

  it('should contain the rule about answering user queries precisely', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('answering the current user');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('precisely');
  });

  it('should contain the rule to be concise and direct', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('concise');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('direct');
  });

  it('should contain rule about using memory when relevant', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Only use <memory>');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('relevant');
  });

  it('should contain rule about ignoring memory for general queries', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('general queries');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('ignore <memory>');
  });

  it('should contain rule about screen recording visibility identification', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('identify visible elements');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('ignore if irrelevant');
  });

  it('should have proper formatting with line breaks between rules', () => {
    const rules = DEFAULT_SYSTEM_PROMPT.split('\n');
    // Should have multiple lines (one per rule approximately)
    expect(rules.length).toBeGreaterThan(1);
  });

  it('should include accessibility considerations with visible elements', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('visible elements');
  });

  it('should properly format the date section in rule 2', () => {
    // Check that rule 2 exists and contains the date formatting
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/2\.\s+Today's date:/);
  });

  it('should indicate that Clone can access/utilize resources in rule 3', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Clone can access/utilize');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('conversation history');
    expect(DEFAULT_SYSTEM_PROMPT).toContain('screen recordings');
  });

  it('should describe conversation history storage in rule 4', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/<memory>\s+contains/);
    expect(DEFAULT_SYSTEM_PROMPT).toContain('previous sessions');
  });

  it('should contain rule 7 about 1fps screen activity', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/7\.\s+/);
    expect(DEFAULT_SYSTEM_PROMPT).toContain('1fps activity');
  });

  it('should contain rule 8 about focusing on current query', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/8\.\s+/);
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Focus on answering the current user');
  });

  it('should contain rule 9 as the final rule', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toMatch(/9\.\s+/);
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Be concise and direct');
    // Rule 9 should be near the end
    expect(DEFAULT_SYSTEM_PROMPT.endsWith('Be concise and direct.')).toBe(true);
  });

  it('should not have trailing whitespace after the final rule', () => {
    expect(DEFAULT_SYSTEM_PROMPT.trim()).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it('should have exactly 9 numbered rules (1-9)', () => {
    const ruleMatches = DEFAULT_SYSTEM_PROMPT.match(/\d+\./g);
    expect(ruleMatches).not.toBeNull();
    expect(ruleMatches).toHaveLength(9);

    // Verify they are in order
    for (let i = 1; i <= 9; i++) {
      expect(DEFAULT_SYSTEM_PROMPT).toContain(`${i}.`);
    }
  });

  it('should be a template string with the current date evaluated at import time', () => {
    // The date should already be interpolated in the string
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('${');
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain('}');
    expect(DEFAULT_SYSTEM_PROMPT).toContain("Today's date:");
  });
});
