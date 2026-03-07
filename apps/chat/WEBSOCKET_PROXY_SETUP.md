# WebSocket Proxy Setup Guide

This guide covers setting up the WebSocket proxy to connect to your DIAL backend API.

## Quick Start

### 1. Set DIAL_API_HOST Environment Variable

```bash
# Add to apps/chat/.env.local
DIAL_API_HOST=http://your-dial-backend-host:port
```

**Example configurations:**

```bash
# Local development
DIAL_API_HOST=http://localhost:8080

# Docker container
DIAL_API_HOST=http://dial-backend:8080

# Remote server
DIAL_API_HOST=https://api.example.com

# With authentication
DIAL_API_KEY=your-api-key-here
```

### 2. Verify Backend is Reachable

```bash
# Test connectivity
curl http://your-dial-backend-host:port/health

# With API key if required
curl -H "api-key: your-api-key" http://your-dial-backend-host:port/health
```

### 3. Check Logs for Connection Status

```bash
# Browser console (client logs)
[WebSocket Proxy] Client connected
[WebSocket Proxy] Proxy backend connected

# Server logs (if DEBUG enabled)
[WebSocket Proxy] Initializing proxied Socket.IO server
[WebSocket Proxy] Backend host: http://localhost:8080
[WebSocket Proxy] Connecting to backend: socket-id
[WebSocket Proxy] Backend connected: socket-id
```

## Architecture Details

### Connection Flow

```
1. Browser → Next.js Frontend
   ↓
2. Next.js /api/socket (Socket.IO Server)
   ↓ (creates client connection to backend)
3. Next.js → DIAL Backend (Socket.IO Client)
   ↓
4. DIAL Backend processes events
   ↓ (sends response back)
5. Response proxied back to browser
```

### Authentication Flow

The proxy automatically forwards:
- Client authorization headers from browser
- DIAL_API_KEY environment variable (if set)
- Any custom metadata passed via `setMetadata()`

```typescript
// Client side
const { identifyUser, setMetadata } = useWebSocket();
identifyUser('user123'); // Forwarded to backend
setMetadata({ token: 'jwt-token', role: 'admin' }); // Forwarded to backend
```

## Troubleshooting

### Backend Not Connecting

**Symptoms:**
- `proxyConnected` remains false
- `proxyError` shows backend error message

**Solutions:**

1. **Verify DIAL_API_HOST is set:**
   ```bash
   echo $DIAL_API_HOST
   # Should show: http://your-backend:port
   ```

2. **Check backend is running:**
   ```bash
   curl -v http://your-dial-backend-host:port/health
   ```

3. **Check for CORS/connection issues:**
   - Backend firewall may be blocking the connection
   - Verify the backend accepts Socket.IO connections
   - Check backend logs for connection attempts

4. **Enable debug logging:**
   ```bash
   # Set in environment
   DEBUG=socket.io*
   ```

### Authentication Issues

**Symptoms:**
- Backend rejects connection with auth error
- Only some events get proxied

**Solutions:**

1. **Verify DIAL_API_KEY:**
   ```bash
   # Check it's set
   echo $DIAL_API_KEY
   ```

2. **Check backend auth requirements:**
   ```bash
   curl -H "api-key: $DIAL_API_KEY" http://your-backend:port/health
   ```

3. **Verify client auth headers:**
   ```tsx
   const { setMetadata } = useWebSocket();
   setMetadata({ 
     authorization: 'Bearer your-token',
     userId: 'user123'
   });
   ```

### Messages Not Being Proxied

**Symptoms:**
- Client connects successfully
- Backend connects successfully
- Messages sent from client don't reach backend

**Solutions:**

1. **Wait for full connection:**
   ```tsx
   const { proxyConnected, sendToRoom } = useWebSocket();
   
   // Don't send before backend connects
   if (proxyConnected) {
     sendToRoom('room', message);
   }
   ```

2. **Check message format:**
   ```tsx
   // Messages must be JSON-serializable
   sendToRoom('room', { text: 'hello' }); // ✓ Good
   sendToRoom('room', Object.create(null)); // ✗ Bad
   ```

3. **Check room subscription:**
   ```tsx
   const { joinRoom, proxyConnected } = useWebSocket();
   
   useEffect(() => {
     if (proxyConnected) {
       joinRoom('my-room'); // Must join before sending
     }
   }, [proxyConnected]);
   ```

### Intermittent Disconnections

**Symptoms:**
- `proxyConnected` becomes false unexpectedly
- Messages fail to send intermittently

**Solutions:**

1. **Implement reconnection handler:**
   ```tsx
   const { proxyError, reconnectBackend } = useWebSocket();
   
   useEffect(() => {
     if (proxyError) {
       console.log('Reconnecting after error...');
       const timer = setTimeout(reconnectBackend, 3000);
       return () => clearTimeout(timer);
     }
   }, [proxyError, reconnectBackend]);
   ```

