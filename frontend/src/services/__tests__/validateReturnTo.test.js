import { describe, it, expect } from 'vitest';
import { validateReturnTo } from '../../utils/authUtils';

describe('validateReturnTo', () => {
  describe('allows valid relative paths', () => {
    it('allows root path', () => {
      expect(validateReturnTo("/")).toBe("/");
    });

    it('allows simple paths', () => {
      expect(validateReturnTo("/scan")).toBe("/scan");
      expect(validateReturnTo("/reports/123")).toBe("/reports/123");
    });

    it('allows paths with query strings', () => {
      expect(validateReturnTo("/scan?x=1")).toBe("/scan?x=1");
      expect(validateReturnTo("/reports/123?tab=a&filter=b")).toBe("/reports/123?tab=a&filter=b");
    });

    it('preserves query strings', () => {
      const result = validateReturnTo("/scan?extensionId=abc&tab=details");
      expect(result).toBe("/scan?extensionId=abc&tab=details");
      expect(result).toContain("extensionId=abc");
      expect(result).toContain("tab=details");
    });
  });

  describe('blocks open redirects', () => {
    it('blocks protocol-relative URLs', () => {
      expect(validateReturnTo("//evil.com")).toBe("/");
      expect(validateReturnTo("//evil.com/path")).toBe("/");
    });

    it('blocks absolute URLs with http', () => {
      expect(validateReturnTo("http://evil.com")).toBe("/");
      expect(validateReturnTo("http://evil.com/path")).toBe("/");
    });

    it('blocks absolute URLs with https', () => {
      expect(validateReturnTo("https://evil.com")).toBe("/");
      expect(validateReturnTo("https://evil.com/path")).toBe("/");
    });

    it('blocks javascript: protocol', () => {
      expect(validateReturnTo("javascript:alert('xss')")).toBe("/");
    });

    it('blocks data: protocol', () => {
      expect(validateReturnTo("data:text/html,<script>alert('xss')</script>")).toBe("/");
    });
  });

  describe('handles edge cases', () => {
    it('handles null', () => {
      expect(validateReturnTo(null)).toBe("/");
    });

    it('handles undefined', () => {
      expect(validateReturnTo(undefined)).toBe("/");
    });

    it('handles empty string', () => {
      expect(validateReturnTo("")).toBe("/");
    });

    it('handles whitespace-only strings', () => {
      expect(validateReturnTo("   ")).toBe("/");
      expect(validateReturnTo("\t\n")).toBe("/");
    });
  });

  describe('prevents callback loops', () => {
    it('blocks /auth/callback', () => {
      expect(validateReturnTo("/auth/callback")).toBe("/");
    });

    it('blocks /auth/callback with query params', () => {
      expect(validateReturnTo("/auth/callback?code=abc")).toBe("/");
      expect(validateReturnTo("/auth/callback?x=1")).toBe("/");
    });

    it('blocks /auth/callback with path segments', () => {
      expect(validateReturnTo("/auth/callback/anything")).toBe("/");
      expect(validateReturnTo("/auth/callback/extra/path")).toBe("/");
    });

    it('allows other /auth paths', () => {
      expect(validateReturnTo("/auth/diagnostics")).toBe("/auth/diagnostics");
      expect(validateReturnTo("/auth/settings")).toBe("/auth/settings");
    });
  });

  describe('normalization', () => {
    it('trims whitespace', () => {
      expect(validateReturnTo("  /scan  ")).toBe("/scan");
      expect(validateReturnTo("\t/scan\n")).toBe("/scan");
      expect(validateReturnTo(" /reports/123 ")).toBe("/reports/123");
    });

    it('replaces backslashes with forward slashes', () => {
      expect(validateReturnTo("\\scan")).toBe("/scan");
      expect(validateReturnTo("\\reports\\123")).toBe("/reports/123");
      expect(validateReturnTo("/scan\\test")).toBe("/scan/test");
    });

    it('rejects strings containing null bytes', () => {
      expect(validateReturnTo("/scan\u0000")).toBe("/");
      expect(validateReturnTo("\u0000/scan")).toBe("/");
    });

    it('rejects strings containing control characters', () => {
      expect(validateReturnTo("/scan\u0001")).toBe("/");
      expect(validateReturnTo("/scan\u001F")).toBe("/");
      // Allow tab, newline, carriage return in validation (they get trimmed)
      expect(validateReturnTo("  /scan\t  ")).toBe("/scan");
    });

    it('normalizes mixed backslashes and forward slashes', () => {
      expect(validateReturnTo("\\scan\\test\\path")).toBe("/scan/test/path");
      expect(validateReturnTo("/scan\\test/path")).toBe("/scan/test/path");
    });

    it('handles whitespace and backslashes together', () => {
      expect(validateReturnTo("  \\scan\\test  ")).toBe("/scan/test");
    });
  });

  describe('preserves valid paths', () => {
    it('preserves scan results path', () => {
      expect(validateReturnTo("/scan/results/abc123")).toBe("/scan/results/abc123");
    });

    it('preserves paths with special characters in query', () => {
      expect(validateReturnTo("/scan?url=https%3A%2F%2Fexample.com")).toBe("/scan?url=https%3A%2F%2Fexample.com");
    });
  });
});

