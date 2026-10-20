import test from "node:test";
import assert from "node:assert/strict";
import {
  addSimulatedPlayerInState, advanceRoomRoundInState, claimGuestRoomSeatInState,
  createInitialRoomState, createRoomInState, createSimulatedAnswer,
  getCompletedRoomHistory, getRoomByCode, getRoomRoundQuestion, getRoomStandings,
  joinRoomInState, loadRoomState, removeSimulatedPlayerInState, saveRoomState,
  setRoomPlayerReadyInState, simulateRoomAnswerInState, startRoomMatchInState,
  submitRoomAnswerInState,
} from "./roomState.js";

const code = "ABC234";
const host = `guest-host-${code}`;
const guest = "guest-player-ABC2345678";
const now = "2026-10-21T12:00:00.000Z";
const later = "2026-10-21T12:12:00.000Z";
const draft = { challengeId: "book-of-mormon", format: "live", difficulty: "standard",
  length: 5, maxPlayers: 4, exactVerse: false, hostName: "Jordan", name: "Test Game" };

function lobby(overrides = {}) {
  return createRoomInState(createInitialRoomState(), { ...draft, ...overrides },
    { generateCode: () => code, createdAt: now }).state;
}
function room(state) { return getRoomByCode(state, code); }
function join(state, id = guest, name = "Casey") {
  return joinRoomInState(state, code, { playerId: id, displayName: name, joinedAt: now }).state;
}
function add(state, actor = host) { return addSimulatedPlayerInState(state, code, actor, { joinedAt: now }); }
function start(state) { return startRoomMatchInState(state, code, host, { startedAt: now }).state; }
function answer(state, id = host, overrides = {}) {
  const question = getRoomRoundQuestion(room(state));
  return submitRoomAnswerInState(state, code, id, {
    questionId: question.id, bookId: question.bookId, chapter: question.chapter,
    ...(room(state).settings.exactVerse ? { verse: question.verse } : {}), ...overrides,
  }, { answeredAt: now });
}
function next(state, skipMissing = true, advancedAt = later) {
  return advanceRoomRoundInState(state, code, host, { skipMissing, advancedAt });
}
function memoryStorage() {
  const data = new Map();
  return { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) ?? null };
}

test("only a lobby host can add simulated opponents; bot seats are ready and use room capacity", () => {
  let state = lobby({ maxPlayers: 2 });
  assert.match(add(state, guest).error, /host/i);
  assert.equal(add(state).error, null);
  state = add(state).state;
  assert.equal(room(state).players.length, 2);
  assert.equal(room(state).players[1].isBot, true);
  assert.equal(room(state).players[1].ready, true);
  assert.equal(room(state).players[1].displayName, "Miriam");
  assert.match(add(state).error, /full/i);
  assert.match(joinRoomInState(state, code, { playerId: guest, displayName: "Visitor" }).error, /full/i);
  assert.match(setRoomPlayerReadyInState(state, code, room(state).players[1].id, false).error, /simulated/i);
  assert.equal(room(start(state)).status, "active");
});

test("simulated players have unique IDs and names; a host can remove them before play", () => {
  let state = lobby({ maxPlayers: 4 });
  state = join(state, guest, "Miriam");
  state = add(state).state;
  state = add(state).state;
  const bots = room(state).players.filter((player) => player.isBot);
  assert.equal(bots.length, 2);
  assert.notEqual(bots[0].displayName.toLowerCase(), "miriam");
  assert.notEqual(bots[0].displayName, bots[1].displayName);
  assert.notEqual(bots[0].id, bots[1].id);
  assert.match(removeSimulatedPlayerInState(state, code, guest, bots[0].id).error, /host/i);
  assert.match(removeSimulatedPlayerInState(state, code, host, guest).error, /not found/i);
  const removed = removeSimulatedPlayerInState(state, code, host, bots[0].id);
  assert.equal(removed.error, null);
  assert.deepEqual(room(removed.state).players.filter((player) => player.isBot).map((p) => p.id), [bots[1].id]);
});

test("bot IDs cannot be used to join and bot answers cannot be manually submitted", () => {
  let state = add(lobby()).state;
  const botId = room(state).players[1].id;
  assert.match(joinRoomInState(lobby(), code, { playerId: botId, displayName: "Fake Bot" }).error, /identity/i);
  state = start(state);
  const candidate = createSimulatedAnswer(room(state), botId);
  assert.ok(candidate);
  assert.match(submitRoomAnswerInState(state, code, botId, candidate).error, /automatically/i);
  assert.match(simulateRoomAnswerInState(state, code, host).error, /not found/i);
});

