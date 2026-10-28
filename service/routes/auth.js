import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { registerUser } from '../auth/registration.js';
import { RegistrationError } from '../auth/validation.js';

const BCRYPT_COST = 12;

export function createAuthRouter({ userStore }) {
  const router = Router();

  router.post('/auth/register', async (req, res, next) => {
    // Account details and validation errors must not be cached by intermediaries.
    res.setHeader('Cache-Control', 'no-store');
    try {
      const user = await registerUser(req.body, {
        store: userStore,
        hashPassword: (password) => bcrypt.hash(password, BCRYPT_COST),
      });
      res.status(201).json({ user });
    } catch (error) {
      if (error instanceof RegistrationError) {
        res.status(error.status).json({ error: error.message });
      } else {
        next(error);
      }
    }
  });

  return router;
}
