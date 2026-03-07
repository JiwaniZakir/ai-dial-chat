/**
 * Advanced WebSocket Example: Authenticated Connections
 * 
 * This demonstrates how to integrate WebSocket with authentication
 * (e.g., NextAuth, JWT, etc.)
 */

'use client';

import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useWebSocket } from '@/hooks/useWebSocket';

/**
 * Hook for authenticated WebSocket connections
 * 
 * Features:
 * - Automatically connects when user is authenticated
 * - Identifies socket with user information
 * - Handles session changes
 * - Cleans up on logout
 */
export function useAuthenticatedWebSocket() {
  const { data: session, status } = useSession();
  const {
    socket,
    isConnected,
    identifyUser,
    setMetadata,
    disconnect,
    on,
    off,
  } = useWebSocket({
    autoConnect: false, // Don't auto-connect without auth
  });

  // Connect when user is authenticated
  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      // Socket will auto-connect based on the URL
      identifyUser(session.user.id || session.user.email || '');
      
      // Send user metadata
      setMetadata({
        username: session.user.name || '',
        email: session.user.email || '',
        image: session.user.image || '',
        authenticated: true,
      });

      // Listen for authentication-related events
      on('auth_required', () => {
        // Server requested re-authentication
        console.log('[WebSocket] Re-authentication required');
      });

      on('session_invalid', () => {
        // Session is no longer valid
        console.log('[WebSocket] Session invalid, reconnecting...');
        disconnect();
      });

      return () => {
        off('auth_required');
        off('session_invalid');
      };
    } else if (status === 'unauthenticated') {
      // Disconnect when user logs out
      disconnect();
    }
  }, [status, session, identifyUser, setMetadata, disconnect, on, off]);

  return {
    socket,
    isConnected,
    isAuthenticated: status === 'authenticated',
    user: session?.user || null,
  };
}

/**
 * Protected WebSocket API Handler Example
 * 
 * Place this at: pages/api/examples/authenticated-notifications.ts
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/pages/api/auth/[...nextauth]';
import {
  getSocketIOInstance,
  getConnectedSocketCount,
  getRoomSockets,
} from '@/utils/websocket';

export async function getAuthenticatedNotificationsHandler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify user is authenticated
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const io = getSocketIOInstance(res);
  if (!io) {
    return res.status(500).json({ error: 'WebSocket not initialized' });
  }

  const { action } = req.query;
  const userId = session.user?.id || session.user?.email;

  if (action === 'notify_self') {
    // Send notification to current user only
    io.to(`user_${userId}`).emit('personal_notification', {
      title: req.body.title,
      message: req.body.message,
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true });
  }

  if (action === 'stats') {
    // Get WebSocket stats for authenticated user
    const totalConnected = getConnectedSocketCount(io);
    const userSockets = getRoomSockets(io, `user_${userId}`);

    return res.json({
      totalConnected,
      userSocketCount: userSockets.length,
      userId,
    });
  }

  res.status(400).json({ error: 'Invalid action' });
}

/**
 * Authenticated Chat Component Example
 */

export function AuthenticatedChatComponent() {
  const { socket, isConnected, isAuthenticated, user } =
    useAuthenticatedWebSocket();

  if (!isAuthenticated) {
    return <div>Please log in to use chat</div>;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-4">
        {user?.image && (
          <img
            src={user.image}
            alt={user.name}
            className="h-10 w-10 rounded-full"
          />
        )}
        <div>
          <p className="font-semibold">{user?.name}</p>
          <p className="text-sm text-gray-600">{user?.email}</p>
        </div>
        <div className="ml-auto">
          <div
            className={`h-3 w-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="ml-2 text-sm">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Chat content here */}
    </div>
  );
}

/**
 * WebSocket Middleware for Next.js API Routes
 * 
 * Usage:
 * export default withWebSocketAuth(handler);
 */

export function withWebSocketAuth(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Verify session
    const session = await getServerSession(req, res, authOptions);

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Attach session to request for handler use
    (req as any).session = session;

    // Initialize WebSocket if needed
    const io = getSocketIOInstance(res);
    if (!io) {
      // Try to initialize
      const { initializeSocketIO } = await import('@/utils/websocket/server');
      initializeSocketIO(req, res);
    }

    return handler(req, res);
  };
}

/**
 * Example usage of authentication middleware
 * 
 * export default withWebSocketAuth(myHandler);
 */
