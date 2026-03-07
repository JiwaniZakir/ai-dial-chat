import { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { CustomSocket, WebSocketServerOptions } from './types';

/**
 * Initialize Socket.IO server on HTTP server
 * This function should be called once per server instance
 */
export function initializeSocketIO(
  req: NextApiRequest,
  res: NextApiResponse,
  options?: WebSocketServerOptions
): Server {
  // Get the socket.io server instance from response object
  // This value is set by the socket handler middleware
  if ((res.socket as any).server?.io) {
    return (res.socket as any).server.io;
  }

  // Create new Socket.IO instance if it doesn't exist
  const httpServer = (res.socket as any).server;
  const io = new Server(httpServer, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: options?.cors?.origin || '*',
      credentials: options?.cors?.credentials !== false,
    },
    maxHttpBufferSize: options?.maxHttpBufferSize || 1e6,
    pingInterval: options?.pingInterval || 30000,
    pingTimeout: options?.pingTimeout || 60000,
  });

  httpServer.io = io;

  // Set up global event handlers
  setupDefaultEventHandlers(io);

  return io;
}

/**
 * Set up default event handlers for all connections
 */
function setupDefaultEventHandlers(io: Server): void {
  io.on('connection', (socket: Socket<any, any> & { userId?: string; metadata?: Record<string, unknown> }) => {
    console.log(`[WebSocket] Client connected: ${socket.id}`);

    // Handle custom metadata
    socket.on('set_metadata', (metadata: Record<string, unknown>) => {
      socket.metadata = metadata;
      console.log(
        `[WebSocket] Metadata set for ${socket.id}:`,
        metadata
      );
    });

    // Handle user identification
    socket.on('identify_user', (userId: string) => {
      socket.userId = userId;
      socket.join(`user_${userId}`);
      console.log(`[WebSocket] User identified: ${userId}`);
    });

    // Handle room join
    socket.on(
      'join_room',
      (room: string, callback?: (success: boolean) => void) => {
        socket.join(room);
        console.log(`[WebSocket] Socket ${socket.id} joined room: ${room}`);
        socket
          .to(room)
          .emit('user_joined', {
            userId: socket.userId,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
          });
        callback?.(true);
      }
    );

    // Handle room leave
    socket.on(
      'leave_room',
      (room: string, callback?: (success: boolean) => void) => {
        socket.leave(room);
        console.log(`[WebSocket] Socket ${socket.id} left room: ${room}`);
        socket.to(room).emit('user_left', {
          userId: socket.userId,
          socketId: socket.id,
          timestamp: new Date().toISOString(),
        });
        callback?.(true);
      }
    );

    // Handle broadcast messages to room
    socket.on(
      'message_to_room',
      (payload: {
        room: string;
        message: unknown;
        includeSource?: boolean;
      }) => {
        const { room, message, includeSource = true } = payload;
        const emitPayload = {
          socketId: socket.id,
          userId: socket.userId || 'anonymous',
          message,
          timestamp: new Date().toISOString(),
        };

        io.to(room).emit('room_message', emitPayload);
      }
    );

    socket.on('disconnect', () => {
      console.log(`[WebSocket] Client disconnected: ${socket.id}`);
    });

    socket.on('error', (error: Error) => {
      console.error(`[WebSocket] Error on socket ${socket.id}:`, error);
    });
  });
}

/**
 * Get existing Socket.IO server instance
 */
export function getSocketIOInstance(res: NextApiResponse): Server | null {
  return (res.socket as any).server?.io || null;
}

/**
 * Emit event to specific socket
 */
export function emitToSocket(
  io: Server,
  socketId: string,
  event: string,
  data: unknown
): void {
  io.to(socketId).emit(event, data);
}

/**
 * Emit event to room
 */
export function emitToRoom(
  io: Server,
  room: string,
  event: string,
  data: unknown,
  excludeSocket?: string
): void {
  if (excludeSocket) {
    io.to(room).emit(event, data);
  } else {
    io.to(room).emit(event, data);
  }
}

/**
 * Broadcast event to all connected clients
 */
export function broadcastEvent(
  io: Server,
  event: string,
  data: unknown
): void {
  io.emit(event, data);
}

/**
 * Get all connected clients in a room
 */
export function getRoomSockets(io: Server, room: string): string[] {
  const roomObj = io.sockets.adapter.rooms.get(room);
  return roomObj ? Array.from(roomObj) : [];
}

/**
 * Get socket count
 */
export function getConnectedSocketCount(io: Server): number {
  return io.engine.clientsCount;
}
