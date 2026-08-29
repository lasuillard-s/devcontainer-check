import pino from 'pino';
import { createNodeMiddleware, createProbot } from 'probot';
import app from '../../../src/app.js';

const log = pino(
	{},
	{
		write: (msg: string) => {
			console.log(msg);
		}
	}
);
const probot = createProbot({ overrides: { log } });

export default createNodeMiddleware(app, { probot, webhooksPath: '/api/github/webhooks' });
