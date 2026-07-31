export function candidateDiagnosticPassed(results: readonly { status: string }[]): boolean {
  return results.length > 0 && results.every((result) => result.status === 'completed');
}
