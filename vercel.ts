import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
	installCommand: 'npm ci',
	buildCommand: 'npm run build',
	outputDirectory: './dist'
};
