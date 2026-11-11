import { Router } from 'express';
import { PracticeError } from '../scripture/practiceSession.js';

/** Independent, corpus-backed API. DB-09 will connect the React client to it. */
export function createPracticeRouter({ engine = null } = {}) {
  const router = Router();
  router.use('/practice', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  function respond(res, action, status = 200) {
    try {
      if (!engine) throw new PracticeError(503, 'Scripture corpus is not configured');
      res.status(status).json(action());
    } catch (error) {
      if (error instanceof PracticeError) {
        res.status(error.status).json({ error: error.message });
      } else {
        throw error;
      }
    }
  }

  router.get('/practice/catalog', (_req, res) => respond(res, () => engine.getCatalog()));
  router.post('/practice/pitches', (req, res) => respond(res,
    () => engine.createPitch(req.body), 201));
  router.get('/practice/pitches/:pitchId', (req, res) => respond(res,
    () => engine.getPitch(req.params.pitchId)));
  router.post('/practice/pitches/:pitchId/answers', (req, res) => respond(res,
    () => engine.submitAnswer(req.params.pitchId, req.body)));
  return router;
}
