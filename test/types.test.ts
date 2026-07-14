import { describe, expect } from 'vitest';
import { Repo } from '../src/types.js';
import { test } from './helpers.js';

describe('Repo', () => {
	test('toFullName returns owner/repo format', () => {
		expect(new Repo('owner', 'repo').toFullName()).toBe('owner/repo');
	});

	test('fromFullName parses owner/repo', () => {
		expect(Repo.fromFullName('owner/repo')).toEqual(new Repo('owner', 'repo'));
	});

	test('equals compares owner and repo', () => {
		expect(new Repo('owner', 'repo').equals(new Repo('owner', 'repo'))).toBe(true);
		expect(new Repo('owner', 'repo').equals(new Repo('other', 'repo'))).toBe(false);
		expect(new Repo('owner', 'repo').equals(new Repo('owner', 'other'))).toBe(false);
	});
});
