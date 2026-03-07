# WebSocket Support Implementation Guide

This guide covers the WebSocket (Socket.IO) implementation for the AI Dial Chat Next.js project.

## Overview

WebSocket support has been implemented using **Socket.IO**, which provides:
- Real-time bidirectional communication
- Automatic reconnection handling
- Room-based messaging
- Fallback mechanisms (polling)
- Browser and Node.js compatibility
- **WebSocket proxy to DIAL_API_HOST** for backend integration

## Architecture

The WebSocket implementation uses a transparent proxy pattern:

```
Client Browser
    ↓
[useWebSocket Hook] ← Socket.IO Client
    ↓
[Next.js /api/socket endpoint] ← Socket.IO Server
    ↓ (proxies all events)
[DIAL_API_HOST WebSocket] ← Backend Server
```

All messages are transparently forwarded between client and DIAL API backend.

## Installation & Setup

### 1. Dependencies Added

Already installed in `package.json`:
- `socket.io` - Server-side WebSocket library
- `socket.io-client` - Client-side WebSocket library

### 2. File Structure

New files created:

```
apps/chat/src/
├── utils/websocket/
│   ├── index.ts              # Exports all WebSocket utilities
│   ├── types.ts              # TypeScript types and interfaces
│   └── server.ts             # Server-side WebSocket utilities
├── hooks/
│   └── useWebSocket.ts       # React hook for WebSocket client
├── pages/api/
│   └── socket.ts             # WebSocket initialization endpoint
├── pages/api/examples/
│   └── notifications.ts       # Example API endpoints
└── components/
    └── ChatRoomExample.tsx   # Example React component
```

## Quick Start

### Client-Side Usage (React Component)

```tsx
import { useWebSocket } from '@/hooks/useWebSocket';

export function MyComponent() {
  const {
    isConnected,
    sendToRoom,
    joinRoom,
    socket,
    on,
  } = useWebSocket({
    autoConnect: true,
    reconnection: true,
  });

  useEffect(() => {
    if (isConnected) {
      joinRoom('my-room');
    }
  }, [isConnected]);

  useEffect(() => {
    on('room_message', (data) => {
      console.log('Received:', data);
    });
  }, [on]);

  const sendMessage = () => {
    sendToRoom('my-room', { text: 'Hello!' });
  };

  return (
    <div>
      <button onClick={sendMessage} disabled={!isConnected}>
        Send Message
      </button>
    </div>
  );
}
```

