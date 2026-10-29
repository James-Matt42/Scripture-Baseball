import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { registerUser } from '../auth/registration.js';
import { authenticateUser } from '../auth/authentication.js';
import { readSessionCookie, SESSION_COOKIE_NAME, sessionCookieOptions } from '../auth/sessionCookies.js';
import { RegistrationError } from '../auth/validation.js';

const BCRYPT_COST = 12;

export function createAuthRouter({ userStore, sessionStore, sessionAuth, secureCookies }) {
  const router = Router();

  // Prevent account/session responses (including authentication failures) from
  // being stored by browsers or caching intermediaries.
  router.use(['/auth', '/account'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  router.post('/auth/register', async (req, res, next) => {
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

  router.post('/auth/login', async (req, res, next) => {
    try {
      const user = await authenticateUser(req.body, {
        store: userStore,
        verifyPassword: (password, hash) => bcrypt.compare(password, hash),
      });
      // A successful login always rotates the browser's old session token.
      sessionStore.revoke(readSessionCookie(req.headers.cookie));
      const token = sessionStore.create(user.id);
      res.cookie(SESSION_COOKIE_NAME, token, sessionCookieOptions({
        secure: secureCookies || req.secure,
      }));
      res.json({ user });
    } catch (error) {
      if (error instanceof RegistrationError) {
        res.status(error.status).json({ error: error.message });
      } else {
        next(error);
      }
    }
  });

  router.get('/auth/session', (req, res) => {
    // A logged-out visitor can restore UI state without a 401 exception.
    res.json({ user: sessionAuth.currentUser(req) });
  });

  router.post('/auth/logout', (req, res) => {
    sessionStore.revoke(readSessionCookie(req.headers.cookie));
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions({
      secure: secureCookies || req.secure,
      withExpiry: false,
    }));
    res.status(204).end();
  });

  router.get('/account/me', sessionAuth.requireUser, (req, res) => {
    res.json({ user: req.authUser });
  });

  return router;
}
