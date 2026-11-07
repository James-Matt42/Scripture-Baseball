import { DuplicateEmailError, validateRegistration } from './validation.js';

export function toPublicUser(user) {
  // Whitelist response fields: never serialize passwords, hashes, or future
  // internal credentials as part of a user object returned by the API.
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    createdAt: user.createdAt,
  };
}

export async function registerUser(input, { store, hashPassword }) {
  const { displayName, email, password } = validateRegistration(input);

  // Skip expensive hashing if the account already exists. The store's own
  // atomic uniqueness check still protects against concurrent registration.
  if (await store.findByEmail(email)) throw new DuplicateEmailError();

  const passwordHash = await hashPassword(password);
  const saved = await store.create({ displayName, email, passwordHash });
  return toPublicUser(saved);
}
