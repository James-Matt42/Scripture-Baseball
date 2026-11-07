import { randomUUID } from 'node:crypto';
import { DuplicateEmailError, normalizeEmail } from './validation.js';

const PUBLIC_AND_AUTH_FIELDS = {
  _id: 0,
  id: 1,
  displayName: 1,
  email: 1,
  passwordHash: 1,
  createdAt: 1,
};

/**
 * MongoDB-backed implementation of the userStore contract.
 *
 * The unique `users.email` index is created by the DB-01 bootstrap, before the
 * HTTP server listens. A pre-registration lookup is only an optimization:
 * insertOne + the database index are the concurrency-safe uniqueness guard.
 * UUIDs are also stored as Mongo _id values for indexed identity lookups.
 */
export function createMongoUserStore(database) {
  const users = database.collection('users');

  return {
    async findByEmail(email) {
      const record = await users.findOne(
        { email: normalizeEmail(email) },
        { projection: PUBLIC_AND_AUTH_FIELDS },
      );
      return record ? { ...record } : null;
    },

    async findById(id) {
      const record = await users.findOne(
        { _id: id },
        { projection: PUBLIC_AND_AUTH_FIELDS },
      );
      return record ? { ...record } : null;
    },

    async create({ displayName, email, passwordHash }) {
      const record = {
        id: randomUUID(),
        displayName,
        email: normalizeEmail(email),
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      try {
        await users.insertOne({ _id: record.id, ...record });
      } catch (error) {
        // Only the duplicate-email index produces a user-facing 409. Other
        // database failures reach the generic JSON 500 error handler.
        if (error?.code === 11000 && (
          error.keyPattern?.email === 1 ||
          Object.hasOwn(error.keyValue ?? {}, 'email') ||
          error.message?.includes('users_email_unique')
        )) {
          throw new DuplicateEmailError();
        }
        throw error;
      }
      return { ...record };
    },
  };
}
