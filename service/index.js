
import express from 'express';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontendDirectory, isClientRoute } from './staticFiles.js';
import { scriptureRouter } from './routes/scripture.js';
import { createAuthRouter } from './routes/auth.js';
import { createInMemoryUserStore } from './auth/userStore.js';
import { createMongoUserStore } from './auth/mongoUserStore.js';
import { createInMemorySessionStore } from './auth/sessionStore.js';
import { createMongoSessionStore } from './auth/mongoSessionStore.js';
import { createSessionAuth } from './auth/authentication.js';
import { createInMemoryProgressStore } from './progress/progressStore.js';
import { createMongoProgressStore } from './progress/mongoProgressStore.js';
import { createProgressRouter } from './routes/progress.js';
import { createMongoConnection, mongoConfigFromEnv } from './db/mongo.js';

export function createApp({
  staticDirectory = frontendDirectory(),
  userStore = createInMemoryUserStore(),
  sessionStore = createInMemorySessionStore(),
  progressStore = createInMemoryProgressStore(),
  // Caddy terminates TLS before proxying to port 4000. Never rely on req.secure
  // alone in the production PM2 process; deployService.sh sets NODE_ENV.
  secureCookies = process.env.NODE_ENV === 'production',
} = {}) {
  const app = express();

  // Protect the authentication, scripture, and progress APIs with one JSON body limit.
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Guest scripture APIs stay public; account endpoints require cookie sessions.
  // Share the same auth guard with application routes added in later commits.
  const sessionAuth = createSessionAuth({ userStore, sessionStore });
  app.use('/api', scriptureRouter);
  app.use('/api', createAuthRouter({ userStore, sessionStore, sessionAuth, secureCookies }));
  app.use('/api', createProgressRouter({ sessionAuth, progressStore }));

  // Unknown API paths must fail as APIs, never return the React HTML shell.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // Express's default error page is HTML; keep malformed JSON and unexpected
  // backend failures in the API's JSON contract without exposing stack traces.
  app.use('/api', (error, _req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error?.status === 400 || error?.status === 413 ? error.status : 500;
    res.status(status).json({
      error: status === 400 ? 'Invalid JSON request body'
        : status === 413 ? 'Request body too large'
          : 'Internal service error',
    });
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

/**
 * Open MongoDB (when configured) and verify its indexes BEFORE accepting HTTP.
 * When MongoDB is configured, user accounts, hashed sessions, attempts,
 * favorites, preferences and atomic guest imports all persist across restarts.
 */
export async function startServer({
  port = 4000,
  application,
  mongo = createMongoConnection(mongoConfigFromEnv()),
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError('The service port must be an integer between 0 and 65535');
  }

  const database = await mongo.connect();
  try {
    // Build the production app only after DB initialization. The exported app
    // remains a standalone in-memory fixture for Service-phase HTTP tests.
    const activeApp = application ?? createApp({
      userStore: database ? createMongoUserStore(database) : createInMemoryUserStore(),
      sessionStore: database ? createMongoSessionStore(database) : createInMemorySessionStore(),
      progressStore: database ? createMongoProgressStore(database) : createInMemoryProgressStore(),
    });
    const server = activeApp.listen(port);
    await once(server, 'listening');
    return { server, mongo };
  } catch (error) {
    await mongo.close();
    throw error;
  }
}

// PM2's fork-mode wrapper imports this module instead of making it argv[1].
// Match PM2's actual application entrypoint as well as direct Node launches.
// Ordinary imports (including HTTP tests) must not start a listener.
const entrypoint = fileURLToPath(import.meta.url);
const directlyInvoked = process.argv[1] && resolve(process.argv[1]) === entrypoint;
const pm2Invoked = process.env.pm_exec_path && resolve(process.env.pm_exec_path) === entrypoint;

if (directlyInvoked || pm2Invoked) {
  const port = Number(process.argv[2] ?? 4000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('The service port must be an integer between 1 and 65535.');
    process.exitCode = 1;
  } else {
    startServer({ port }).then(({ server, mongo }) => {
      console.log(`Scripture Baseball service listening on port ${port}`);
      let shuttingDown = false;
      const shutdown = async () => {
        if (shuttingDown) return;
        shuttingDown = true;
        try {
          await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
          });
        } catch {
          console.error('Service HTTP shutdown failed');
          process.exitCode = 1;
        } finally {
          try {
            await mongo.close();
          } catch {
            console.error('Service MongoDB shutdown failed');
            process.exitCode = 1;
          }
        }
      };
      process.once('SIGTERM', shutdown);
      process.once('SIGINT', shutdown);
    }).catch((error) => {
      // MongoDB initialization deliberately sanitizes driver error messages.
      console.error(`Scripture Baseball service startup failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
