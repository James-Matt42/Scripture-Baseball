import { CHALLENGES, getChallengeById, getChallengeQuestions } from "../challenges/catalog.js";
import { getQuestionById, gradeBookAndChapter, gradeExactVerse } from "../scripture/questions.js";

export const ROOM_STORAGE_KEY = "scripture-baseball.rooms.v1";
export const ROOM_GUEST_STORAGE_KEY = "scripture-baseball.room-guests.v1";
const VERSION = 1;
const MAX_SAVED_ROOMS = 40;
const CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const GUEST_PLAYER_PATTERN = /^guest-player-[A-HJ-NP-Z2-9]{10}$/;
const ACCOUNT_PLAYER_PATTERN = /^account-[1-9]\d*$/;
const BOT_NAMES = ["Miriam", "Ruth", "Ezra", "Leah", "Caleb", "Esther", "Nephi", "Abigail", "Daniel", "Naomi", "Isaiah"];

function botPlayerId(code, slot) {
  return `bot-${code}-${slot}`;
}

function isBotPlayer(room, player) {
  return player?.isBot === true && player.id.startsWith(`bot-${room.code}-`) &&
    /^[1-9]\d*$/.test(player.id.slice(`bot-${room.code}-`.length));
}

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

// Only a small, validated match record is persisted. Never trust stored grading
// flags: recompute answers from the question bank on every load.
function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function gradeRoomAnswer(question, candidate, exactVerse) {
  if (!isRecord(candidate) || !question.choices.includes(candidate.bookId) ||
    !Number.isSafeInteger(candidate.chapter) || candidate.chapter < 1) return null;
  const bookAndChapter = gradeBookAndChapter(question, candidate.bookId, candidate.chapter);
  if (!exactVerse) return bookAndChapter;
  if (!Number.isSafeInteger(candidate.verse) || candidate.verse < 1) return null;
  return gradeExactVerse(question, bookAndChapter, candidate.verse);
}

