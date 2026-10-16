import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOM_CHALLENGES,
  ROOM_STORAGE_KEY,
  buildRoomPitchQueue,
  createInitialRoomState,
  createRoomInState,
  generateRoomCode,
  getInvitationPath,
  getInvitationUrl,
  getRoomByCode,
  loadRoomState,
  normalizeRoomState,
  saveRoomState,
  validateRoomDraft,
} from "./roomState.js";
import { getChallengeQuestions } from "../challenges/catalog.js";

const draft = {
  challengeId: "book-of-mormon",
  format: "live",
  difficulty: "standard",
  length: 10,
  maxPlayers: 4,
  exactVerse: false,
  name: "Saturday Scripture Game",
  hostName: "Jordan",
};
const timestamp = "2026-10-21T18:30:00.000Z";

function makeRoom(state = createInitialRoomState(), extra = {}, options = {}) {
  return createRoomInState(state, { ...draft, ...extra }, {
    generateCode: () => "ABC234", createdAt: timestamp, ...options,
  });
}

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

test("available room challenges are real playable catalog entries, not personal placeholders", () => {
  assert.ok(ROOM_CHALLENGES.length > 4);
  assert.ok(!ROOM_CHALLENGES.some((challenge) => challenge.section === "personal"));
  for (const challenge of ROOM_CHALLENGES) {
    assert.ok(getChallengeQuestions(challenge.id).length, challenge.id);
  }
});

test("room form validates challenge, format, difficulty, length, capacity, verse and host", () => {
  const accepted = validateRoomDraft(draft);
  assert.equal(accepted.error, null);
  assert.equal(accepted.value.settings.length, 10);
  assert.equal(accepted.value.settings.maxPlayers, 4);
  assert.equal(accepted.value.hostName, "Jordan");

  for (const bad of [
    { challengeId: "fake-id" }, { challengeId: "my-misses" },
    { format: "unknown" }, { difficulty: "advanced" },
    { length: 3 }, { maxPlayers: 1 }, { maxPlayers: 20 },
    { exactVerse: "yes" }, { hostName: " " },
    { hostName: "x".repeat(41) }, { name: "x".repeat(61) },
  ]) {
    assert.ok(validateRoomDraft({ ...draft, ...bad }).error, JSON.stringify(bad));
  }
});

test("optional name gets a real challenge-based default", () => {
  const result = validateRoomDraft({ ...draft, name: "  " });
  assert.equal(result.value.name, "Book of Mormon Match");
  assert.equal(validateRoomDraft({ ...draft, name: "  Weekend Match  " }).value.name, "Weekend Match");
});

test("the requested pitch count is saved with a deterministic, repeatable order", () => {
  const first = getChallengeQuestions("isaiah").map((question) => question.id);
  const queue = buildRoomPitchQueue("isaiah", 20);
  assert.equal(queue.length, 20);
  assert.deepEqual(queue.slice(0, 6), [...first, ...first, ...first]);
  assert.deepEqual(buildRoomPitchQueue("isaiah", 20), queue);
  assert.deepEqual(buildRoomPitchQueue("unknown", 5), []);
  assert.deepEqual(buildRoomPitchQueue("isaiah", 4), []);
});

test("creating a guest-hosted room saves the form choices, code and host lobby entry", () => {
  const result = makeRoom(createInitialRoomState(), {
    format: "async", difficulty: "expert", exactVerse: true, length: 5, maxPlayers: 2,
  });
  assert.equal(result.error, null);
  assert.equal(result.room.code, "ABC234");
  assert.equal(result.room.name, "Saturday Scripture Game");
  assert.equal(result.room.hostId, "guest-host-ABC234");
  assert.equal(result.room.settings.format, "async");
  assert.equal(result.room.settings.difficulty, "expert");
  assert.equal(result.room.settings.exactVerse, true);
  assert.equal(result.room.settings.maxPlayers, 2);
  assert.equal(result.room.questionIds.length, 5);
  assert.equal(result.room.status, "lobby");
  assert.deepEqual(result.room.players, [{
    id: "guest-host-ABC234", displayName: "Jordan", role: "host", ready: true, joinedAt: timestamp,
  }]);
  assert.equal(result.state.rooms.length, 1);
});

