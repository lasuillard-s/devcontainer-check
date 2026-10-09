/**
 * Checks if any of the changed files are related to devcontainer configuration.
 * @param changedFiles Array of changed(added, modified, or removed) file names
 * @param referencedFiles Optional array of file paths explicitly referenced in devcontainer configuration
 * @returns True if any devcontainer-related file is changed, false otherwise
 */
export function isDevContainerFileChanged(
  changedFiles: string[],
  referencedFiles: string[] = [],
): boolean {
  const referencedSet = new Set(referencedFiles);
  for (const file of changedFiles) {
    if (
      file.startsWith(".devcontainer/") ||
      file.startsWith(".devcontainer.example/") ||
      file === ".devcontainer.json" ||
      file === ".devcontainer.example.json" ||
      file === "devcontainer-lock.json" ||
      file === ".devcontainer-lock.json" ||
      file === "devcontainer-lock.example.json" ||
      file === ".devcontainer-lock.example.json" ||
      referencedSet.has(file)
    ) {
      return true;
    }
  }
  return false;
}
