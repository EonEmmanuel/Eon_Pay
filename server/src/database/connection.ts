import { Socket } from "node:net";
import type { PoolConfig } from "pg";

const supabaseDirectHostPattern = /^db\.[a-z0-9]+\.supabase\.co$/i;

function usesSupabaseDirectConnection(connectionString: string): boolean {
  return supabaseDirectHostPattern.test(new URL(connectionString).hostname);
}

function createIpv6Socket(): Socket {
  const socket = new Socket();
  const connect = socket.connect.bind(socket);

  socket.connect = ((port: number, host: string, callback?: () => void): Socket =>
    connect({ port, host, family: 6 }, callback)) as typeof socket.connect;

  return socket;
}

export function postgresPoolConfig(
  connectionString: string,
  config: Omit<PoolConfig, "connectionString" | "stream"> = {},
): PoolConfig {
  return {
    ...config,
    connectionString,
    ...(usesSupabaseDirectConnection(connectionString)
      ? { stream: createIpv6Socket }
      : {}),
  };
}
