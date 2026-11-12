import { Router } from 'express';
import { summarizeProgress } from '../progress/progressStore.js';
import { ProgressError, validatePreferencesPatch } from '../progress/validation.js';

/** Account progress is always derived from authenticated, server-graded pitches. */
export function createProgressRouter({ sessionAuth, progressStore }) {
  const router = Router();
  router.use('/account', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use('/account', sessionAuth.requireUser);

  async function respond(res, next, action) {
    try { res.json(await action()); }
    catch (error) {
      if (error instanceof ProgressError) res.status(error.status).json({ error: error.message });
      else next(error);
    }
  }

  router.get('/account/progress', (req, res, next) => respond(res, next, async () => {
    const attempts = await progressStore.attempts(req.authUser.id);
    return { attempts, summary: summarizeProgress(attempts) };
  }));
  router.get('/account/preferences', (req, res, next) => respond(res, next,
    async () => ({ preferences: await progressStore.preferences(req.authUser.id) })));
  router.patch('/account/preferences', (req, res, next) => respond(res, next,
    async () => ({ preferences: await progressStore.setPreferences(req.authUser.id,
      validatePreferencesPatch(req.body)) })));
  return router;
}
