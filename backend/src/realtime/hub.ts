// A tiny channel-based pub/sub over WebSocket. The frontend opens one
// connection and subscribes to channels ("dispatch-queue", "agent-status",
// "campaign:<id>", "live-calls", "mission"). Any service can publish.
//
// In production you'd likely use Supabase Realtime or a dedicated pub/sub,
// but this keeps the whole app self-contained and runnable with zero
// external dependencies.

import type { WebSocket } from 'ws';

type Client = {
  socket: WebSocket;
  channels: Set<string>;
};

const clients = new Set<Client>();

export function registerClient(socket: WebSocket): Client {
  const client: Client = { socket, channels: new Set(['*']) };
  clients.add(client);

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'subscribe' && typeof msg.channel === 'string') {
        client.channels.add(msg.channel);
      } else if (msg.type === 'unsubscribe' && typeof msg.channel === 'string') {
        client.channels.delete(msg.channel);
      }
    } catch {
      /* ignore malformed */
    }
  });

  socket.on('close', () => clients.delete(client));
  socket.on('error', () => clients.delete(client));

  // greet
  safeSend(socket, JSON.stringify({ type: 'connected', t: Date.now() }));
  return client;
}

/** Publish an event to everyone subscribed to `channel` (or to "*"). */
export function publish(channel: string, event: string, data: unknown) {
  const payload = JSON.stringify({ type: 'event', channel, event, data, t: Date.now() });
  for (const client of clients) {
    if (client.channels.has(channel) || client.channels.has('*')) {
      safeSend(client.socket, payload);
    }
  }
}

function safeSend(socket: WebSocket, data: string) {
  try {
    if (socket.readyState === socket.OPEN) socket.send(data);
  } catch {
    /* ignore */
  }
}
