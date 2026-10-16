import test from "node:test";
import assert from "node:assert/strict";
import {
  ROOM_GUEST_STORAGE_KEY,
  claimGuestRoomSeatInState,
  createInitialRoomGuestState,
  createInitialRoomState,
  createRoomInState,
  forgetRoomGuest,
  generateGuestPlayerId,
  getInvitationPath,
  isValidRoomCode,
  joinRoomInState,
  loadRoomGuestState,
  loadRoomState,
  parseRoomInvitation,
  normalizeRoomGuestState,
  rememberRoomGuest,
  saveRoomGuestState,
  saveRoomState,
} from "./roomState.js";

const draft = {
  challengeId: "book-of-mormon",
  format: "live",
  difficulty: "standard",
  length: 5,
  maxPlayers: 2,
  exactVerse: false,
  name: "Study night",
  hostName: "Host",
};
const at = "2026-10-21T19:00:00.000Z";
const guestId = "guest-player-ABC2345678";
const secondGuest = "guest-player-ZYX9876543";

function makeRoom(options = {}) {
  return createRoomInState(createInitialRoomState(), { ...draft, ...options }, {
    generateCode: () => "ABC234", createdAt: at,
  }).state;
}

function memoryStorage() {
  const records = new Map();
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
  };
}

test("room code lookup accepts case and surrounding whitespace but rejects invalid codes", () => {
  assert.equal(isValidRoomCode("abc234"), true);
  assert.equal(isValidRoomCode(" ABC234 "), true);
  assert.equal(isValidRoomCode("NEPHI7"), false); // Letter I is intentionally omitted.
  assert.equal(isValidRoomCode(""), false);
  assert.equal(isValidRoomCode("ABC2345"), false);
  assert.equal(getInvitationPath(" abc234 "), "/join-game?code=ABC234");
});

test("guests join a real room and membership persists in room storage", () => {
  const state = makeRoom();
  const result = joinRoomInState(state, " abc234 ", {
    playerId: guestId, displayName: "  Taylor  ", joinedAt: at,
  });
  assert.equal(result.error, null);
  assert.equal(result.room.players.length, 2);
  assert.deepEqual(result.player, {
    id: guestId, displayName: "Taylor", role: "player", ready: false, joinedAt: at,
  });
  const storage = memoryStorage();
  assert.equal(saveRoomState(storage, result.state), true);
  assert.deepEqual(loadRoomState(storage), result.state);
});

test("opening the same room again does not consume another seat or change the name", () => {
  const initial = makeRoom();
  const first = joinRoomInState(initial, "ABC234", { playerId: guestId, displayName: "Taylor" });
  const again = joinRoomInState(first.state, "abc234", { playerId: guestId, displayName: "Another name" });
  assert.equal(again.error, null);
  assert.equal(again.state, first.state);
  assert.equal(again.room.players.length, 2);
  assert.equal(again.player.displayName, "Taylor");
});

test("invalid room, player ID and names are rejected without modifying the room", () => {
  const initial = makeRoom();
  for (const [code, data, message] of [
    ["NOT123", { playerId: guestId, displayName: "Taylor" }, /not found/i],
    ["ABC234", { playerId: "someone", displayName: "Taylor" }, /identity/i],
    ["ABC234", { playerId: guestId, displayName: " " }, /display name/i],
    ["ABC234", { playerId: guestId, displayName: "a".repeat(41) }, /display name/i],
    ["ABC234", { playerId: guestId, displayName: "host" }, /already taken/i],
  ]) {
    const result = joinRoomInState(initial, code, data);
    assert.match(result.error, message);
    assert.equal(result.state, initial);
  }
});

test("room capacity and started games prevent new members but not existing members", () => {
  const initial = makeRoom();
  const joined = joinRoomInState(initial, "ABC234", { playerId: guestId, displayName: "Taylor" });
  assert.match(joinRoomInState(joined.state, "ABC234", {
    playerId: secondGuest, displayName: "Morgan",
  }).error, /full/i);
  assert.equal(joinRoomInState(joined.state, "ABC234", {
    playerId: guestId, displayName: "Taylor",
  }).error, null);
  const active = { ...initial, rooms: [{ ...initial.rooms[0], status: "active" }] };
  assert.match(joinRoomInState(active, "ABC234", {
    playerId: guestId, displayName: "Taylor",
  }).error, /no longer accepting/i);
});

test("signed-in local profiles get a stable account ID and cannot duplicate names", () => {
  const first = joinRoomInState(makeRoom(), "ABC234", { playerId: "account-4", displayName: "Taylor" });
  assert.equal(first.player.id, "account-4");
  assert.match(joinRoomInState(first.state, "ABC234", {
    playerId: "account-5", displayName: "Taylor",
  }).error, /full/i); // capacity takes priority
  const bigger = makeRoom({ maxPlayers: 4 });
  const one = joinRoomInState(bigger, "ABC234", { playerId: "account-4", displayName: "Taylor" });
  assert.match(joinRoomInState(one.state, "ABC234", {
    playerId: "account-5", displayName: "taylor",
  }).error, /already taken/i);
});

