import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { acquireSocket, releaseSocket, type AppSocket } from './connection.js';

const SocketContext = createContext<AppSocket | null>(null);

export function SocketProvider({ token, children }: { token: string; children: ReactNode }) {
  const [socket, setSocket] = useState<AppSocket | null>(null);

  useEffect(() => {
    const s = acquireSocket(token);
    setSocket(s);
    return () => releaseSocket();
  }, [token]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket(): AppSocket | null {
  return useContext(SocketContext);
}
