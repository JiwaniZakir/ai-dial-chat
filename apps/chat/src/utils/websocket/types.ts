import type { Server, Socket as SocketType } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Socket.IO server instance with custom properties
 */
export interface CustomSocket extends SocketType {
  userId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Custom request with socket.io server attached
 */
export interface NextApiRequestWithSocket extends NextApiRequest {
  socket: any;
}

/**
 * WebSocket event types
 */
export enum WebSocketEventType {
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  ERROR = 'error',
  MESSAGE = 'message',
  JOIN_ROOM = 'join_room',
  LEAVE_ROOM = 'leave_room',
  ROOM_MESSAGE = 'room_message',
}

/**
 * Message event payload
 */
export interface WebSocketMessage {
  event: string;
  data: unknown;
  timestamp?: number;
  userId?: string;
}

/**
 * Room-based messaging payload
 */
export interface RoomMessage extends WebSocketMessage {
  room: string;
  userId: string;
}

/**
 * Error payload
 */
export interface WebSocketError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Server options for initialization
 */
export interface WebSocketServerOptions {
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
  };
  maxHttpBufferSize?: number;
  pingInterval?: number;
  pingTimeout?: number;
}
