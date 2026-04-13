import nock from 'nock';
import { beforeEach } from 'node:test';
import { afterEach, vi } from 'vitest';

beforeEach(() => {
	nock.disableNetConnect();
});

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
	nock.cleanAll();
	nock.enableNetConnect();
});
