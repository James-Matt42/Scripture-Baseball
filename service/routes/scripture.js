import { Router } from 'express';
import {
  ScriptureApiError,
  checkAnswer,
  getPublicBooks,
  getPublicChallengeQuestions,
  getPublicQuestion,
  listPublicChallenges,
} from '../domain/scriptureApi.js';

export const scriptureRouter = Router();

function respond(res, action) {
  try {
    res.json(action());
  } catch (error) {
    if (error instanceof ScriptureApiError) {
      res.status(error.status).json({ error: error.message });
    } else {
      throw error;
    }
  }
}

scriptureRouter.get('/scripture/books', (_req, res) => {
  respond(res, getPublicBooks);
});

scriptureRouter.get('/challenges', (req, res) => {
  respond(res, () => listPublicChallenges(req.query));
});

scriptureRouter.get('/challenges/:challengeId/questions', (req, res) => {
  respond(res, () => getPublicChallengeQuestions(req.params.challengeId, req.query));
});

scriptureRouter.get('/scripture/questions/:questionId', (req, res) => {
  respond(res, () => getPublicQuestion(req.params.questionId));
});

scriptureRouter.post('/scripture/questions/:questionId/answer', (req, res) => {
  respond(res, () => checkAnswer(req.params.questionId, req.body));
});