2. **Check backend health:**
   - Verify backend isn't crashing
   - Check for resource limits
   - Review backend logs for errors

3. **Monitor connection metrics:**
   ```tsx
   useEffect(() => {
     const interval = setInterval(() => {
       console.log('isConnected:', isConnected);
       console.log('proxyConnected:', proxyConnected);
     }, 5000);
     return () => clearInterval(interval);
   }, [isConnected, proxyConnected]);
   ```

### Port/Network Issues

**Common ports by environment:**

| Environment | Typical Port | Example |
|------------|------------|---------|
| Local dev  | 8080       | http://localhost:8080 |
| Docker     | 8000-8080  | http://dial-backend:8080 |
| Production | 443        | https://api.example.com |

**Debug network connectivity:**

```bash
# Test port is open
nc -zv your-host port

# Trace route to backend
traceroute your-host

# Check if service is running
netstat -tlnp | grep port
```

## Configuration Examples

### Docker Compose Setup

```yaml
version: '3.8'
services:
  frontend:
    image: next-app
    environment:
      DIAL_API_HOST: http://backend:8080
    ports:
      - "3000:3000"
    depends_on:
      - backend

  backend:
    image: dial-api
    ports:
      - "8080:8080"
```

### Kubernetes Setup

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: next-app-config
data:
  DIAL_API_HOST: http://dial-backend-service:8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: next-app
spec:
  template:
    spec:
      containers:
      - name: app
        env:
        - name: DIAL_API_HOST
          valueFrom:
            configMapKeyRef:
              name: next-app-config
              key: DIAL_API_HOST
```

### Nginx Proxy Setup

```nginx
location /api/socket {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# WebSocket to backend should be direct
# Don't proxy through Nginx to avoid connection issues
```

## Performance Optimization

### Connection Pooling

The proxy maintains one persistent connection per client to the backend:

```typescript
// Good: Single persistent connection
const { socket } = useWebSocket({ autoConnect: true });

// Bad: Would create multiple connections
const { socket: socket1 } = useWebSocket();
const { socket: socket2 } = useWebSocket();
```

### Message Batching

For high-frequency messages, batch them:

```tsx
import { useState, useEffect } from 'react';

export function OptimizedChat() {
  const { sendToRoom } = useWebSocket();
  const [buffer, setBuffer] = useState<unknown[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (buffer.length > 0) {
        sendToRoom('chat', { messages: buffer });
        setBuffer([]);
      }
    }, 1000); // Send batched every second

    return () => clearInterval(interval);
  }, [buffer, sendToRoom]);

  const addMessage = (msg: unknown) => {
    setBuffer(prev => [...prev, msg]);
  };

  return null;
}
```

### Memory Management

```tsx
// Cleanup on unmount
useEffect(() => {
  const { disconnect } = useWebSocket();
  
  return () => {
    disconnect(); // Clean up connection
  };
}, []);
```

## Monitoring & Logging

### Enable Debug Logging

```bash
# Set environment variable
DEBUG=socket.io*

# Or in code
localStorage.debug = 'socket.io*:*';
```

### Custom Logging

```tsx
export function setupWebSocketLogging() {
  const { on, off } = useWebSocket();

  useEffect(() => {
    const handleAny = (event: string, ...args: unknown[]) => {
      console.log(`[WS] ${event}`, args);
    };

    on('*', handleAny);
    
    return () => off('*', handleAny);
  }, [on, off]);
}
```

### Metrics Collection

```tsx
export function useWebSocketMetrics() {
  const { socket, isConnected, proxyConnected } = useWebSocket();
  
  useEffect(() => {
    if (!socket) return;

    const metrics = {
      connectedAt: new Date(),
      messagesReceived: 0,
      messagesSent: 0,
      errors: 0,
    };

    const trackMessage = () => {
      metrics.messagesReceived++;
    };

    socket.onAny(trackMessage);

    return () => {
      console.log('WebSocket metrics:', metrics);
      socket.offAny(trackMessage);
    };
  }, [socket]);
}
```

## Next Steps

1. **Start with basic connectivity** - get DIAL_API_HOST working
2. **Test message forwarding** - send/receive simple messages
3. **Add authentication** - implement DIAL_API_KEY if needed
4. **Integrate into features** - use WebSocket in your components
5. **Monitor and optimize** - collect metrics and tune performance

## Additional Resources

- [WEBSOCKET_GUIDE.md](./WEBSOCKET_GUIDE.md) - Complete API reference
- [Socket.IO Documentation](https://socket.io/docs/)
- [DIAL API Documentation](https://dial-documentation.example.com/)
