/**
 * WebSocket Example: Chat Room Component
 * 
 * This is a complete example of how to use the WebSocket functionality
 * in your React components.
 */

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface ChatMessage {
  userId: string;
  socketId: string;
  message: string;
  timestamp: string;
}

export function ChatRoomExample() {
  const [room, setRoom] = useState('default-room');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [userId, setUserId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize WebSocket connection
  const {
    socket,
    isConnected,
    proxyConnected,
    isConnecting,
    error,
    proxyError,
    joinRoom,
    leaveRoom,
    sendToRoom,
    identifyUser,
    reconnectBackend,
  } = useWebSocket({
    autoConnect: true,
    reconnection: true,
  });

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Set up message listener and identify user
  useEffect(() => {
    if (!isConnected || !socket) return;

    // Generate a temporary user ID if not set
    if (!userId) {
      const tempUserId = `user_${Math.random().toString(36).substr(2, 9)}`;
      setUserId(tempUserId);
      identifyUser(tempUserId);
    } else {
      identifyUser(userId);
    }

    // Listen for incoming room messages
    socket.on('room_message', (payload: ChatMessage) => {
      setMessages((prev: ChatMessage[]) => [...prev, payload]);
    });

    // Listen for user join events
    socket.on('user_joined', (data: unknown) => {
      console.log('User joined:', data);
    });

    // Listen for user leave events
    socket.on('user_left', (data: unknown) => {
      console.log('User left:', data);
    });

    return () => {
      socket.off('room_message');
      socket.off('user_joined');
      socket.off('user_left');
    };
  }, [isConnected, socket, userId, identifyUser]);

  // Join room when selected
  const handleJoinRoom = async () => {
    if (room && proxyConnected) {
      const success = await joinRoom(room);
      if (success) {
        setMessages([]); // Clear messages when joining new room
        console.log(`Joined room: ${room}`);
      }
    }
  };

  // Send message to room
  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!inputValue.trim() || !proxyConnected) return;

    sendToRoom(room, {
      text: inputValue,
      timestamp: new Date().toISOString(),
    });

    setInputValue('');
  };

  if (error || proxyError) {
    return (
      <div className="rounded-lg border border-red-500 bg-red-50 p-4">
        <h3 className="font-semibold text-red-800">Connection Error</h3>
        <p className="text-sm text-red-700">
          {error?.message || proxyError || 'Unknown error'}
        </p>
        {socket && (
          <button
            onClick={reconnectBackend}
            className="mt-2 rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
          >
            Retry Connection
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow">
      {/* Status Bar */}
      <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${
                isConnected ? 'bg-blue-500' : 'bg-red-500'
              }`}
            />
            <span className="text-xs font-medium text-gray-600">
              {isConnecting ? 'Proxy Connecting...' : isConnected ? 'Proxy Connected' : 'Proxy Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${
                proxyConnected ? 'bg-green-500' : 'bg-orange-500'
              }`}
            />
            <span className="text-xs font-medium text-gray-600">
              {proxyConnected ? 'Backend Connected' : 'Backend Connecting...'}
            </span>
          </div>
        </div>
        {userId && (
          <span className="text-xs text-gray-600">ID: {userId}</span>
        )}
      </div>

      {/* Room Selection */}
      <div className="flex gap-2">
        <input
          type="text"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          placeholder="Enter room name"
        />
        <button
          onClick={handleJoinRoom}
          disabled={!proxyConnected}
          className="rounded bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:bg-gray-400"
          title={proxyConnected ? '' : 'Waiting for backend connection...'}
        >
          Join Room
        </button>
      </div>

      {/* Messages Display */}
      <div className="h-80 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-gray-500">
            No messages yet. Start the conversation!
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg, idx) => {
              const msgContent = msg.message as any;
              return (
                <div
                  key={idx}
                  className="rounded-lg bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-600">
                      {msg.userId || 'Anonymous'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    {msgContent?.text || JSON.stringify(msgContent)}
                  </p>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={!proxyConnected}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
          placeholder="Type a message..."
        />
        <button
          type="submit"
          disabled={!proxyConnected || !inputValue.trim()}
          className="rounded bg-green-500 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:bg-gray-400"
        >
          Send
        </button>
      </form>
    </div>
  );
}