test("bot guesses are deterministic for a saved round and supported by the question bank", () => {
  const state = start(add(lobby({ exactVerse: true, difficulty: "expert" })).state);
  const current = room(state);
  const botId = current.players[1].id;
  const first = createSimulatedAnswer(current, botId);
  const second = createSimulatedAnswer(current, botId);
  assert.deepEqual(first, second);
  assert.equal(first.questionId, current.questionIds[0]);
  assert.ok(getRoomRoundQuestion(current).choices.includes(first.bookId));
  assert.ok(Number.isSafeInteger(first.chapter) && first.chapter > 0);
  assert.ok(Number.isSafeInteger(first.verse) && first.verse > 0);
});

test("bot scores are graded once and can never be submitted a second time", () => {
  let state = start(add(lobby()).state);
  const botId = room(state).players[1].id;
  const first = simulateRoomAnswerInState(state, code, botId, { answeredAt: now });
  assert.equal(first.error, null);
  state = first.state;
  assert.equal(room(state).match.responses.length, 1);
  const attempted = room(state).match.responses[0].attempt;
  assert.equal(attempted.bookCorrect, attempted.bookId === getRoomRoundQuestion(room(state)).bookId);
  assert.equal(attempted.chapterCorrect, attempted.chapter === getRoomRoundQuestion(room(state)).chapter);
  const again = simulateRoomAnswerInState(state, code, botId);
  assert.equal(again.error, null);
  assert.strictEqual(again.state, state);
  assert.equal(room(again.state).match.responses.length, 1);
});

test("bot submissions follow round advancement and only one response is counted per pitch", () => {
  let state = start(add(lobby()).state);
  const botId = room(state).players[1].id;
  state = answer(state).state;
  state = simulateRoomAnswerInState(state, code, botId).state;
  const oldQuestion = room(state).questionIds[0];
  state = next(state, false).state;
  assert.notEqual(room(state).questionIds[1], oldQuestion);
  assert.equal(room(state).match.responses.length, 2);
  assert.equal(room(state).match.roundIndex, 1);
  assert.equal(room(state).match.responses.filter((resp) => resp.roundIndex === 1).length, 0);
  state = simulateRoomAnswerInState(state, code, botId).state;
  assert.equal(room(state).match.responses.length, 3);
  assert.equal(room(state).match.responses.at(-1).roundIndex, 1);
  assert.match(removeSimulatedPlayerInState(state, code, host, botId).error, /after/i);
});

test("multiple bots play full exact-verse games, and normalized storage regrades all results", () => {
  let state = lobby({ exactVerse: true });
  state = add(state).state;
  state = add(state).state;
  state = start(state);
  const botIds = room(state).players.slice(1).map((player) => player.id);
  for (let index = 0; index < 5; index += 1) {
    state = answer(state).state;
    for (const botId of botIds) state = simulateRoomAnswerInState(state, code, botId).state;
    state = next(state, false).state;
  }
  const finished = room(state);
  assert.equal(finished.status, "complete");
  assert.equal(finished.match.responses.length, 15);
  assert.deepEqual(getRoomStandings(finished).map((entry) => entry.answered), [5, 5, 5]);
  assert.equal(getRoomStandings(finished).find((entry) => entry.playerId === host).points, 15);
  assert.deepEqual(getRoomStandings(finished).map((entry) => entry.possiblePoints), [15, 15, 15]);
  const storage = memoryStorage();
  assert.equal(saveRoomState(storage, state), true);
  assert.deepEqual(loadRoomState(storage), state);
  const fake = structuredClone(state);
  fake.rooms[0].match.responses[0].attempt.bookCorrect = !fake.rooms[0].match.responses[0].attempt.bookCorrect;
  storage.setItem("scripture-baseball.rooms.v1", JSON.stringify(fake));
  assert.deepEqual(loadRoomState(storage), state);
});

