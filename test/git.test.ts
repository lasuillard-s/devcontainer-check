import { describe, expect } from 'vitest';
import { branchNameFromRef, isRefTag } from '../src/git.js';
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

describe('branchNameFromRef', () => {
	test('should extract branch name from refs/heads/', () => {
		expect(branchNameFromRef('refs/heads/main')).toBe('main');
		expect(branchNameFromRef('refs/heads/feature-branch')).toBe('feature-branch');
	});

	test('should return null if the ref does not start with refs/heads/', () => {
		expect(branchNameFromRef('refs/tags/v1.0.0')).toBeNull();
		expect(branchNameFromRef('refs/pull/123')).toBeNull();
	});
});
