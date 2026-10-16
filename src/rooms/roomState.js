import { CHALLENGES, getChallengeById, getChallengeQuestions } from "../challenges/catalog.js";

export const ROOM_STORAGE_KEY = "scripture-baseball.rooms.v1";
export const ROOM_GUEST_STORAGE_KEY = "scripture-baseball.room-guests.v1";
const VERSION = 1;
const MAX_SAVED_ROOMS = 40;
const CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const GUEST_PLAYER_PATTERN = /^guest-player-[A-HJ-NP-Z2-9]{10}$/;
const ACCOUNT_PLAYER_PATTERN = /^account-[1-9]\d*$/;

export const ROOM_FORMATS = ["live", "async"];
export const ROOM_DIFFICULTIES = ["beginner", "standard", "expert"];
export const ROOM_LENGTHS = [5, 10, 20];
export const ROOM_CAPACITIES = [2, 4, 8, 12];

export const ROOM_CHALLENGES = CHALLENGES.filter(
  (challenge) => challenge.section !== "personal" && getChallengeQuestions(challenge.id).length > 0,
);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function normalizeRoomCode(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isValidRoomCode(value) {
  return CODE_PATTERN.test(normalizeRoomCode(value));
}

export function createInitialRoomState() {
  return { version: VERSION, rooms: [] };
}

// Validating in one place keeps the UI and local storage from accepting
// nonexistent challenge IDs or unsupported combinations of room settings.
export function validateRoomDraft(input) {
  if (!isRecord(input)) return { error: "Enter your game settings." };
  const challenge = getChallengeById(input.challengeId);
  if (!challenge || challenge.section === "personal" || !getChallengeQuestions(challenge.id).length) {
    return { error: "Choose a challenge with available passages." };
  }
  if (!ROOM_FORMATS.includes(input.format)) return { error: "Choose a game format." };
  if (!ROOM_DIFFICULTIES.includes(input.difficulty)) return { error: "Choose a difficulty." };
  const length = Number(input.length);
  if (!ROOM_LENGTHS.includes(length)) return { error: "Choose 5, 10, or 20 pitches." };
  const maxPlayers = Number(input.maxPlayers);
  if (!ROOM_CAPACITIES.includes(maxPlayers)) return { error: "Choose a valid player limit." };
  if (typeof input.exactVerse !== "boolean") return { error: "Choose the answer settings." };

  const hostName = typeof input.hostName === "string" ? input.hostName.trim() : "";
  if (!hostName || hostName.length > 40) return { error: "Host name must be 1–40 characters." };
  const enteredName = typeof input.name === "string" ? input.name.trim() : "";
  if (enteredName.length > 60) return { error: "Game name must be 60 characters or fewer." };

  return {
    error: null,
    value: {
      name: enteredName || `${challenge.title} Match`,
      hostName,
      settings: {
        challengeId: challenge.id,
        format: input.format,
        difficulty: input.difficulty,
        length,
        exactVerse: input.exactVerse,
        maxPlayers,
      },
    },
  };
}

// Small starter collections are reused to fill longer mock games. The queue
// is saved with the room so all players will get the same pitch order later.
export function buildRoomPitchQueue(challengeId, length) {
  if (!ROOM_LENGTHS.includes(Number(length))) return [];
  const available = getChallengeQuestions(challengeId).map((question) => question.id);
  if (!available.length) return [];
  return Array.from({ length: Number(length) }, (_, index) => available[index % available.length]);
}

export function generateRoomCode() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Unavailable Web Crypto should not prevent this local-only mock from working.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => CODE_CHARACTERS[byte % CODE_CHARACTERS.length]).join("");
}