test("live standings count independent book/chapter points and sort descending", () => {
  let state = start(setRoomPlayerReadyInState(join(lobby(), guest, "Taylor"), code, guest, true).state);
  state = answer(state, host, { chapter: 999 }).state;
  state = answer(state, guest).state;
  const standings = getRoomStandings(room(state));
  assert.deepEqual(standings.map((standing) => standing.playerId), [guest, host]);
  assert.deepEqual(standings.map((standing) => standing.points), [2, 1]);
  assert.deepEqual(standings.map((standing) => standing.rank), [1, 2]);
  assert.deepEqual(standings.map((standing) => standing.bookCorrect), [1, 1]);
  assert.deepEqual(standings.map((standing) => standing.chapterCorrect), [1, 0]);
});

test("equal scores share rank; skipped rounds are zero, not fabricated attempts", () => {
  let state = start(setRoomPlayerReadyInState(join(lobby()), code, guest, true).state);
  state = answer(state, host).state;
  state = answer(state, guest).state;
  let standings = getRoomStandings(room(state));
  assert.deepEqual(standings.map((entry) => entry.rank), [1, 1]);
  state = next(state, false).state;
  state = answer(state, host, { chapter: 999 }).state;
  state = next(state, true).state;
  standings = getRoomStandings(room(state));
  assert.deepEqual(standings.map((entry) => entry.points), [3, 2]);
  assert.deepEqual(standings.map((entry) => entry.answered), [2, 1]);
  assert.deepEqual(standings.map((entry) => entry.rank), [1, 2]);
  assert.equal(standings[1].possiblePoints, 10);
});

test("completion history includes the correct guest result and excludes other player and unfinished rooms", () => {
  let state = start(setRoomPlayerReadyInState(join(lobby()), code, guest, true).state);
  assert.deepEqual(getCompletedRoomHistory(state.rooms, host), []);
  for (let i = 0; i < 5; i += 1) {
    state = answer(state, host).state;
    if (i === 0) state = answer(state, guest).state;
    state = next(state, i > 0).state;
  }
  const history = getCompletedRoomHistory(state.rooms, null, { [code]: guest });
  assert.equal(history.length, 1);
  assert.equal(history[0].code, code);
  assert.equal(history[0].rank, 2);
  assert.equal(history[0].points, 2);
  assert.equal(history[0].answered, 1);
  assert.equal(history[0].pitches, 5);
  assert.deepEqual(getCompletedRoomHistory(state.rooms, "account-99"), []);
  assert.deepEqual(getCompletedRoomHistory(state.rooms, null, {}), []);
  assert.equal(getCompletedRoomHistory(state.rooms, host)[0].points, 10);
});

test("claiming a guest seat transfers completed scores into the new local profile", () => {
  let state = start(lobby());
  for (let i = 0; i < 5; i += 1) {
    state = answer(state).state;
    state = next(state).state;
  }
  const claimed = claimGuestRoomSeatInState(state, code, host, {
    playerId: "account-7", displayName: "Jordan",
  });
  assert.equal(claimed.error, null);
  assert.equal(getCompletedRoomHistory(claimed.state.rooms, "account-7")[0].points, 10);
  assert.deepEqual(getCompletedRoomHistory(claimed.state.rooms, host), []);
  const storage = memoryStorage();
  saveRoomState(storage, claimed.state);
  assert.deepEqual(getCompletedRoomHistory(loadRoomState(storage).rooms, "account-7"),
    getCompletedRoomHistory(claimed.state.rooms, "account-7"));
});

test("recovered active game still has bots and they can answer after refresh", () => {
  let state = start(add(lobby()).state);
  const storage = memoryStorage();
  saveRoomState(storage, state);
  state = loadRoomState(storage);
  assert.equal(room(state).players[1].isBot, true);
  const botId = room(state).players[1].id;
  state = simulateRoomAnswerInState(state, code, botId).state;
  assert.equal(room(state).match.responses.length, 1);
  assert.equal(room(state).match.responses[0].playerId, botId);
});

test("simulation rejects inactive rounds, unknown bots, and invalid timestamps without mutation", () => {
  const state = add(lobby()).state;
  const botId = room(state).players[1].id;
  assert.match(simulateRoomAnswerInState(state, code, botId).error, /not active/i);
  const playing = start(state);
  const result = simulateRoomAnswerInState(playing, code, botId, { answeredAt: "unparseable" });
  assert.match(result.error, /different pitch/i);
  assert.strictEqual(result.state, playing);
});
