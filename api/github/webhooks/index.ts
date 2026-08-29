import pino from 'pino';
import { createNodeMiddleware, createProbot } from 'probot';
import app from '../../../src/app.js';

const log = pino({}, pino.destination({ sync: true }));
const probot = createProbot({ overrides: { log } });

export default createNodeMiddleware(app, { probot, webhooksPath: '/api/github/webhooks' });