export function createRoomInState(state, draft, {
  generateCode = generateRoomCode,
  createdAt = new Date().toISOString(),
  hostProfileId = null,
} = {}) {
  const { value, error } = validateRoomDraft(draft);
  if (error) return { state, room: null, error };

  const taken = new Set(state.rooms.map((room) => room.code));
  let code = "";
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const candidate = normalizeRoomCode(generateCode());
    if (CODE_PATTERN.test(candidate) && !taken.has(candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) return { state, room: null, error: "Could not create a unique room code. Try again." };

  const hostId = ACCOUNT_PLAYER_PATTERN.test(hostProfileId ?? "")
    ? hostProfileId : `guest-host-${code}`;
  const room = {
    code,
    name: value.name,
    hostId,
    hostName: value.hostName,
    createdAt,
    settings: value.settings,
    questionIds: buildRoomPitchQueue(value.settings.challengeId, value.settings.length),
    status: "lobby",
    players: [{
      id: hostId,
      displayName: value.hostName,
      role: "host",
      ready: true,
      joinedAt: createdAt,
    }],
  };
  return {
    state: { version: VERSION, rooms: [...state.rooms, room].slice(-MAX_SAVED_ROOMS) },
    room,
    error: null,
  };
}

function normalizeRoom(value) {
  if (!isRecord(value) || !CODE_PATTERN.test(value.code) ||
    typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt))) return null;

  const result = validateRoomDraft({
    ...value.settings,
    name: value.name,
    hostName: value.hostName,
  });
  if (result.error) return null;

  const hostId = typeof value.hostId === "string" &&
    (ACCOUNT_PLAYER_PATTERN.test(value.hostId) || value.hostId === `guest-host-${value.code}`)
    ? value.hostId : `guest-host-${value.code}`;
  const players = (Array.isArray(value.players) ? value.players : [])
    .filter((player) => isRecord(player) && typeof player.id === "string" &&
      player.id.length > 0 && player.id.length <= 80 &&
      typeof player.displayName === "string" && player.displayName.trim().length > 0 &&
      player.displayName.trim().length <= 40)
    .slice(0, result.value.settings.maxPlayers)
    .map((player) => ({
      id: player.id,
      displayName: player.displayName.trim(),
      role: player.id === hostId ? "host" : "player",
      ready: player.ready === true,
      joinedAt: typeof player.joinedAt === "string" ? player.joinedAt : value.createdAt,
    }));
  if (!players.some((player) => player.id === hostId)) {
    players.unshift({
      id: hostId,
      displayName: result.value.hostName,
      role: "host",
      ready: true,
      joinedAt: value.createdAt,
    });
  }
  const unique = new Set();
  return {
    code: value.code,
    name: result.value.name,
    hostId,
    hostName: result.value.hostName,
    createdAt: value.createdAt,
    settings: result.value.settings,
    questionIds: buildRoomPitchQueue(result.value.settings.challengeId, result.value.settings.length),
    status: ["lobby", "active", "complete"].includes(value.status) ? value.status : "lobby",
    players: players.filter((player) => {
      if (unique.has(player.id) || unique.size >= result.value.settings.maxPlayers) return false;
      unique.add(player.id);
      return true;
    }),
  };
}

export function normalizeRoomState(value) {
  if (!isRecord(value) || value.version !== VERSION || !Array.isArray(value.rooms)) {
    return createInitialRoomState();
  }
  const found = new Set();
  const rooms = [];
  for (const candidate of value.rooms.slice(-MAX_SAVED_ROOMS)) {
    const room = normalizeRoom(candidate);
    if (!room || found.has(room.code)) continue;
    found.add(room.code);
    rooms.push(room);
  }
  return { version: VERSION, rooms };
}

export function loadRoomState(storage) {
  try {
    const json = storage?.getItem(ROOM_STORAGE_KEY);
    return json ? normalizeRoomState(JSON.parse(json)) : createInitialRoomState();
  } catch {
    return createInitialRoomState();
  }
}

