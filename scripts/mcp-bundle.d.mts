export function zip(files: readonly (readonly [string, string])[]): Buffer;
export function bundleFiles(
  connector?: string,
): Record<string, [string, string][]>;
