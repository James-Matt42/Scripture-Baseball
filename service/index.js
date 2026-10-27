import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontendDirectory, isClientRoute } from './staticFiles.js';

export function createApp({ staticDirectory = frontendDirectory() } = {}) {
  const app = express();

  // Application routes added in later commits will use this JSON middleware.
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Unknown API paths must fail as APIs, never return the React HTML shell.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Vite builds to ../dist locally. deployService.sh publishes dist to public/.
  app.use(express.static(staticDirectory));

  // React Router needs index.html for direct requests to client-side routes.
  // Do not send HTML for missing JS/CSS/images or non-page requests.
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') ||
        !isClientRoute(req.path) || !req.accepts('html')) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    res.sendFile('index.html', { root: staticDirectory }, (error) => {
      if (error) next(error);
    });
  });

  return app;
}

// Export the app without opening a port so HTTP tests can use ephemeral ports.
export const app = createApp();

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] ?? 4000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('The service port must be an integer between 1 and 65535.');
    process.exitCode = 1;
  } else {
    app.listen(port, () => {
      console.log(`Scripture Baseball service listening on port ${port}`);
    });
  }
}
