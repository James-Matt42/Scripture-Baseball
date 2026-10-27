import { existsSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serviceDirectory = dirname(fileURLToPath(import.meta.url));

/**
 * The course deploy script copies Vite's dist/ files into public/ beside the
 * backend. When running the backend from the source tree, serve ../dist instead.
 * Never use the repository's private content/ directory as static content.
 */
export function frontendDirectory(directory = serviceDirectory) {
  const deployedDirectory = resolve(directory, 'public');
  return existsSync(deployedDirectory)
    ? deployedDirectory
    : resolve(directory, '..', 'dist');
}

/** Missing assets should be genuine 404s, not the React app's index.html. */
export function isClientRoute(pathname) {
  const firstSegment = pathname.split('/')[1];
  return pathname.startsWith('/') &&
    !['api', 'assets'].includes(firstSegment) &&
    !extname(pathname);
}