function normalizeRoomMatch(candidate, status, questionIds, players, exactVerse) {
  if (status === "lobby") return null;
  if (!isRecord(candidate) || !validDate(candidate.startedAt) ||
    !Number.isInteger(candidate.roundIndex)) return null;
  const complete = status === "complete";
  if (candidate.roundIndex < 0 || candidate.roundIndex > questionIds.length - (complete ? 0 : 1)) return null;
  if (complete && (candidate.roundIndex !== questionIds.length || !validDate(candidate.completedAt))) return null;
  if (!Array.isArray(candidate.responses)) return null;

  const playerIds = new Set(players.map((player) => player.id));
  const seen = new Set();
  const responses = [];
  for (const response of candidate.responses.slice(0, questionIds.length * players.length)) {
    if (!isRecord(response) || !Number.isInteger(response.roundIndex) ||
      response.roundIndex < 0 || response.roundIndex > (complete ? questionIds.length - 1 : candidate.roundIndex) ||
      !playerIds.has(response.playerId) || !validDate(response.answeredAt) ||
      response.questionId !== questionIds[response.roundIndex]) continue;
    const key = `${response.roundIndex}:${response.playerId}`;
    if (seen.has(key)) continue;
    const question = getQuestionById(response.questionId);
    const attempt = question && gradeRoomAnswer(question, response.attempt, exactVerse);
    if (!attempt) continue;
    seen.add(key);
    responses.push({ roundIndex: response.roundIndex, questionId: question.id,
      playerId: response.playerId, answeredAt: response.answeredAt, attempt });
  }
  return {
    startedAt: candidate.startedAt,
    roundIndex: candidate.roundIndex,
    responses,
    ...(complete ? { completedAt: candidate.completedAt } : {}),
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
    .map((player) => {
      const isBot = player.isBot === true && player.id.startsWith(`bot-${value.code}-`) &&
        /^[1-9]\d*$/.test(player.id.slice(`bot-${value.code}-`.length));
      return {
        id: player.id,
        displayName: player.displayName.trim(),
        role: player.id === hostId ? "host" : "player",
        ready: isBot || player.ready === true,
        joinedAt: typeof player.joinedAt === "string" ? player.joinedAt : value.createdAt,
        ...(isBot && player.id !== hostId ? { isBot: true } : {}),
      };
    });
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
  const normalizedPlayers = players.filter((player) => {
    if (unique.has(player.id) || unique.size >= result.value.settings.maxPlayers) return false;
    unique.add(player.id);
    return true;
  });
  const questionIds = buildRoomPitchQueue(result.value.settings.challengeId, result.value.settings.length);
  const savedStatus = ["lobby", "active", "complete"].includes(value.status) ? value.status : "lobby";
  const match = normalizeRoomMatch(value.match, savedStatus, questionIds, normalizedPlayers, result.value.settings.exactVerse);
  return {
    code: value.code,
    name: result.value.name,
    hostId,
    hostName: result.value.hostName,
    createdAt: value.createdAt,
    settings: result.value.settings,
    questionIds,
    status: savedStatus !== "lobby" && !match ? "lobby" : savedStatus,
    players: normalizedPlayers,
    ...(match ? { match } : {}),
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
    ...(room.match ? { match: { ...room.match, responses: room.match.responses.map((response) =>
      response.playerId === guestId ? { ...response, playerId } : response) } } : {}),
  };
  return {
    state: { ...state, rooms: state.rooms.map((item) => item.code === room.code ? updated : item) },
    room: updated, player, error: null,
  };
}

// Step 9: pure room transitions are shared by the UI and tests. Each action
// validates its actor and phase, and returns the untouched state on failure.
function updateRoom(state, room, updated) {
  return {
    state: { ...state, rooms: state.rooms.map((item) => item.code === room.code ? updated : item) },
    room: updated,
    error: null,
  };
}

function roomError(state, room, error) {
  return { state, room, error };
}

export function setRoomPlayerReadyInState(state, code, playerId, ready) {
  const room = getRoomByCode(state, code);
  if (!room) return roomError(state, null, "Room not found.");
  if (room.status !== "lobby") return roomError(state, room, "Readiness cannot change after the match starts.");
  if (typeof ready !== "boolean") return roomError(state, room, "Choose ready or not ready.");
  const player = room.players.find((item) => item.id === playerId);
  if (!player) return roomError(state, room, "Join this room to change readiness.");
  if (isBotPlayer(room, player)) return roomError(state, room, "Simulated players are always ready.");
  if (player.ready === ready) return { state, room, error: null };
  return updateRoom(state, room, {
    ...room, players: room.players.map((item) => item.id === playerId ? { ...item, ready } : item),
  });
}

export function startRoomMatchInState(state, code, hostId, { startedAt = new Date().toISOString() } = {}) {
  const room = getRoomByCode(state, code);
  if (!room) return roomError(state, null, "Room not found.");
  if (room.hostId !== hostId) return roomError(state, room, "Only the host can start the game.");
  if (room.status !== "lobby") return roomError(state, room, "This game has already started.");
  if (!room.players.length || room.players.some((player) => !player.ready)) {
    return roomError(state, room, "All players must be ready before starting.");
  }
  if (!validDate(startedAt) || room.questionIds.length !== room.settings.length ||
    room.questionIds.some((id) => !getQuestionById(id))) {
    return roomError(state, room, "The room questions are not ready.");
  }
  return updateRoom(state, room, {
    ...room, status: "active",
    match: { startedAt, roundIndex: 0, responses: [] },
  });
}

export function getRoomRoundQuestion(room) {
  if (room?.status !== "active" || !room.match) return null;
  return getQuestionById(room.questionIds[room.match.roundIndex]);
}

export function getRoomRoundResponses(room, roundIndex = room?.match?.roundIndex) {
  if (!Array.isArray(room?.match?.responses) || !Number.isInteger(roundIndex)) return [];
  return room.match.responses.filter((response) => response.roundIndex === roundIndex);
}

function recordRoomAnswerInState(state, code, playerId, answer, {
  answeredAt = new Date().toISOString(), allowBot = false,
} = {}) {
  const room = getRoomByCode(state, code);
  if (!room) return roomError(state, null, "Room not found.");
  if (room.status !== "active" || !room.match) return roomError(state, room, "This round is not active.");
  const player = room.players.find((item) => item.id === playerId);
  if (!player) return roomError(state, room, "Join the room before answering.");
  if (isBotPlayer(room, player) && !allowBot) {
    return roomError(state, room, "Simulated players answer automatically.");
  }
  const roundIndex = room.match.roundIndex;
  if (getRoomRoundResponses(room).some((response) => response.playerId === playerId)) {
    return roomError(state, room, "You already answered this pitch.");
  }
  const question = getRoomRoundQuestion(room);
  if (!question || answer?.questionId !== question.id || !validDate(answeredAt)) {
    return roomError(state, room, "This answer is for a different pitch.");
  }
  const attempt = gradeRoomAnswer(question, answer, room.settings.exactVerse);
  if (!attempt) return roomError(state, room, "Enter a valid book, chapter, and verse if enabled.");
  const response = { roundIndex, questionId: question.id, playerId, answeredAt, attempt };
  return updateRoom(state, room, {
    ...room,
    match: { ...room.match, responses: [...room.match.responses, response] },
  });
}

export function submitRoomAnswerInState(state, code, playerId, answer, options = {}) {
  return recordRoomAnswerInState(state, code, playerId, answer, { answeredAt: options.answeredAt });
}

// Step 10: add computer-controlled seats while in the lobby. They count toward
// capacity and ready checks, but no external user or server is represented.
export function addSimulatedPlayerInState(state, code, hostId, { joinedAt = new Date().toISOString() } = {}) {
  const room = getRoomByCode(state, code);
  if (!room) return roomError(state, null, "Room not found.");
  if (room.hostId !== hostId) return roomError(state, room, "Only the host can add simulated players.");
  if (room.status !== "lobby") return roomError(state, room, "Players cannot be added after the game starts.");
  if (room.players.length >= room.settings.maxPlayers) return roomError(state, room, "This room is full.");
  if (!validDate(joinedAt)) return roomError(state, room, "Invalid join time.");

  let slot = 1;
  while (room.players.some((player) => player.id === botPlayerId(room.code, slot))) slot += 1;
  const usedNames = new Set(room.players.map((player) => player.displayName.toLowerCase()));
  const baseName = BOT_NAMES[(slot - 1) % BOT_NAMES.length];
  let name = baseName;
  let suffix = 2;
  while (usedNames.has(name.toLowerCase())) name = `${baseName} ${suffix++}`;
  const player = {
    id: botPlayerId(room.code, slot), displayName: name, role: "player",
    ready: true, isBot: true, joinedAt,
  };
  return updateRoom(state, room, { ...room, players: [...room.players, player] });
}

export function removeSimulatedPlayerInState(state, code, hostId, botId) {
  const room = getRoomByCode(state, code);
  if (!room) return roomError(state, null, "Room not found.");
  if (room.hostId !== hostId) return roomError(state, room, "Only the host can remove simulated players.");
  if (room.status !== "lobby") return roomError(state, room, "Players cannot be removed after the game starts.");
  const bot = room.players.find((player) => player.id === botId);
  if (!isBotPlayer(room, bot)) return roomError(state, room, "Simulated player not found.");
  return updateRoom(state, room, {
    ...room, players: room.players.filter((player) => player.id !== botId),
  });
}

// Seeded guesses make repeated attempts stable across refreshes. The difficulty
// affects computer accuracy, not the correctness of any human submission.
export function createSimulatedAnswer(room, botId) {
  const question = getRoomRoundQuestion(room);
  if (!question) return null;
  let hash = 2166136261;
  for (const char of `${room.code}:${room.match.roundIndex}:${botId}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  }
  let seed = hash;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const chance = { beginner: 0.85, standard: 0.66, expert: 0.45 }[room.settings.difficulty];
  const otherBooks = question.choices.filter((bookId) => bookId !== question.bookId);
  const bookId = random() < chance || !otherBooks.length
    ? question.bookId : otherBooks[Math.floor(random() * otherBooks.length)];
  const chapter = random() < chance ? question.chapter : question.chapter + 1;
  const answer = { questionId: question.id, bookId, chapter };
  if (room.settings.exactVerse) answer.verse = random() < chance ? question.verse : question.verse + 1;
  return answer;
}

export function simulateRoomAnswerInState(state, code, botId, {
  answeredAt = new Date().toISOString(),
} = {}) {
  const room = getRoomByCode(state, code);
  if (!room) return roomError(state, null, "Room not found.");
  if (room.status !== "active" || !room.match) return roomError(state, room, "This round is not active.");
  const bot = room.players.find((player) => player.id === botId);
  if (!isBotPlayer(room, bot)) return roomError(state, room, "Simulated player not found.");
  if (getRoomRoundResponses(room).some((response) => response.playerId === botId)) {
    return { state, room, error: null }; // timers or multiple tabs may retry the same pitch
  }
  return recordRoomAnswerInState(state, code, botId, createSimulatedAnswer(room, botId), {
    answeredAt, allowBot: true,
  });
}

function pointsForAttempt(attempt, exactVerse) {
  return Number(attempt.bookCorrect) + Number(attempt.chapterCorrect) +
    (exactVerse ? Number(attempt.verseCorrect) : 0);
}

// Scores count only stored, graded answers. A skipped pitch earns zero, and
// equal scores share a rank (without inventing a tie-breaker).
export function getRoomStandings(room) {
  if (!room?.match) return [];
  const results = room.players.map((player, order) => {
    const attempts = room.match.responses.filter((response) => response.playerId === player.id);
    const bookCorrect = attempts.filter((response) => response.attempt.bookCorrect).length;
    const chapterCorrect = attempts.filter((response) => response.attempt.chapterCorrect).length;
    const verseCorrect = attempts.filter((response) => response.attempt.verseCorrect).length;
    return {
      playerId: player.id, name: player.displayName, isBot: player.isBot === true,
      isHost: player.id === room.hostId, order,
      answered: attempts.length,
      bookCorrect, chapterCorrect, verseCorrect,
      points: attempts.reduce((sum, response) => sum + pointsForAttempt(response.attempt, room.settings.exactVerse), 0),
      possiblePoints: room.questionIds.length * (room.settings.exactVerse ? 3 : 2),
    };
  }).sort((a, b) => b.points - a.points || a.order - b.order);
  let rank = 0;
  return results.map((player, index) => {
    if (index === 0 || player.points !== results[index - 1].points) rank = index + 1;
    const { order, ...standing } = player;
    return { ...standing, rank };
  });
}

export function getCompletedRoomHistory(rooms, playerId = null, guestByRoom = {}, limit = 10) {
  if (!Array.isArray(rooms)) return [];
  return rooms.filter((room) => room?.status === "complete" && room.match?.completedAt)
    .flatMap((room) => {
      const who = playerId || guestByRoom?.[room.code];
      if (!who) return [];
      const standing = getRoomStandings(room).find((entry) => entry.playerId === who);
      if (!standing || standing.isBot) return [];
      return [{ code: room.code, name: room.name, finishedAt: room.match.completedAt,
        challengeId: room.settings.challengeId, rank: standing.rank, playerCount: room.players.length,
        points: standing.points, possiblePoints: standing.possiblePoints,
        answered: standing.answered, pitches: room.questionIds.length }];
    })
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt) || a.code.localeCompare(b.code))
    .slice(0, limit);
}

export function advanceRoomRoundInState(state, code, hostId, {
  skipMissing = false, advancedAt = new Date().toISOString(),
} = {}) {
  const room = getRoomByCode(state, code);
  if (!room) return roomError(state, null, "Room not found.");
  if (room.hostId !== hostId) return roomError(state, room, "Only the host can advance the game.");
  if (room.status !== "active" || !room.match) return roomError(state, room, "No active round to advance.");
  const answers = new Set(getRoomRoundResponses(room).map((response) => response.playerId));
  if (!answers.has(hostId)) return roomError(state, room, "Answer this pitch before advancing.");
  if (!skipMissing && room.players.some((player) => !answers.has(player.id))) {
    return roomError(state, room, "Wait for the other players, or skip their unanswered pitches.");
  }
  const nextIndex = room.match.roundIndex + 1;
  const completed = nextIndex >= room.questionIds.length;
  if (completed && !validDate(advancedAt)) return roomError(state, room, "Invalid finish time.");
  return updateRoom(state, room, {
    ...room,
    status: completed ? "complete" : "active",
    match: {
      ...room.match,
      roundIndex: nextIndex,
      ...(completed ? { completedAt: advancedAt } : {}),
    },
  });
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
