import { Router } from 'express';
import { getChallengeById, getChallengeQuestions } from '../domain/catalog.js';
import { getPublicBooks, publicChallenge, publicQuestion } from '../domain/scriptureApi.js';
import {
  ProgressError, validateAttempt, validateFavorites, validateGuestImport, validatePreferencesPatch,
} from '../progress/validation.js';

/** All routes derive the user ID from the verified cookie, never the request body. */
export function createProgressRouter({ sessionAuth, progressStore }) {
  const router = Router();
  router.use('/account', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use('/account', sessionAuth.requireUser);

  function respond(res, action, status = 200) {
    try {
      res.status(status).json(action());
    } catch (error) {
      if (error instanceof ProgressError) {
        res.status(error.status).json({ error: error.message });
      } else {
        throw error;
      }
    }
  }

  router.get('/account/progress', (req, res) => {
    respond(res, () => ({
      attempts: progressStore.attempts(req.authUser.id),
      summary: progressStore.summary(req.authUser.id),
    }));
  });

  router.post('/account/attempts', (req, res) => {
    // Replays return 200, while newly persisted attempts return 201.
    try {
      const result = progressStore.recordAttempt(req.authUser.id, validateAttempt(req.body));
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      if (error instanceof ProgressError) res.status(error.status).json({ error: error.message });
      else throw error;
    }
  });

  router.get('/account/favorites', (req, res) => {
    respond(res, () => ({ favorites: progressStore.favorites(req.authUser.id) }));
  });

  router.put('/account/favorites', (req, res) => {
    respond(res, () => {
      if (!req.body || !Object.hasOwn(req.body, 'favorites')) {
        throw new ProgressError('favorites is required');
      }
      return { favorites: progressStore.setFavorites(req.authUser.id, validateFavorites(req.body.favorites)) };
    });
  });

  router.get('/account/preferences', (req, res) => {
    respond(res, () => ({ preferences: progressStore.preferences(req.authUser.id) }));
  });

  router.patch('/account/preferences', (req, res) => {
    respond(res, () => ({
      preferences: progressStore.setPreferences(req.authUser.id, validatePreferencesPatch(req.body)),
    }));
  });

  router.post('/account/import', (req, res) => {
    respond(res, () => progressStore.importGuest(req.authUser.id, validateGuestImport(req.body)));
  });

  router.get('/account/challenges/:challengeId/questions', (req, res) => {
    respond(res, () => {
      const challenge = getChallengeById(req.params.challengeId);
      if (!challenge) throw new ProgressError('Challenge not found', 404);
      const keys = Object.keys(req.query);
      const volumes = new Set(getPublicBooks().map((book) => book.volume));
      if (keys.some((key) => key !== 'volume') ||
          (req.query.volume !== undefined && !volumes.has(req.query.volume))) {
        throw new ProgressError('Invalid challenge volume filter');
      }
      const questions = getChallengeQuestions(
        challenge.id,
        progressStore.attempts(req.authUser.id),
        progressStore.favorites(req.authUser.id),
        req.query.volume ?? '',
      ).map(publicQuestion);
      return { challenge: publicChallenge(challenge), questions, total: questions.length };
    });
  });

  return router;
}
