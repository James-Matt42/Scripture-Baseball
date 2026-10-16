import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceRoomRoundInState,
  claimGuestRoomSeatInState,
  createInitialRoomState,
  createRoomInState,
  getRoomByCode,
  getRoomRoundQuestion,
  getRoomRoundResponses,
  joinRoomInState,
  loadRoomState,
  saveRoomState,
  setRoomPlayerReadyInState,
  startRoomMatchInState,
  submitRoomAnswerInState,
} from "./roomState.js";

const code = "ABC234";
const host = `guest-host-${code}`;
const guest = "guest-player-ABC2345678";
const another = "account-3";
const stamp = "2026-10-21T19:00:00.000Z";
const draft = {
  challengeId: "book-of-mormon", format: "live", difficulty: "standard",
  length: 5, maxPlayers: 4, exactVerse: false,
  hostName: "Host", name: "Game night",
};

const storage = () => {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

function lobby(settings = {}) {
  return createRoomInState(createInitialRoomState(), { ...draft, ...settings }, {
    generateCode: () => code, createdAt: stamp,
  }).state;
}

function withGuest(state = lobby()) {
  return joinRoomInState(state, code, { playerId: guest, displayName: "Taylor", joinedAt: stamp }).state;
}

function ready(state) {
  return setRoomPlayerReadyInState(state, code, guest, true).state;
}

function started(state = lobby()) {
  const result = startRoomMatchInState(state, code, host, { startedAt: stamp });
  assert.equal(result.error, null);
  return result.state;
}

function answerFor(room, overrides = {}) {
  const question = getRoomRoundQuestion(room);
  return { questionId: question.id, bookId: question.bookId, chapter: question.chapter,
    ...(room.settings.exactVerse ? { verse: question.verse } : {}), ...overrides };
}

function answer(state, player = host, overrides = {}) {
  return submitRoomAnswerInState(state, code, player, answerFor(getRoomByCode(state, code), overrides), {
    answeredAt: stamp,
  });
}

test("host begins ready; a guest can toggle readiness only in the lobby", () => {
  const state = withGuest();
  assert.equal(getRoomByCode(state, code).players[0].ready, true);
  assert.equal(getRoomByCode(state, code).players[1].ready, false);
  assert.match(setRoomPlayerReadyInState(state, code, "account-99", true).error, /join/i);
  assert.match(setRoomPlayerReadyInState(state, code, guest, "yes").error, /ready/i);
  const current = ready(state);
  assert.equal(getRoomByCode(current, code).players[1].ready, true);
  const repeated = setRoomPlayerReadyInState(current, code, guest, true);
  assert.equal(repeated.state, current);
  const unreadied = setRoomPlayerReadyInState(current, code, guest, false).state;
  assert.equal(getRoomByCode(unreadied, code).players[1].ready, false);
});

test("only host starts a ready lobby; no accidental restarts", () => {
  const state = withGuest();
  assert.match(startRoomMatchInState(state, code, guest).error, /host/i);
  assert.match(startRoomMatchInState(state, code, host).error, /ready/i);
  const live = started(ready(state));
  const match = getRoomByCode(live, code);
  assert.equal(match.status, "active");
  assert.equal(match.match.roundIndex, 0);
  assert.equal(match.match.startedAt, stamp);
  assert.deepEqual(match.match.responses, []);
  assert.match(startRoomMatchInState(live, code, host).error, /already/i);
  assert.match(setRoomPlayerReadyInState(live, code, guest, false).error, /starts/i);
  assert.match(joinRoomInState(live, code, { playerId: another, displayName: "Sam" }).error, /no longer/i);
});

test("a host can run a local practice lobby with no additional members", () => {
  const live = started();
  assert.equal(getRoomByCode(live, code).players.length, 1);
  assert.ok(getRoomRoundQuestion(getRoomByCode(live, code)));
});

test("one submission per participant per round, graded on the saved question", () => {
  const live = started(ready(withGuest()));
  const question = getRoomRoundQuestion(getRoomByCode(live, code));
  const submitted = answer(live, host);
  assert.equal(submitted.error, null);
  assert.equal(submitted.room.match.responses.length, 1);
  assert.deepEqual(submitted.room.match.responses[0].attempt, {
    questionId: question.id, bookId: question.bookId, chapter: question.chapter,
    bookCorrect: true, chapterCorrect: true,
  });
  assert.match(answer(submitted.state, host).error, /already/i);
  assert.equal(answer(submitted.state, guest, { chapter: 12 }).room.match.responses[1].attempt.chapterCorrect, false);
  assert.equal(getRoomRoundResponses(submitted.room).length, 1);
  assert.equal(getRoomRoundResponses(submitted.room, 3).length, 0);
});

test("invalid attempts, phases, and nonmembers cannot edit answers", () => {
  const fresh = lobby();
  assert.match(submitRoomAnswerInState(fresh, code, host, {}).error, /not active/i);
  const active = started();
  const question = getRoomRoundQuestion(getRoomByCode(active, code));
  for (const invalid of [
    { questionId: "wrong-question", bookId: question.bookId, chapter: 1 },
    { questionId: question.id, bookId: "not-in-choices", chapter: 1 },
    { questionId: question.id, bookId: question.bookId, chapter: 0 },
    { questionId: question.id, bookId: question.bookId, chapter: 1.5 },
    { questionId: question.id, bookId: question.bookId, chapter: "2" },
  ]) {
    const result = submitRoomAnswerInState(active, code, host, invalid);
    assert.ok(result.error);
    assert.equal(result.state, active);
  }
  assert.match(submitRoomAnswerInState(active, code, another, answerFor(getRoomByCode(active, code))).error, /join/i);
});

test("exact verse is separately graded and required when enabled", () => {
  const active = started(lobby({ exactVerse: true }));
  const current = getRoomByCode(active, code);
  assert.match(submitRoomAnswerInState(active, code, host, answerFor(current, { verse: undefined })).error, /valid/i);
  const answered = answer(active, host, { verse: getRoomRoundQuestion(current).verse + 1 });
  assert.equal(answered.error, null);
  assert.equal(answered.room.match.responses[0].attempt.verseCorrect, false);
  assert.equal(answered.room.match.responses[0].attempt.bookCorrect, true);
});

test("host advances after everyone replies, then the next scripture appears", () => {
  let state = started(ready(withGuest()));
  const first = getRoomRoundQuestion(getRoomByCode(state, code)).id;
  state = answer(state).state;
  assert.match(advanceRoomRoundInState(state, code, host).error, /wait/i);
  assert.match(advanceRoomRoundInState(state, code, guest).error, /host/i);
  state = answer(state, guest).state;
  const advanced = advanceRoomRoundInState(state, code, host);
  assert.equal(advanced.error, null);
  assert.equal(advanced.room.match.roundIndex, 1);
  assert.equal(advanced.room.match.responses.length, 2);
  assert.notEqual(getRoomRoundQuestion(advanced.room).id, first);
  assert.equal(getRoomRoundResponses(advanced.room).length, 0);
});

test("the host may explicitly skip missing answers, but must answer first", () => {
  const active = started(ready(withGuest()));
  assert.match(advanceRoomRoundInState(active, code, host, { skipMissing: true }).error, /answer/i);
  const hostAnswered = answer(active).state;
  const skipped = advanceRoomRoundInState(hostAnswered, code, host, { skipMissing: true });
  assert.equal(skipped.room.match.roundIndex, 1);
  assert.equal(skipped.room.match.responses.length, 1);
  assert.match(submitRoomAnswerInState(skipped.state, code, guest, {
    questionId: getRoomByCode(active, code).questionIds[0], bookId: "2-nephi", chapter: 2,
  }).error, /different pitch/i);
});

test("finishing final pitch locks the match and preserves the full round history", () => {
  let state = started();
  for (let index = 0; index < 5; index += 1) {
    state = answer(state).state;
    const result = advanceRoomRoundInState(state, code, host, { advancedAt: stamp });
    assert.equal(result.error, null);
    state = result.state;
  }
  const completed = getRoomByCode(state, code);
  assert.equal(completed.status, "complete");
  assert.equal(completed.match.roundIndex, 5);
  assert.equal(completed.match.completedAt, stamp);
  assert.equal(completed.match.responses.length, 5);
  assert.equal(getRoomRoundQuestion(completed), null);
  assert.match(submitRoomAnswerInState(state, code, host, { questionId: "anything" }).error, /not active/i);
  assert.match(advanceRoomRoundInState(state, code, host).error, /no active/i);
  assert.match(startRoomMatchInState(state, code, host).error, /already/i);
});

test("active and completed rounds survive browser-storage normalization and reload", () => {
  let state = started(ready(withGuest()));
  state = answer(state, host).state;
  const store = storage();
  assert.equal(saveRoomState(store, state), true);
  assert.deepEqual(loadRoomState(store), state);
  state = answer(state, guest).state;
  state = advanceRoomRoundInState(state, code, host).state;
  assert.equal(saveRoomState(store, state), true);
  const restored = loadRoomState(store);
  assert.equal(getRoomByCode(restored, code).match.roundIndex, 1);
  assert.equal(getRoomByCode(restored, code).match.responses.length, 2);
});

test("saved scores are recomputed and invalid or duplicate responses removed", () => {
  let state = started();
  state = answer(state).state;
  const room = getRoomByCode(state, code);
  const response = room.match.responses[0];
  const altered = {
    ...room, match: { ...room.match, responses: [
      { ...response, attempt: { ...response.attempt, bookCorrect: false, chapterCorrect: false } },
      response,
      { ...response, playerId: "intruder" },
    ] },
  };
  const store = storage();
  store.setItem("scripture-baseball.rooms.v1", JSON.stringify({ version: 1, rooms: [altered] }));
  const normalized = getRoomByCode(loadRoomState(store), code);
  assert.equal(normalized.match.responses.length, 1);
  assert.equal(normalized.match.responses[0].attempt.bookCorrect, true);
  assert.equal(normalized.match.responses[0].attempt.chapterCorrect, true);
});

test("invalid saved lifecycle falls back to a lobby rather than a broken active room", () => {
  const room = getRoomByCode(lobby(), code);
  const store = storage();
  store.setItem("scripture-baseball.rooms.v1", JSON.stringify({ version: 1, rooms: [{ ...room, status: "active", match: { roundIndex: 99 } }] }));
  const normalized = getRoomByCode(loadRoomState(store), code);
  assert.equal(normalized.status, "lobby");
  assert.equal(normalized.match, undefined);
});

test("claiming a guest or host seat during a match transfers saved responses", () => {
  let state = started(ready(withGuest()));
  state = answer(state).state;
  state = answer(state, guest).state;
  const upgradedGuest = claimGuestRoomSeatInState(state, code, guest, {
    playerId: "account-8", displayName: "Taylor",
  });
  assert.equal(upgradedGuest.error, null);
  assert.equal(upgradedGuest.room.match.responses[1].playerId, "account-8");
  const upgradedHost = claimGuestRoomSeatInState(upgradedGuest.state, code, host, {
    playerId: another, displayName: "New Host",
  });
  assert.equal(upgradedHost.room.hostId, another);
  assert.equal(upgradedHost.room.match.responses[0].playerId, another);
  assert.equal(advanceRoomRoundInState(upgradedHost.state, code, another).error, null);
  const store = storage();
  saveRoomState(store, upgradedHost.state);
  assert.deepEqual(loadRoomState(store), upgradedHost.state);
});
