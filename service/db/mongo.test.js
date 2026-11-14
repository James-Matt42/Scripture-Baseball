import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp, startServer } from '../index.js';
import {
  createMongoConnection,
  ensureMongoIndexes,
  mongoConfigFromEnv,
  MONGO_INDEXES,
} from './mongo.js';

function fakeMongo({ failure = null } = {}) {
  const calls = [];
  const database = {
    async command(command) {
      calls.push(['command', command]);
      if (failure === 'ping') throw new Error('private-host: secret password');
      return { ok: 1 };
    },
    collection(name) {
      return {
        async createIndex(keys, options) {
          calls.push(['index', name, keys, options]);
          if (failure === 'index') throw new Error('private-host: secret password');
          return options.name;
        },
      };
    },
  };
  const client = {
    async connect() {
      calls.push(['connect']);
      if (failure === 'connect') throw new Error('private-host: secret password');
    },
    db(name) {
      calls.push(['db', name]);
      return database;
    },
    async close() {
      calls.push(['close']);
    },
  };
  return { calls, client, database };
}

test('MongoDB configuration only comes from environment values', () => {
  assert.deepEqual(mongoConfigFromEnv({}), {
    uri: '', databaseName: 'scripture_baseball', required: false,
  });
  assert.deepEqual(mongoConfigFromEnv({ NODE_ENV: 'production' }), {
    uri: '', databaseName: 'scripture_baseball', required: true,
  });
  assert.deepEqual(mongoConfigFromEnv({ NODE_ENV: 'production', MONGODB_REQUIRED: 'false' }), {
    uri: '', databaseName: 'scripture_baseball', required: false,
  });
  assert.deepEqual(mongoConfigFromEnv({
    MONGODB_URI: 'mongodb+srv://user:private@example.invalid/',
    MONGODB_DB_NAME: 'scripture_baseball_test',
    MONGODB_REQUIRED: 'true',
  }), {
    uri: 'mongodb+srv://user:private@example.invalid/',
    databaseName: 'scripture_baseball_test',
    required: true,
  });
  assert.throws(() => mongoConfigFromEnv({ MONGODB_REQUIRED: 'yes' }), /MONGODB_REQUIRED/);
});

test('without MongoDB settings, the Service-phase server can start normally', async () => {
  const mongo = createMongoConnection();
  assert.equal(await mongo.connect(), null);
  assert.throws(() => mongo.getDb(), /not ready/);
  await mongo.close();
  await assert.rejects(createMongoConnection({ required: true }).connect(), /configure MONGODB_URI/);
});

test('bad configuration fails without exposing the connection string', async () => {
  assert.throws(() => createMongoConnection({ databaseName: 'unsafe/db' }), /MONGODB_DB_NAME/);
  assert.throws(() => createMongoConnection({ serverSelectionTimeoutMS: 0 }), /timeout/);
  const mongo = createMongoConnection({ uri: 'https://user:secret@example.invalid' });
  await assert.rejects(mongo.connect(), (error) =>
    error.message.includes('MONGODB_URI') && !error.message.includes('secret'));
});

test('a configured MongoDB connection pings and creates the required indexes', async () => {
  const fake = fakeMongo();
  const mongo = createMongoConnection({
    uri: 'mongodb://user:secret@localhost:27017',
    databaseName: 'test_baseball',
    clientFactory: async (_uri, options) => {
      assert.deepEqual(options, { serverSelectionTimeoutMS: 5000 });
      return fake.client;
    },
  });

  assert.equal(await mongo.connect(), fake.database);
  assert.equal(mongo.getDb(), fake.database);
  assert.equal(await mongo.connect(), fake.database);
  assert.deepEqual(fake.calls.slice(0, 3), [
    ['connect'], ['db', 'test_baseball'], ['command', { ping: 1 }],
  ]);
  const indexes = fake.calls.filter(([type]) => type === 'index');
  assert.equal(indexes.length, MONGO_INDEXES.length);
  assert.deepEqual(indexes, MONGO_INDEXES.map(({ collection, keys, options }) =>
    ['index', collection, keys, options]));
  assert.deepEqual(indexes.find((entry) => entry[3].name === 'sessions_expiry_ttl')[3], {
    name: 'sessions_expiry_ttl', expireAfterSeconds: 0,
  });
  await mongo.close();
  assert.deepEqual(fake.calls.at(-1), ['close']);
  assert.throws(() => mongo.getDb(), /not ready/);
});

test('simultaneous connects share one client and one index pass', async () => {
  const fake = fakeMongo();
  const mongo = createMongoConnection({
    uri: 'mongodb://localhost:27017',
    clientFactory: async () => fake.client,
  });
  const [first, second] = await Promise.all([mongo.connect(), mongo.connect()]);
  assert.equal(first, second);
  assert.equal(fake.calls.filter(([type]) => type === 'connect').length, 1);
  assert.equal(fake.calls.filter(([type]) => type === 'index').length, MONGO_INDEXES.length);
  await mongo.close();
});

for (const failure of ['connect', 'ping', 'index']) {
  test(`MongoDB ${failure} failure closes the client and doesn't leak credentials`, async () => {
    const fake = fakeMongo({ failure });
    const mongo = createMongoConnection({
      uri: 'mongodb+srv://user:secret@example.invalid/',
      clientFactory: async () => fake.client,
    });
    await assert.rejects(mongo.connect(), (error) =>
      error.message === 'MongoDB connection or index initialization failed');
    assert.deepEqual(fake.calls.at(-1), ['close']);
    assert.throws(() => mongo.getDb(), /not ready/);
  });
}

test('index setup is exported for future MongoDB stores and migration tools', async () => {
  const fake = fakeMongo();
  await ensureMongoIndexes(fake.database);
  assert.equal(fake.calls.length, MONGO_INDEXES.length);
});

test('HTTP service waits for database validation before listening', async (t) => {
  let databaseReady = false;
  const mongo = {
    async connect() { databaseReady = true; },
    async close() { databaseReady = false; },
  };
  const application = createApp();
  const originalListen = application.listen.bind(application);
  application.listen = (...args) => {
    assert.equal(databaseReady, true);
    return originalListen(...args);
  };
  const { server } = await startServer({ port: 0, application, mongo });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongo.close();
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('failed MongoDB initialization prevents HTTP from listening', async () => {
  let listened = false;
  const application = { listen() { listened = true; } };
  const mongo = { async connect() { throw new Error('Database unavailable'); } };
  await assert.rejects(startServer({ port: 0, application, mongo }), /Database unavailable/);
  assert.equal(listened, false);
});

test('HTTP bind failures close an already connected MongoDB client', async (t) => {
  const occupant = createApp().listen(0);
  await once(occupant, 'listening');
  t.after(() => new Promise((resolve) => occupant.close(resolve)));
  const events = [];
  const mongo = {
    async connect() { events.push('connect'); },
    async close() { events.push('close'); },
  };
  await assert.rejects(startServer({ port: occupant.address().port, application: createApp(), mongo }), {
    code: 'EADDRINUSE',
  });
  assert.deepEqual(events, ['connect', 'close']);
});
