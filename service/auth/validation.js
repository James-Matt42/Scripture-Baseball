export class RegistrationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'RegistrationError';
    this.status = status;
  }
}

export class DuplicateEmailError extends RegistrationError {
  constructor() {
    super('An account with this email already exists', 409);
    this.name = 'DuplicateEmailError';
  }
}

// Registration and login must agree on canonical email identifiers.
export function normalizeEmail(value) {
  if (typeof value !== 'string') {
    throw new RegistrationError('Email is required');
  }
  const email = value.trim().toLowerCase();
  if (Buffer.byteLength(email, 'utf8') > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new RegistrationError('Enter a valid email address');
  }
  return email;
}

// Keep validation separate from the web framework so it can be tested without Express.
export function validateRegistration(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new RegistrationError('Registration requires a JSON object');
  }

  if (typeof input.displayName !== 'string') {
    throw new RegistrationError('Display name is required');
  }
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 40 || /[\u0000-\u001f\u007f]/u.test(displayName)) {
    throw new RegistrationError('Display name must be 1–40 characters without control characters');
  }

  const email = normalizeEmail(input.email);

  if (typeof input.password !== 'string' || input.password.length < 8 ||
      !input.password.trim() || Buffer.byteLength(input.password, 'utf8') > 72) {
    throw new RegistrationError('Password must have at least 8 characters and at most 72 UTF-8 bytes');
  }

  // Preserve password bytes exactly, including intentional leading/trailing
  // whitespace. BCrypt silently truncates inputs beyond 72 bytes.
  return { displayName, email, password: input.password };
}
