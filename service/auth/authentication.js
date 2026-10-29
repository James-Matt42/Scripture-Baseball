import { toPublicUser } from './registration.js';
import { normalizeEmail, RegistrationError } from './validation.js';
import { readSessionCookie } from './sessionCookies.js';

export class InvalidCredentialsError extends RegistrationError {
  constructor() {
    // Do not disclose whether an email address exists in the account store.
    super('Invalid email or password', 401);
    this.name = 'InvalidCredentialsError';
  }
}

export function validateLogin(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new RegistrationError('Login requires a JSON object');
  }
  const email = normalizeEmail(input.email);
  if (typeof input.password !== 'string' || !input.password ||
      Buffer.byteLength(input.password, 'utf8') > 72) {
    throw new RegistrationError('Email and password are required (maximum 72 password bytes)');
  }
  return { email, password: input.password };
}

export async function authenticateUser(input, { store, verifyPassword }) {
  const { email, password } = validateLogin(input);
  const user = store.findByEmail(email);
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    throw new InvalidCredentialsError();
  }
  return toPublicUser(user);
}

/** Shared guard for auth and future progress endpoints. */
export function createSessionAuth({ userStore, sessionStore }) {
  function currentUser(req) {
    const token = readSessionCookie(req.headers.cookie);
    const session = sessionStore.lookup(token);
    if (!session) return null;
    const user = userStore.findById(session.userId);
    if (!user) {
      sessionStore.revoke(token);
      return null;
    }
    return toPublicUser(user);
  }

  function requireUser(req, res, next) {
    const user = currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    req.authUser = user;
    next();
  }

  return { currentUser, requireUser };
}
