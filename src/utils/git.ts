/**
 * Determines if a given git ref is a tag reference.
 * @param ref The git ref to check (e.g., 'refs/heads/main', 'refs/tags/v1.0.0')
 * @returns True if the ref is a tag reference, false otherwise
 */
export function isRefTag(ref: string): boolean {
  return ref.startsWith("refs/tags/");
}

/**
 * Extracts the branch name from a git ref. For example, given 'refs/heads/main', it will return 'main'.
 * @param ref The git ref to extract the branch name from (e.g., 'refs/heads/main')
 * @returns The extracted branch name (e.g., 'main') otherwise null if the ref does not start with 'refs/heads/'
 */
export function branchNameFromRef(ref: string): string | null {
  if (ref.startsWith("refs/heads/")) {
    const branchName = ref.replace("refs/heads/", "");
    return branchName ? branchName : null;
  }
  return null;
}
