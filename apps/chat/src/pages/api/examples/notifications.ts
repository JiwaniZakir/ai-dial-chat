/**
 * WebSocket Server Example: Notifications API
 * 
 * This demonstrates how to use WebSocket on the server side
 * to broadcast events to connected clients.
 * 
 * Place this file at: pages/api/examples/notifications.ts
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSocketIOInstance, emitToSocket, broadcastEvent } from '@/utils/websocket/server';

/**
 * Example: Send notification to specific user
 * 
 * Usage:
 * POST /api/examples/notifications?action=notify_user
 * Body: { userId: "user_123", title: "Hello", message: "World" }
 */
async function notifyUser(req: NextApiRequest, res: NextApiResponse) {
  const { userId, title, message } = req.body;

  if (!userId) {
    return res
      .status(400)
      .json({ error: 'userId is required' });
  }

  const io = getSocketIOInstance(res);
  if (!io) {
    return res
      .status(500)
      .json({ error: 'WebSocket server not initialized' });
  }

  // Emit to specific user's socket
  emitToSocket(io, userId, 'notification', {
    title,
    message,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, message: 'Notification sent' });
}

/**
 * Example: Broadcast event to all connected clients
 * 
 * Usage:
 * POST /api/examples/notifications?action=broadcast
 * Body: { event: "system_message", data: { text: "Server maintenance in 5 minutes" } }
 */
async function broadcastMessage(req: NextApiRequest, res: NextApiResponse) {
  const { event, data } = req.body;

  if (!event) {
    return res
      .status(400)
      .json({ error: 'event is required' });
  }

  const io = getSocketIOInstance(res);
  if (!io) {
    return res
      .status(500)
      .json({ error: 'WebSocket server not initialized' });
  }

  broadcastEvent(io, event, {
    ...data,
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    message: `Event "${event}" broadcasted to all clients`,
  });
}

/**
 * Example: Emit event to room
 * 
 * Usage:
 * POST /api/examples/notifications?action=emit_to_room
 * Body: { room: "chat-room-1", event: "user_typing", data: { userId: "user_123" } }
 */
async function emitToRoom(req: NextApiRequest, res: NextApiResponse) {
  const { room, event, data } = req.body;

  if (!room || !event) {
    return res
      .status(400)
      .json({ error: 'room and event are required' });
  }

  const io = getSocketIOInstance(res);
  if (!io) {
    return res
      .status(500)
      .json({ error: 'WebSocket server not initialized' });
  }

  io.to(room).emit(event, {
    ...data,
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    message: `Event "${event}" emitted to room "${room}"`,
  });
}

/**
 * Example: Get connection stats
 * 
 * Usage:
 * GET /api/examples/notifications?action=stats
 */
async function getStats(req: NextApiRequest, res: NextApiResponse) {
  const io = getSocketIOInstance(res);
  if (!io) {
    return res
      .status(500)
      .json({ error: 'WebSocket server not initialized' });
  }

  const connectedClients = io.engine.clientsCount;
  const rooms = Array.from(io.sockets.adapter.rooms.keys()) as string[];

  res.json({
    connectedClients,
    totalRooms: rooms.length,
    rooms: rooms.filter((room: string) => !room.startsWith('/')),
  });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action = 'notify_user' } = req.query;

  try {
    switch (action) {
      case 'notify_user':
        return notifyUser(req, res);
      case 'broadcast':
        return broadcastMessage(req, res);
      case 'emit_to_room':
        return emitToRoom(req, res);
      case 'stats':
        return getStats(req, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error('[WebSocket API Error]:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