### Server-Side Usage (API Route)

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { getSocketIOInstance, emitToRoom } from '@/utils/websocket';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const io = getSocketIOInstance(res);
  
  if (!io) {
    return res.status(500).json({ error: 'WebSocket not initialized' });
  }

  emitToRoom(io, 'my-room', 'event_name', {
    data: 'some value',
  });

  res.json({ success: true });
}
```

## API Reference

### useWebSocket Hook

React hook for managing WebSocket connections in components.

#### Options

```typescript
interface UseWebSocketOptions {
  url?: string;                    // WebSocket server URL (defaults to current origin)
  autoConnect?: boolean;           // Auto-connect on mount (default: true)
  reconnection?: boolean;          // Enable auto-reconnect (default: true)
  reconnectionDelay?: number;      // Initial reconnect delay in ms (default: 1000)
  reconnectionDelayMax?: number;   // Max reconnect delay in ms (default: 5000)
  reconnectionAttempts?: number;   // Max reconnection attempts (default: 5)
}
```

#### Return Value

```typescript
interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;            // Connected to proxy server
  isConnecting: boolean;           // Connection in progress
  proxyConnected: boolean;         // Connected to DIAL backend via proxy
  error: Error | null;             // Client connection error
  proxyError: string | null;       // Backend proxy error
  
  // Core methods
  send(event: string, data: unknown, callback?: (...args: unknown[]) => void): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler?: (...args: unknown[]) => void): void;
  emit(event: string, data: unknown): void;
  
  // Room operations
  joinRoom(room: string): Promise<boolean>;
  leaveRoom(room: string): Promise<boolean>;
  sendToRoom(room: string, message: unknown): void;
  
  // User management
  identifyUser(userId: string): void;
  setMetadata(metadata: Record<string, unknown>): void;
  
  // Proxy reconnection
  reconnectBackend(): void;        // Force reconnect to DIAL backend
  
  // Connection control
  disconnect(): void;
}
```

#### Key Properties Explained

- **`isConnected`**: True when client is connected to the Next.js proxy server
- **`proxyConnected`**: True when the proxy has successfully connected to DIAL_API_HOST
- **`error`**: Client-side connection errors (proxy connection issues)
- **`proxyError`**: Backend connection errors (DIAL API unreachable)

### Server-Side Functions

#### initializeSocketIO

Initialize Socket.IO server on the HTTP server.

```typescript
function initializeSocketIO(
  req: NextApiRequest,
  res: NextApiResponse,
  options?: WebSocketServerOptions
): Server;
```

#### getSocketIOInstance

Get existing Socket.IO instance.

```typescript
function getSocketIOInstance(res: NextApiResponse): Server | null;
```

#### emitToSocket

Send event to specific socket.

```typescript
function emitToSocket(io: Server, socketId: string, event: string, data: unknown): void;
```

#### emitToRoom

Send event to all sockets in a room.

```typescript
function emitToRoom(io: Server, room: string, event: string, data: unknown): void;
```

#### broadcastEvent

Send event to all connected clients.

```typescript
function broadcastEvent(io: Server, event: string, data: unknown): void;
```

#### getRoomSockets

Get all socket IDs in a room.

```typescript
function getRoomSockets(io: Server, room: string): string[];
```

#### getConnectedSocketCount

Get total number of connected sockets.

```typescript
function getConnectedSocketCount(io: Server): number;
```

## Built-In Events

### Client Event Handlers

- **`connect`** - Fired when socket connects to proxy server
- **`disconnect`** - Fired when socket disconnects from proxy
- **`connect_error`** - Fired on proxy connection error
- **`error`** - Fired on any error
- **`proxy_connected`** - Fired when proxy connects to DIAL backend
- **`proxy_disconnected`** - Fired when proxy disconnects from DIAL backend
- **`proxy_error`** - Fired when DIAL backend has an error
- **`room_message`** - Fired when message is received from room
- **`user_joined`** - Fired when user joins room
- **`user_left`** - Fired when user leaves room

### Server Events (Triggered by Client)

- **`set_metadata`** - Set custom metadata for socket
- **`identify_user`** - Associate socket with user ID
- **`join_room`** - Join a room
- **`leave_room`** - Leave a room
- **`message_to_room`** - Send message to room
- **`reconnect_backend`** - Force reconnection to DIAL backend

## Examples

### Example 1: Chat Room Component

See [ChatRoomExample.tsx](./src/components/ChatRoomExample.tsx) for a complete chat example.

### Example 2: Real-Time Notifications

See [notifications.ts](./src/pages/api/examples/notifications.ts) for server-side notification examples.

## Environment Configuration

### Required Environment Variables

```bash
# DIAL backend WebSocket server (required for proxy to work)
DIAL_API_HOST=http://your-dial-api-host:port

# Optional: API key for DIAL backend authentication
DIAL_API_KEY=your-api-key-here
```

### Optional Environment Variables

```bash
# WebSocket URL (optional, defaults to current origin)
NEXT_PUBLIC_WEBSOCKET_URL=http://localhost:3000

# App URL (used as fallback for CORS)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Configuration Notes

- **DIAL_API_HOST**: Must be set for WebSocket proxy to function. The Next.js server will connect to this backend endpoint and proxy all WebSocket connections.
- **DIAL_API_KEY**: If your DIAL backend requires authentication, provide the API key here. It will be automatically included in all proxy connections.
- The proxy transparently forwards all events between client and backend, including authentication headers from the client.

## Proxy Connection Monitoring

### Checking Proxy Status

The hook provides separate states for client-proxy and proxy-backend connections:

```tsx
const {
  isConnected,      // Client ↔ Proxy connection
  proxyConnected,   // Proxy ↔ Backend connection
  error,            // Client connection errors
  proxyError,       // Backend connection errors
  reconnectBackend, // Force backend reconnection
} = useWebSocket();

// Wait for both connections to be established
useEffect(() => {
  if (proxyConnected) {
    // Safe to send messages now
    sendToRoom('my-room', { status: 'ready' });
  }
}, [proxyConnected, sendToRoom]);
```

### Handling Proxy Errors

```tsx
useEffect(() => {
  if (proxyError) {
    console.error('Backend connection failed:', proxyError);
    // Show error to user
    // Optionally try to reconnect
  }
}, [proxyError]);

// Force reconnection to backend
const handleReconnect = () => {
  reconnectBackend();
};
```

### Monitoring Proxy Health

```tsx
export function ProxyHealthMonitor() {
  const { isConnected, proxyConnected, error, proxyError } = useWebSocket();

  const getStatus = () => {
    if (!isConnected) return 'Not connected to proxy';
    if (!proxyConnected) return 'Connecting to backend...';
    if (proxyError) return `Backend error: ${proxyError}`;
    if (error) return `Connection error: ${error.message}`;
    return 'Fully connected';
  };

  return <div>Status: {getStatus()}</div>;
}
```

## Advanced Usage

### Custom Event Handling

