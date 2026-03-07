import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { WebSocketMessage, RoomMessage } from './types';

export interface UseWebSocketOptions {
  url?: string;
  autoConnect?: boolean;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionDelayMax?: number;
  reconnectionAttempts?: number;
}

export interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  isConnecting: boolean;
  proxyConnected: boolean;
  error: Error | null;
  proxyError: string | null;
  send: (event: string, data: unknown, callback?: (...args: unknown[]) => void) => void;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler?: (...args: unknown[]) => void) => void;
  emit: (event: string, data: unknown) => void;
  joinRoom: (room: string) => Promise<boolean>;
  leaveRoom: (room: string) => Promise<boolean>;
  sendToRoom: (room: string, message: unknown) => void;
  identifyUser: (userId: string) => void;
  setMetadata: (metadata: Record<string, unknown>) => void;
  reconnectBackend: () => void;
  disconnect: () => void;
}

/**
 * React hook for WebSocket (Socket.IO) connections with DIAL API proxy support
 *
 * @example
 * ```tsx
 * const { socket, isConnected, proxyConnected, send, joinRoom } = useWebSocket({
 *   autoConnect: true,
 *   reconnection: true,
 * });
 *
 * useEffect(() => {
 *   if (proxyConnected) {
 *     joinRoom('chat-room');
 *   }
 * }, [proxyConnected]);
 *
 * const handleSendMessage = (message: string) => {
 *   sendToRoom('chat-room', { text: message });
 * };
 * ```
 */
export function useWebSocket(
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const {
    url = typeof window !== 'undefined' ? window.location.origin : '',
    autoConnect = true,
    reconnection = true,
    reconnectionDelay = 1000,
    reconnectionDelayMax = 5000,
    reconnectionAttempts = 5,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [proxyConnected, setProxyConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [proxyError, setProxyError] = useState<string | null>(null);
  const handlersRef = useRef<Map<string, Set<(...args: unknown[]) => void>>>(
    new Map()
  );

  // Initialize socket connection
  useEffect(() => {
    if (!autoConnect || socketRef.current) {
      return;
    }

    setIsConnecting(true);
    const socket = io(url, {
      path: '/api/socket',
      autoConnect: true,
      reconnection,
      reconnectionDelay,
      reconnectionDelayMax,
      reconnectionAttempts,
      transports: ['websocket', 'polling'],
    });

    // Connection event handlers
    socket.on('connect', () => {
      console.log('[WebSocket] Connected to proxy');
      setIsConnected(true);
      setIsConnecting(false);
      setError(null);
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected from proxy');
      setIsConnected(false);
      setProxyConnected(false);
    });

    // Proxy connection handlers
    socket.on('proxy_connected', () => {
      console.log('[WebSocket] Proxy backend connected');
      setProxyConnected(true);
      setProxyError(null);
    });

    socket.on('proxy_disconnected', (data?: { reason?: string } | unknown) => {
      const reason = (data && typeof data === 'object' && 'reason' in data) 
        ? (data as { reason?: string }).reason 
        : undefined;
      console.log('[WebSocket] Proxy backend disconnected:', reason);
      setProxyConnected(false);
    });

    socket.on('proxy_error', (data?: { error: string } | unknown) => {
      const errorMsg = (data && typeof data === 'object' && 'error' in data)
        ? (data as { error: string }).error
        : String(data);
      console.error('[WebSocket] Proxy backend error:', errorMsg);
      setProxyError(errorMsg);
    });

    socket.on('connect_error', (err: Error) => {
      console.error('[WebSocket] Connection error:', err);
      setError(err);
      setIsConnecting(false);
    });

    socket.on('error', (err: unknown) => {
      console.error('[WebSocket] Error:', err);
      if (err instanceof Error) {
        setError(err);
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [url, autoConnect, reconnection, reconnectionDelay, reconnectionDelayMax, reconnectionAttempts]);

  // Send message through socket
  const send = useCallback(
    (event: string, data: unknown, callback?: (...args: unknown[]) => void) => {
      if (socketRef.current?.connected) {
        if (callback) {
          socketRef.current.emit(event, data, callback);
        } else {
          socketRef.current.emit(event, data);
        }
      } else {
        console.warn('[WebSocket] Socket not connected');
      }
    },
    []
  );

  // Register event listener
  const on = useCallback((event: string, handler: (...args: unknown[]) => void): void => {
    if (!socketRef.current) return;

    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)?.add(handler);
    socketRef.current.on(event, handler);
  }, []);

  // Unregister event listener
  const off = useCallback((event: string, handler?: (...args: unknown[]) => void): void => {
    if (!socketRef.current) return;

    if (handler) {
      socketRef.current.off(event, handler);
      handlersRef.current.get(event)?.delete(handler);
    } else {
      socketRef.current.off(event);
      handlersRef.current.delete(event);
    }
  }, []);

  // Direct emit wrapper
  const emit = useCallback(
    (event: string, data: unknown) => {
      send(event, data);
    },
    [send]
  );

  // Join room with acknowledgment
  const joinRoom = useCallback(
    (room: string): Promise<boolean> => {
      return new Promise((resolve) => {
        send('join_room', room, (...args: unknown[]) => {
          resolve((args[0] as boolean) ?? false);
        });
      });
    },
    [send]
  );

  // Leave room with acknowledgment
  const leaveRoom = useCallback(
    (room: string): Promise<boolean> => {
      return new Promise((resolve) => {
        send('leave_room', room, (...args: unknown[]) => {
          resolve((args[0] as boolean) ?? false);
        });
      });
    },
    [send]
  );

  // Send message to specific room
  const sendToRoom = useCallback(
    (room: string, message: unknown) => {
      send('message_to_room', { room, message });
    },
    [send]
  );

  // Identify user
  const identifyUser = useCallback(
    (userId: string) => {
      send('identify_user', userId);
    },
    [send]
  );

  // Set metadata
  const setMetadata = useCallback(
    (metadata: Record<string, unknown>) => {
      send('set_metadata', metadata);
    },
    [send]
  );

  // Reconnect backend proxy
  const reconnectBackend = useCallback(() => {
    send('reconnect_backend', {});
  }, [send]);

  // Disconnect
  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    isConnecting,
    proxyConnected,
    error,
    proxyError,
    send,
    on,
    off,
    emit,
    joinRoom,
    leaveRoom,
    sendToRoom,
    identifyUser,
    setMetadata,
    reconnectBackend,
    disconnect,
  };
}
