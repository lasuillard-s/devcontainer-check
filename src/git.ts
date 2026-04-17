/**
 * Determines if a given git ref is a tag reference.
 * @param ref The git ref to check (e.g., 'refs/heads/main', 'refs/tags/v1.0.0')
 * @returns True if the ref is a tag reference, false otherwise
 */
export function isRefTag(ref: string): boolean {
	return ref.startsWith('refs/tags/');
}