test("a guest seat can be claimed by an account even when a room is full", () => {
  const initial = joinRoomInState(makeRoom(), "ABC234", {
    playerId: guestId, displayName: "Taylor", joinedAt: at,
  });
  const upgraded = claimGuestRoomSeatInState(initial.state, "ABC234", guestId, {
    playerId: "account-3", displayName: "Taylor Smith",
  });
  assert.equal(upgraded.error, null);
  assert.equal(upgraded.room.players.length, 2);
  assert.equal(upgraded.player.id, "account-3");
  assert.equal(upgraded.player.joinedAt, at);
  assert.equal(upgraded.player.ready, false);
  assert.ok(!upgraded.room.players.some((player) => player.id === guestId));
  assert.deepEqual(loadRoomState((() => {
    const storage = memoryStorage();
    saveRoomState(storage, upgraded.state);
    return storage;
  })()), upgraded.state);
});

test("guest-hosts who create a profile keep their host role and invitation", () => {
  const initial = makeRoom();
  const upgraded = claimGuestRoomSeatInState(initial, "ABC234", "guest-host-ABC234", {
    playerId: "account-12", displayName: "New Host",
  });
  assert.equal(upgraded.error, null);
  assert.equal(upgraded.room.players.length, 1);
  assert.equal(upgraded.room.hostId, "account-12");
  assert.equal(upgraded.room.hostName, "New Host");
  assert.equal(upgraded.player.role, "host");
  assert.equal(upgraded.player.ready, true);
  assert.equal(getInvitationPath(upgraded.room.code), "/join-game?code=ABC234");
});

test("claiming a guest seat rejects invalid account, missing guest, and conflicting name", () => {
  const initial = joinRoomInState(makeRoom({ maxPlayers: 4 }), "ABC234", {
    playerId: guestId, displayName: "Taylor",
  });
  const withAccount = joinRoomInState(initial.state, "ABC234", {
    playerId: "account-2", displayName: "Morgan",
  });
  for (const [guest, data, message] of [
    [guestId, { playerId: "not-account", displayName: "Taylor" }, /sign in/i],
    [secondGuest, { playerId: "account-3", displayName: "Taylor" }, /not found/i],
    [guestId, { playerId: "account-3", displayName: "morgan" }, /already taken/i],
  ]) {
    const result = claimGuestRoomSeatInState(withAccount.state, "ABC234", guest, data);
    assert.match(result.error, message);
    assert.equal(result.state, withAccount.state);
  }
  const existing = claimGuestRoomSeatInState(withAccount.state, "ABC234", guestId, {
    playerId: "account-2", displayName: "Morgan",
  });
  assert.equal(existing.error, null);
  assert.equal(existing.state, withAccount.state);
});

test("guest identity is remembered independently from the room and survives refresh", () => {
  const storage = memoryStorage();
  let guests = rememberRoomGuest(createInitialRoomGuestState(), "abc234", guestId);
  assert.equal(guests.byRoom.ABC234, guestId);
  assert.equal(saveRoomGuestState(storage, guests), true);
  assert.ok(storage.getItem(ROOM_GUEST_STORAGE_KEY));
  assert.deepEqual(loadRoomGuestState(storage), guests);
  guests = forgetRoomGuest(guests, " ABC234 ");
  assert.deepEqual(guests.byRoom, {});
});

test("invalid or compromised guest identity storage falls back safely", () => {
  const storage = memoryStorage();
  assert.deepEqual(loadRoomGuestState(storage), createInitialRoomGuestState());
  storage.setItem(ROOM_GUEST_STORAGE_KEY, "oops");
  assert.deepEqual(loadRoomGuestState(storage), createInitialRoomGuestState());
  assert.deepEqual(normalizeRoomGuestState({ version: 2, byRoom: {} }), createInitialRoomGuestState());
  assert.deepEqual(normalizeRoomGuestState({
    version: 1, byRoom: {
      ABC234: "account-1",
      XYZ567: "guest-player-ZYX9876543",
      INVALID: "guest-player-ABC2345678",
      AAA222: "guest-host-XYZ567",
    },
  }).byRoom, { XYZ567: "guest-player-ZYX9876543" });
  assert.equal(saveRoomGuestState(null, createInitialRoomGuestState()), false);
  assert.deepEqual(loadRoomGuestState({ getItem: () => { throw new Error("denied"); } }), createInitialRoomGuestState());
});

test("new guest member IDs have safe and consistent structure", () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(generateGuestPlayerId(), /^guest-player-[A-HJ-NP-Z2-9]{10}$/);
  }
});

test("Find Game accepts pasted and opened invitations without following arbitrary URLs", () => {
  assert.equal(parseRoomInvitation(" abc234 "), "ABC234");
  assert.equal(parseRoomInvitation("/join-game?code=abc234"), "ABC234");
  assert.equal(parseRoomInvitation("https://startup.example/join-game?code=ABC234"), "ABC234");
  assert.equal(parseRoomInvitation("https://startup.example/join-game?code=O00000"), "");
  assert.equal(parseRoomInvitation("https://startup.example/unrelated?code=ABC234"), "");
  assert.equal(parseRoomInvitation("javascript:alert(1)"), "");
  assert.equal(parseRoomInvitation(""), "");
  assert.equal(parseRoomInvitation("x".repeat(3000)), "");
});
