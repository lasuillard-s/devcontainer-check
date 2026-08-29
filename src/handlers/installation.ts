import { Context, Probot } from 'probot';
import { AppConfig } from '../config.js';
import { errorToString } from '../utils.js';
import { BaseHandler } from './base.js';

/**
 * Handler for GitHub App installation.created and installation.unsuspend events.
 *
 * Enforces user access control by checking the installation's principal against
 * `ALLOWED_PRINCIPALS`. If configured and the principal is unauthorized, the installation
 * is immediately deleted/uninstalled.
 */
export default class InstallationHandler extends BaseHandler<
	Context<'installation.created' | 'installation.unsuspend'>
> {
	private readonly app: Probot;

	constructor(
		context: Context<'installation.created' | 'installation.unsuspend'>,
		appConfig: AppConfig,
		app: Probot
	) {
		super(context, appConfig);
		this.app = app;
	}

	async handle(): Promise<void> {
		const allowedPrincipals = this.appConfig.ALLOWED_PRINCIPALS;

		// If ALLOWED_PRINCIPALS is not configured, skip the access control check.
		if (allowedPrincipals.length === 0) {
			this.log.debug(
				'ALLOWED_PRINCIPALS is not configured; skipping installation access control check.'
			);
			return;
		}

		// Check the principal of the installation against the allowed principals list.
		const principal = this.getPrincipal();
		const installationId = this.context.payload.installation.id;
		if (!principal) {
			this.log.warn(`Installation ${installationId} has no recognizable account login; skipping.`);
			return;
		}

		if (!allowedPrincipals.includes(principal)) {
			this.log.warn(
				`Installation ${installationId} created by unauthorized principal: "${principal}". Uninstalling...`
			);
			try {
				const appOctokit = await this.app.auth();
				await appOctokit.rest.apps.deleteInstallation({
					installation_id: installationId
				});
				this.log.info(
					`Deleted installation ${installationId} for unauthorized principal: "${principal}".`
				);
			} catch (error) {
				this.log.error(
					`Failed to delete installation ${installationId} for unauthorized principal "${principal}": ${errorToString(error)}`
				);
			}
		} else {
			this.log.info(
				`Installation ${installationId} created by authorized principal: "${principal}".`
			);
		}
	}

	/**
	 * Retrieves the principal (login) of the installation's account.
	 * @returns The principal login or null if not available.
	 */
	private getPrincipal(): string | null {
		const account = this.context.payload.installation.account;

		// NOTE: The `login` property is expected to be present on the account object,
		//       but typescript does not recognize it as such
		if (!account || !('login' in account)) {
			return null;
		}

		const principal = (account.login as string).toLowerCase();
		return principal || null;
	}
}
