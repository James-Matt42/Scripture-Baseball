import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount } from "../account/AccountContext";
import {
  claimGuestRoomSeatInState,
  createRoomInState,
  forgetRoomGuest,
  generateGuestPlayerId,
  getRoomByCode,
  joinRoomInState,
  loadRoomGuestState,
  loadRoomState,
  normalizeRoomCode,
  rememberRoomGuest,
  saveRoomGuestState,
  saveRoomState,
  ROOM_STORAGE_KEY,
  setRoomPlayerReadyInState,
  startRoomMatchInState,
  submitRoomAnswerInState,
  advanceRoomRoundInState,
} from "./roomState.js";

const RoomContext = createContext(null);

function browserStorage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function RoomProvider({ children }) {
  const { activeProfile } = useAccount();
  const [roomState, setRoomState] = useState(() => loadRoomState(browserStorage()));
  const [guestState, setGuestState] = useState(() => loadRoomGuestState(browserStorage()));
  const [isSaved, setIsSaved] = useState(null);

  useEffect(() => {
    const storage = browserStorage();
    setIsSaved(saveRoomState(storage, roomState) && saveRoomGuestState(storage, guestState));
  }, [roomState, guestState]);

  const createRoom = useCallback((draft, hostProfileId) => {
    const result = createRoomInState(roomState, draft, { hostProfileId });
    if (result.room) {
      setRoomState(result.state);
      if (!hostProfileId) {
        setGuestState((previous) => rememberRoomGuest(previous, result.room.code, result.room.hostId));
      }
    }
    return result;
  }, [roomState]);

  const joinRoom = useCallback((code, guestDisplayName = "") => {
    const normalized = normalizeRoomCode(code);
    const room = getRoomByCode(roomState, normalized);
    if (!room) return { room: null, player: null, error: "Room not found on this device." };

    const guestId = guestState.byRoom[normalized];
    let result;
    if (activeProfile) {
      // An account created after a guest joined inherits that exact seat.
      if (guestId && room.players.some((player) => player.id === guestId) &&
        !room.players.some((player) => player.id === activeProfile.id)) {
        result = claimGuestRoomSeatInState(roomState, normalized, guestId, {
          playerId: activeProfile.id, displayName: activeProfile.displayName,
        });
      } else {
        result = joinRoomInState(roomState, normalized, {
          playerId: activeProfile.id, displayName: activeProfile.displayName,
        });
      }
      if (!result.error && guestId) setGuestState((previous) => forgetRoomGuest(previous, normalized));
    } else {
      let playerId = guestId;
      if (!playerId || !room.players.some((player) => player.id === playerId)) {
        // Avoid accidentally assigning a different guest's room seat.
        for (let attempt = 0; attempt < 32; attempt += 1) {
          const candidate = generateGuestPlayerId();
          if (!room.players.some((player) => player.id === candidate)) {
            playerId = candidate;
            break;
          }
        }
      }
      result = joinRoomInState(roomState, normalized, { playerId, displayName: guestDisplayName });
      if (!result.error) {
        setGuestState((previous) => rememberRoomGuest(previous, normalized, result.player.id));
      }
    }
    if (!result.error && result.state !== roomState) setRoomState(result.state);
    return result;
  }, [roomState, guestState, activeProfile]);

  // Other tabs on the same origin can participate in the local mock. Storage
  // events do not fire in the tab that wrote the change, so avoid re-saving an
  // unchanged snapshot (which would otherwise bounce events between tabs).
  useEffect(() => {
    function handleStorage(event) {
      if (event.key !== ROOM_STORAGE_KEY) return;
      const incoming = loadRoomState(browserStorage());
      setRoomState((previous) => JSON.stringify(previous) === JSON.stringify(incoming) ? previous : incoming);
    }
    if (typeof window === "undefined") return undefined;
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setMyReady = useCallback((code, playerId, ready) => {
    const result = setRoomPlayerReadyInState(roomState, code, playerId, ready);
    if (!result.error && result.state !== roomState) setRoomState(result.state);
    return result;
  }, [roomState]);

  const startMatch = useCallback((code, playerId) => {
    const result = startRoomMatchInState(roomState, code, playerId);
    if (!result.error) setRoomState(result.state);
    return result;
  }, [roomState]);

  const answerRound = useCallback((code, playerId, answer) => {
    const result = submitRoomAnswerInState(roomState, code, playerId, answer);
    if (!result.error) setRoomState(result.state);
    return result;
  }, [roomState]);

  const advanceRound = useCallback((code, playerId, skipMissing = false) => {
    const result = advanceRoomRoundInState(roomState, code, playerId, { skipMissing });
    if (!result.error) setRoomState(result.state);
    return result;
  }, [roomState]);

  const findRoom = useCallback((code) => getRoomByCode(roomState, code), [roomState]);
  const findGuestRoomPlayer = useCallback((code) => {
    const room = getRoomByCode(roomState, code);
    const guestId = guestState.byRoom[normalizeRoomCode(code)];
    return room?.players.find((player) => player.id === guestId) ?? null;
  }, [roomState, guestState]);
  const findMyRoomPlayer = useCallback((code) => {
    const room = getRoomByCode(roomState, code);
    if (!room) return null;
    return activeProfile
      ? room.players.find((player) => player.id === activeProfile.id) ?? null
      : room.players.find((player) => player.id === guestState.byRoom[room.code]) ?? null;
  }, [roomState, guestState, activeProfile]);

  const value = useMemo(() => ({
    rooms: roomState.rooms,
    isSaved,
    createRoom,
    joinRoom,
    findRoom,
    findMyRoomPlayer,
    findGuestRoomPlayer,
    setMyReady,
    startMatch,
    answerRound,
    advanceRound,
  }), [roomState, isSaved, createRoom, joinRoom, findRoom, findMyRoomPlayer, findGuestRoomPlayer,
    setMyReady, startMatch, answerRound, advanceRound]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRooms() {
  const context = useContext(RoomContext);
  if (!context) throw new Error("useRooms must be used inside RoomProvider");
  return context;
}
