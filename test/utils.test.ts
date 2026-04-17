import { describe, expect } from 'vitest';
import { errorToString } from '../src/utils.js';
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
