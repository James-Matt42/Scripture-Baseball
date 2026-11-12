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

/** Only implemented React routes receive the app shell. Retired demo room
 * links return 404 until real WebSocket multiplayer is available. */
export function isClientRoute(pathname) {
  if (typeof pathname !== 'string' || extname(pathname)) return false;
  return /^\/(?:|(?:play|challenges|progress|account)\/?)$/u.test(pathname);
}
