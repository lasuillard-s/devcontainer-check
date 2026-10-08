/**
 * Converts an unknown error to a string message.
 * @param error The error to convert
 * @returns The error message as a string
 */
export function errorToString(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
