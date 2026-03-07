/**
 * WebSocket Proxy API Route
 * 
 * This endpoint proxies WebSocket connections from clients to DIAL_API_HOST
 * All messages are transparently forwarded between client and backend
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { Server, type Socket } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: any;
}

interface ProxySocket {
  clientSocket: ClientSocket | null;
  clientId?: string;
  headers?: Record<string, string>;
}

const DIAL_API_HOST = process.env.DIAL_API_HOST;
const DIAL_API_KEY = process.env.DIAL_API_KEY;

export default function handler(
  _req: NextApiRequest,
  res: NextApiResponseWithSocket
) {
  // Validate DIAL_API_HOST is configured
  if (!DIAL_API_HOST) {
    console.error('[WebSocket Proxy] DIAL_API_HOST is not configured');
    res.status(500).json({ error: 'WebSocket proxy not configured' });
    return;
  }

  // Check if socket.io server already exists
  if (res.socket?.server?.io) {
    console.log('[WebSocket Proxy] Socket.IO server already initialized');
    res.end();
    return;
  }

  console.log('[WebSocket Proxy] Initializing proxied Socket.IO server');
  console.log('[WebSocket Proxy] Backend host:', DIAL_API_HOST);

  const httpServer = res.socket?.server;
  const io = new Server(httpServer, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin:
        process.env.NEXT_PUBLIC_WEBSOCKET_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        '*',
      credentials: true,
    },
    maxHttpBufferSize: 1e6,
    pingInterval: 30000,
    pingTimeout: 60000,
  });

  httpServer.io = io;

  // Handle client connections and proxy them to DIAL API
  io.on('connection', (clientSocket: Socket) => {
    console.log(`[WebSocket Proxy] Client connected: ${clientSocket.id}`);

    const proxyState: ProxySocket = {
      clientSocket: null,
      clientId: clientSocket.id,
      headers: {},
    };

    // Extract authentication headers from the client connection
    const authHeaderValue = clientSocket.handshake?.headers?.authorization;
    if (typeof authHeaderValue === 'string') {
      proxyState.headers = { authorization: authHeaderValue };
    }

    // Add API key if configured
    if (DIAL_API_KEY) {
      proxyState.headers = { ...proxyState.headers, 'api-key': DIAL_API_KEY };
    }

    // Create connection to backend DIAL API
    const createBackendConnection = (): void => {
      console.log(`[WebSocket Proxy] Connecting to backend: ${clientSocket.id}`);

      proxyState.clientSocket = ioClient(DIAL_API_HOST, {
        path: '/api/socket',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        auth: proxyState.headers as Record<string, string>,
        extraHeaders: proxyState.headers as Record<string, string>,
      });

      // Forward events from backend to client
      proxyState.clientSocket.on('connect', () => {
        console.log(`[WebSocket Proxy] Backend connected: ${clientSocket.id}`);
        clientSocket.emit('proxy_connected', {
          backendConnected: true,
        });
      });

      proxyState.clientSocket.on('disconnect', (reason: string) => {
        console.log(
          `[WebSocket Proxy] Backend disconnected: ${clientSocket.id} (${reason})`
        );
        clientSocket.emit('proxy_disconnected', { reason });
      });

      proxyState.clientSocket.on('error', (error: unknown) => {
        console.error(
          `[WebSocket Proxy] Backend error for ${clientSocket.id}:`,
          error
        );
        clientSocket.emit('proxy_error', { 
          error: error instanceof Error ? error.message : String(error) 
        });
      });

      // Forward all other events from backend to client
      proxyState.clientSocket.onAny((event: string, ...args: unknown[]) => {
        if (
          !['connect', 'disconnect', 'error', 'connect_error'].includes(event)
        ) {
          console.log(`[WebSocket Proxy] Backend -> Client: ${event}`);
          clientSocket.emit(event, ...args);
        }
      });
    };

    // Create initial backend connection
    createBackendConnection();

    // Forward client events to backend
    clientSocket.onAny((event: string, ...args: unknown[]) => {
      if (
        !['connect', 'disconnect', 'error'].includes(event) &&
        !event.startsWith('proxy_')
      ) {
        if (proxyState.clientSocket?.connected) {
          console.log(
            `[WebSocket Proxy] Client -> Backend: ${event} (${clientSocket.id})`
          );
          proxyState.clientSocket.emit(event, ...args);
        } else {
          console.warn(
            `[WebSocket Proxy] Backend not connected for event: ${event}`
          );
        }
      }
    });

    // Handle client reconnection request
    clientSocket.on('reconnect_backend', () => {
      console.log(
        `[WebSocket Proxy] Reconnect requested: ${clientSocket.id}`
      );
      if (proxyState.clientSocket) {
        proxyState.clientSocket.disconnect();
      }
      createBackendConnection();
    });

    // Handle client disconnect
    clientSocket.on('disconnect', (reason: string) => {
      console.log(
        `[WebSocket Proxy] Client disconnected: ${clientSocket.id} (${reason})`
      );

      // Clean up backend connection
      if (proxyState.clientSocket) {
        proxyState.clientSocket.disconnect();
        proxyState.clientSocket = null;
      }
    });
  });

  res.end();
}
