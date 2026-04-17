import { describe, expect } from 'vitest';
import { errorToString, matchPatterns } from '../src/utils.js';
import { test } from './helpers.js';

describe('errorToString', () => {
	test('returns the message for Error instances', () => {
		expect(errorToString(new Error('boom'))).toBe('boom');
	});

	test('stringifies non-Error values', () => {
		expect(errorToString('plain failure')).toBe('plain failure');
		expect(errorToString(null)).toBe('null');
	});
});

describe('matchPatterns', () => {
	test('matches values against glob patterns', () => {
		expect(matchPatterns('main', ['main', 'develop'], {})).toBe(true);
		expect(matchPatterns('feature-branch', ['feature-*'], {})).toBe(true);
		expect(matchPatterns('hotfix-123', ['hotfix-*'], {})).toBe(true);
	});

	test('resolves aliases before matching', () => {
		const aliases = { '~DEFAULT_BRANCH': 'main' };
		expect(matchPatterns('~DEFAULT_BRANCH', ['main'], aliases)).toBe(true);
		expect(matchPatterns('~DEFAULT_BRANCH', ['develop'], aliases)).toBe(false);
	});
});