```tsx
const { socket, on, off } = useWebSocket();

useEffect(() => {
  const handleCustomEvent = (data) => {
    console.log('Custom event:', data);
  };

  on('my_custom_event', handleCustomEvent);

  return () => {
    off('my_custom_event', handleCustomEvent);
  };
}, [on, off]);
```

### Room Operations

```tsx
const { joinRoom, leaveRoom, sendToRoom } = useWebSocket();

async function switchRoom(newRoom: string) {
  await leaveRoom('old-room');
  await joinRoom(newRoom);
  sendToRoom(newRoom, { status: 'joined' });
}
```

### User Identification

```tsx
const { identifyUser, setMetadata } = useWebSocket();

useEffect(() => {
  if (isAuthenticated && user) {
    identifyUser(user.id);
    setMetadata({
      username: user.name,
      email: user.email,
      role: user.role,
    });
  }
}, [isAuthenticated, user, identifyUser, setMetadata]);
```

## Performance Considerations

1. **Connection Pooling**: Socket.IO maintains persistent connections, use wisely
2. **Room Organization**: Organize sockets into logical rooms for targeted messaging
3. **Message Size**: Keep individual messages reasonably sized
4. **Event Naming**: Use consistent, namespaced event names
5. **Memory**: Monitor connected socket count for memory usage

## Troubleshooting

### Proxy Not Connecting to Backend

Check that `DIAL_API_HOST` is properly configured:

```bash
# Make sure DIAL_API_HOST is set in your environment
echo $DIAL_API_HOST
# Should output: http://your-backend:port

# Verify the backend is reachable
curl -v http://your-backend:port/health
```

Check proxy error state:

```typescript
const { proxyConnected, proxyError } = useWebSocket();

if (proxyError) {
  console.error('Backend connection error:', proxyError);
  // Could be due to:
  // - DIAL_API_HOST not set or invalid
  // - Backend server is down
  // - Network connectivity issue
  // - Wrong DIAL_API_KEY
}
```

### Messages Not Being Forwarded

Ensure the proxy has connected to backend:

```typescript
const { proxyConnected, sendToRoom } = useWebSocket();

// Don't send messages until proxy is fully connected
if (proxyConnected) {
  sendToRoom('my-room', message);
} else {
  console.warn('Waiting for backend connection...');
}
```

### Connection Issues

```typescript
const { error, isConnecting, proxyConnected } = useWebSocket();

if (error) {
  console.error('Proxy connection failed:', error);
}

if (proxyConnected) {
  // Connection successful, you can use WebSocket
}
```

### CORS Errors

Update `NEXT_PUBLIC_WEBSOCKET_URL` environment variable to match your server origin.

### Room Messages Not Delivered

Ensure socket has joined the room and backend is connected:

```typescript
const { proxyConnected } = useWebSocket();

const joined = await joinRoom('my-room');
if (joined && proxyConnected) {
  sendToRoom('my-room', message);
} else {
  console.warn('Cannot send: room not joined or backend not connected');
}
```

### Backend Connection Drops

Use the manual reconnection method:

```typescript
const { reconnectBackend, proxyError } = useWebSocket();

useEffect(() => {
  if (proxyError) {
    // Try reconnecting
    const timer = setTimeout(reconnectBackend, 5000);
    return () => clearTimeout(timer);
  }
}, [proxyError, reconnectBackend]);
```

## Testing WebSocket

### Manual Testing with curl/API Client

```bash
# Get connection stats
curl http://localhost:3000/api/examples/notifications?action=stats

# Broadcast message
curl -X POST http://localhost:3000/api/examples/notifications?action=broadcast \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{"message":"Hello"}}'

# Notify specific user
curl -X POST http://localhost:3000/api/examples/notifications?action=notify_user \
  -H "Content-Type: application/json" \
  -d '{"userId":"user_123","title":"Alert","message":"Test"}'
```

## Security Considerations

1. **Authentication**: Always authenticate users before allowing socket connections
2. **Authorization**: Validate room access before joining
3. **Rate Limiting**: Implement rate limiting on message events
4. **Input Validation**: Validate all incoming data
5. **CORS**: Properly configure CORS origins for your domain

## Next Steps

1. Review [ChatRoomExample.tsx](./src/components/ChatRoomExample.tsx) for usage patterns
2. Check [notifications.ts](./src/pages/api/examples/notifications.ts) for server APIs
3. Integrate WebSocket into your specific features
4. Handle authentication in socket connection lifecycle
5. Add error handling and logging as needed

## Additional Resources

- [Socket.IO Documentation](https://socket.io/docs/)
- [Socket.IO Client Documentation](https://socket.io/docs/client-api/)
- [Next.js API Routes](https://nextjs.org/docs/api-routes/introduction)
