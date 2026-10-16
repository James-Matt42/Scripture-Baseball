import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  createRoomInState,
  getRoomByCode,
  loadRoomState,
  saveRoomState,
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
  const [roomState, setRoomState] = useState(() => loadRoomState(browserStorage()));
  const [isSaved, setIsSaved] = useState(null);

  useEffect(() => {
    setIsSaved(saveRoomState(browserStorage(), roomState));
  }, [roomState]);

  const createRoom = useCallback((draft, hostProfileId) => {
    const result = createRoomInState(roomState, draft, { hostProfileId });
    if (result.room) setRoomState(result.state);
    return result;
  }, [roomState]);

  const value = useMemo(() => ({
    rooms: roomState.rooms,
    isSaved,
    createRoom,
    findRoom: (code) => getRoomByCode(roomState, code),
  }), [roomState, isSaved, createRoom]);

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRooms() {
  const context = useContext(RoomContext);
  if (!context) throw new Error("useRooms must be used inside RoomProvider");
  return context;
}
