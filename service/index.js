import express from 'express';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const app = express();

// Application routes added in later commits will use this JSON middleware.
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Keep importing the app safe for endpoint tests without starting a server.
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
