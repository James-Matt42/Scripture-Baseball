import { Router } from 'express';
import { PracticeError } from '../scripture/practiceSession.js';
import { ProgressError, MAX_FAVORITES } from '../progress/validation.js';
import { verifiedAttemptFromPitch } from '../progress/verifiedAttempt.js';
import { validateGuestSelection } from '../scripture/practiceCollections.js';

/** Corpus-backed gameplay. The browser never chooses a reference or grade. */
export function createPracticeRouter({ engine = null, sessionAuth = null, progressStore = null } = {}) {
  const router = Router();
  router.use('/practice', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  async function respond(res, next, action, status = 200, needsCorpus = true) {
    try {
      if (needsCorpus && !engine) throw new PracticeError(503, 'Scripture corpus is not configured');
      res.status(status).json(await action());
    } catch (error) {
      if (error instanceof PracticeError || error instanceof ProgressError) {
        res.status(error.status).json({ error: error.message });
      } else {
        next(error);
      }
    }
  }

  const requireUser = sessionAuth?.requireUser ?? ((_req, res) => res.status(503).json({ error: 'Account service unavailable' }));

  router.get('/practice/catalog', (_req, res, next) => respond(res, next, () => engine.getCatalog()));
  router.post('/practice/pitches', (req, res, next) => respond(res, next, async () => {
    const body = req.body ?? {};
    if (typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some((field) => !['scope', 'exactVerse', 'collection', 'guestSelection'].includes(field))) {
      throw new PracticeError(400, 'Invalid practice settings');
    }
    const user = sessionAuth ? await sessionAuth.currentUser(req) : null;
    if (user && body.guestSelection !== undefined) {
      throw new PracticeError(400, 'Authenticated collections use verified account history');
    }
    const selection = user && body.collection && body.collection !== 'all'
      ? { attempts: await progressStore.attempts(user.id), favorites: await progressStore.favorites(user.id) }
      : validateGuestSelection(body.guestSelection, (status, message) => { throw new PracticeError(status, message); });
    const { guestSelection: _guestSelection, ...options } = body;
    return engine.createPitch(options, selection);
  }, 201));
  router.get('/practice/pitches/:pitchId', (req, res, next) => respond(res, next,
    () => engine.getPitch(req.params.pitchId)));
  router.post('/practice/pitches/:pitchId/answers', (req, res, next) => respond(res, next, async () => {
    const answer = engine.submitAnswer(req.params.pitchId, req.body);
    if (answer.nextStage !== 'complete') return answer;
    const completed = verifiedAttemptFromPitch(req.params.pitchId,
      engine.getCompletedAttempt(req.params.pitchId));
    if (!progressStore) throw new PracticeError(503, 'Progress storage unavailable');
    const user = sessionAuth ? await sessionAuth.currentUser(req) : null;
    if (user) {
      await progressStore.recordVerifiedAttempt(user.id, completed);
      return { ...answer, savedToAccount: true };
    }
    await progressStore.stageGuestPitch(req.params.pitchId, completed);
    // Claim can be retried later, even after a service restart, as long as
    // the guest retains this unguessable pitch token.
    return { ...answer, savedToAccount: false, guestClaimable: true };
  }));

  router.post('/practice/pitches/:pitchId/claim', requireUser,
    (req, res, next) => respond(res, next, async () => {
      if (!progressStore) throw new PracticeError(503, 'Progress storage unavailable');
      if (req.body && Object.keys(req.body).length) {
        throw new PracticeError(400, 'Guest claim does not accept client-provided answers');
      }
      const result = await progressStore.claimGuestPitch(req.authUser.id, req.params.pitchId);
      return { attempt: result.attempt, created: result.created };
    }, 200, false));

  router.get('/practice/favorites', requireUser, (_req, res, next) => respond(res, next,
    async () => ({ favorites: await progressStore.favorites(_req.authUser.id) }), 200, false));
  router.put('/practice/favorites', requireUser, (req, res, next) => respond(res, next, async () => {
    const values = req.body?.favorites;
    if (!Array.isArray(values) || values.length > MAX_FAVORITES ||
        values.some((reference) => !engine.hasVerseReference(reference))) {
      throw new PracticeError(400, `favorites must contain no more than ${MAX_FAVORITES} valid scripture references`);
    }
    const favorites = [...new Set(values)];
    return { favorites: await progressStore.setFavorites(req.authUser.id, favorites) };
  }, 200, true));

  return router;
}
