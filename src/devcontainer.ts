/**
 * Checks if any of the changed files are related to devcontainer configuration.
 * @param changedFiles Array of changed(added, modified, or removed) file names
 * @returns True if any devcontainer-related file is changed, false otherwise
 */
export function isDevContainerFileChanged(changedFiles: string[]): boolean {
	let changed = false;
	for (const file of changedFiles) {
		if (file.startsWith('.devcontainer/') || file.startsWith('.devcontainer.example/')) {
			changed = true;
		}
	}
	return changed;
}
