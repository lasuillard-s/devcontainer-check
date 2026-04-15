import { type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
	installCommand: 'npm clean-install',
	buildCommand: 'npm run build',
	outputDirectory: './dist'
};