export function saveRoomState(storage, state) {
  try {
    if (!storage) return false;
    storage.setItem(ROOM_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function getRoomByCode(state, code) {
  const normalized = normalizeRoomCode(code);
  if (!CODE_PATTERN.test(normalized)) return null;
  return state.rooms.find((room) => room.code === normalized) ?? null;
}

// Find Game accepts both a six-character code and a pasted invitation URL.
// Only the room code is used; the supplied URL is never followed or trusted.
export function parseRoomInvitation(value) {
  if (isValidRoomCode(value)) return normalizeRoomCode(value);
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value, "https://invitation.local");
    if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/join-game") return "";
    const code = normalizeRoomCode(url.searchParams.get("code"));
    return isValidRoomCode(code) ? code : "";
  } catch {
    return "";
  }
}

export function getInvitationPath(code) {
  const normalized = normalizeRoomCode(code);
  return CODE_PATTERN.test(normalized) ? `/join-game?code=${encodeURIComponent(normalized)}` : "";
}

export function getInvitationUrl(code, origin = "") {
  const path = getInvitationPath(code);
  return path ? `${String(origin).replace(/\/$/, "")}${path}` : "";
}

// Step 8: one room can have multiple named players, even though this is only
// a local mock. Every join updates the actual saved room instead of using URL
// query parameters as an imaginary membership list.
export function joinRoomInState(state, code, { playerId, displayName, joinedAt = new Date().toISOString() } = {}) {
  const room = getRoomByCode(state, code);
  if (!room) return { state, room: null, player: null, error: "Room not found on this device." };
  if (typeof playerId !== "string" || !(
    ACCOUNT_PLAYER_PATTERN.test(playerId) || GUEST_PLAYER_PATTERN.test(playerId) ||
    playerId === `guest-host-${room.code}`
  )) return { state, room, player: null, error: "Invalid player identity." };

  const existing = room.players.find((player) => player.id === playerId);
  if (existing) return { state, room, player: existing, error: null };
  if (playerId === `guest-host-${room.code}`) {
    return { state, room, player: null, error: "Invalid player identity." };
  }
  if (room.status !== "lobby") return { state, room, player: null, error: "This game is no longer accepting players." };
  if (room.players.length >= room.settings.maxPlayers) {
    return { state, room, player: null, error: "This room is full." };
  }
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (!name || name.length > 40) {
    return { state, room, player: null, error: "Display name must be 1–40 characters." };
  }
  if (room.players.some((player) => player.displayName.toLowerCase() === name.toLowerCase())) {
    return { state, room, player: null, error: "That name is already taken in this room." };
  }
  const player = { id: playerId, displayName: name, role: "player", ready: false, joinedAt };
  const updated = { ...room, players: [...room.players, player] };
  return {
    state: { ...state, rooms: state.rooms.map((item) => item.code === room.code ? updated : item) },
    room: updated, player, error: null,
  };
}

// A player may begin as a local guest and later create or open a local profile.
// Replacing their guest ID (rather than appending another player) preserves the
// room seat, ready status, and host role, including when the room is full.
export function claimGuestRoomSeatInState(state, code, guestId, { playerId, displayName } = {}) {
  const room = getRoomByCode(state, code);
  if (!room) return { state, room: null, player: null, error: "Room not found on this device." };
  if (!ACCOUNT_PLAYER_PATTERN.test(playerId ?? "")) {
    return { state, room, player: null, error: "Sign in to a local profile first." };
  }
  const existing = room.players.find((player) => player.id === playerId);
  if (existing) return { state, room, player: existing, error: null };
  const guest = room.players.find((player) => player.id === guestId && (
    GUEST_PLAYER_PATTERN.test(player.id) || player.id === `guest-host-${room.code}`
  ));
  if (!guest) return { state, room, player: null, error: "Guest membership not found." };
  const name = typeof displayName === "string" ? displayName.trim() : "";
  if (!name || name.length > 40) {
    return { state, room, player: null, error: "Display name must be 1–40 characters." };
  }
  if (room.players.some((player) => player.id !== guestId &&
    player.displayName.toLowerCase() === name.toLowerCase())) {
    return { state, room, player: null, error: "That name is already taken in this room." };
  }
  const player = { ...guest, id: playerId, displayName: name };
  const isHost = room.hostId === guestId;
  const updated = {
    ...room,
    ...(isHost ? { hostId: playerId, hostName: name } : {}),
    players: room.players.map((item) => item.id === guestId ? player : item),
  };
  return {
    state: { ...state, rooms: state.rooms.map((item) => item.code === room.code ? updated : item) },
    room: updated, player, error: null,
  };
}

export function generateGuestPlayerId() {
  const bytes = new Uint8Array(10);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return `guest-player-${Array.from(bytes, (byte) => CODE_CHARACTERS[byte % CODE_CHARACTERS.length]).join("")}`;
}

// The guest ID is remembered *only on this device*, never put in invite links.
// It allows refresh/navigation to retain the same room seat without exposing
// an account ID or using fake authentication.
export function createInitialRoomGuestState() {
  return { version: 1, byRoom: {} };
}

export function normalizeRoomGuestState(value) {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.byRoom)) {
    return createInitialRoomGuestState();
  }
  const byRoom = {};
  for (const [code, id] of Object.entries(value.byRoom).slice(-MAX_SAVED_ROOMS)) {
    if (isValidRoomCode(code) && (GUEST_PLAYER_PATTERN.test(id) || id === `guest-host-${code}`)) {
      byRoom[code] = id;
    }
  }
  return { version: 1, byRoom };
}

export function loadRoomGuestState(storage) {
  try {
    const json = storage?.getItem(ROOM_GUEST_STORAGE_KEY);
    return json ? normalizeRoomGuestState(JSON.parse(json)) : createInitialRoomGuestState();
  } catch {
    return createInitialRoomGuestState();
  }
}

export function saveRoomGuestState(storage, state) {
  try {
    if (!storage) return false;
    storage.setItem(ROOM_GUEST_STORAGE_KEY, JSON.stringify(normalizeRoomGuestState(state)));
    return true;
  } catch {
    return false;
  }
}

export function rememberRoomGuest(state, code, guestId) {
  const next = { ...state.byRoom, [normalizeRoomCode(code)]: guestId };
  return normalizeRoomGuestState({ version: 1, byRoom: next });
}

export function forgetRoomGuest(state, code) {
  const byRoom = { ...state.byRoom };
  delete byRoom[normalizeRoomCode(code)];
  return { ...state, byRoom };
}
