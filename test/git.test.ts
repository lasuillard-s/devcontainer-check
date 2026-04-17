import { describe, expect } from 'vitest';
import { isRefTag } from '../src/git';
import { test } from './helpers.js';

describe('isRefTag', () => {
	test('should return true for tag refs', () => {
		expect(isRefTag('refs/tags/v1.0.0')).toBe(true);
		expect(isRefTag('refs/tags/feature-branch')).toBe(true);
	});

	test('should return false for non-tag refs', () => {
		expect(isRefTag('refs/heads/main')).toBe(false);
		expect(isRefTag('refs/heads/feature-branch')).toBe(false);
		expect(isRefTag('refs/pull/123')).toBe(false);
	});
});