test("signed-in profile hosts retain their account ID", () => {
  const result = makeRoom(createInitialRoomState(), {}, { hostProfileId: "account-3" });
  assert.equal(result.room.hostId, "account-3");
  assert.equal(result.room.players[0].id, "account-3");
});

test("a collision generates a different code instead of overwriting the first room", () => {
  const previous = makeRoom().state;
  const candidates = ["ABC234", "ABC234", "XYZ567"];
  const result = createRoomInState(previous, draft, {
    generateCode: () => candidates.shift(), createdAt: timestamp,
  });
  assert.equal(result.room.code, "XYZ567");
  assert.equal(result.state.rooms.length, 2);
  assert.equal(getRoomByCode(result.state, " abc234 ").name, draft.name);
  assert.equal(getRoomByCode(result.state, "xyz567").name, draft.name);
  assert.equal(getRoomByCode(result.state, "INVALID"), null);
});

test("invalid code generators and exhausted collisions produce errors without losing rooms", () => {
  const previous = makeRoom().state;
  const noCode = createRoomInState(previous, draft, { generateCode: () => "ABC234" });
  assert.ok(noCode.error);
  assert.equal(noCode.room, null);
  assert.equal(noCode.state, previous);
  const invalid = createRoomInState(previous, draft, { generateCode: () => "O00OOO" });
  assert.ok(invalid.error);
  assert.equal(invalid.state, previous);
  const badForm = createRoomInState(previous, { ...draft, hostName: "" });
  assert.ok(badForm.error);
  assert.equal(badForm.state, previous);
});

test("automatically generated codes use six readable allowed characters", () => {
  for (let n = 0; n < 100; n += 1) {
    assert.match(generateRoomCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  }
});

test("localStorage round-trip restores the room and settings, including a future lobby", () => {
  const storage = memoryStorage();
  const { state } = makeRoom();
  assert.equal(saveRoomState(storage, state), true);
  assert.ok(storage.getItem(ROOM_STORAGE_KEY));
  const recovered = loadRoomState(storage);
  assert.deepEqual(recovered, state);
  assert.equal(recovered.rooms[0].players.length, 1);
});

test("corrupted, missing, and incompatible room storage falls back safely", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadRoomState(storage), createInitialRoomState());
  storage.setItem(ROOM_STORAGE_KEY, "bad json");
  assert.deepEqual(loadRoomState(storage), createInitialRoomState());
  storage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ version: 25, rooms: [] }));
  assert.deepEqual(loadRoomState(storage), createInitialRoomState());
  storage.setItem(ROOM_STORAGE_KEY, JSON.stringify({ version: 1, rooms: [{ code: "BROKEN" }] }));
  assert.deepEqual(loadRoomState(storage), createInitialRoomState());
  assert.equal(saveRoomState(null, makeRoom().state), false);
  assert.equal(loadRoomState({ getItem: () => { throw new Error("blocked"); } }).rooms.length, 0);
});

test("deduplicates saved codes and safely restores only supported fields", () => {
  const first = makeRoom().room;
  const recovered = normalizeRoomState({ version: 1, rooms: [first, first, { ...first, code: "BAD?" }] });
  assert.equal(recovered.rooms.length, 1);
  assert.equal(recovered.rooms[0].code, "ABC234");
});

test("old mock rooms are capped so browser storage cannot grow endlessly", () => {
  let state = createInitialRoomState();
  for (let i = 0; i < 44; i += 1) {
    const validCode = `AB${["2", "3", "4", "5", "6", "7"][Math.floor(i / 8)]}${["2","3","4","5","6","7","8","9"][i % 8]}ZZ`;
    const result = createRoomInState(state, draft, { generateCode: () => validCode });
    assert.equal(result.error, null, validCode);
    state = result.state;
  }
  assert.equal(state.rooms.length, 40);
  assert.equal(state.rooms.at(-1).code.length, 6);
});

test("invite links contain only a validated code and a shareable join route", () => {
  assert.equal(getInvitationPath("abc234"), "/join-game?code=ABC234");
  assert.equal(getInvitationUrl("abc234", "https://scripture.example/"), "https://scripture.example/join-game?code=ABC234");
  assert.equal(getInvitationUrl("abc234"), "/join-game?code=ABC234");
  assert.equal(getInvitationUrl("../etc", "https://scripture.example"), "");
});
