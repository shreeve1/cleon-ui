// =============================================================================
// useConnection Hook (Real CLI Integration)
// =============================================================================
// Manages connection state to the proxy server
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { getConnectionState } from '../api/proxy-client';
import type { ConnectionState } from '../types';

export interface UseConnectionReturn {
  connectionState: ConnectionState;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_CONNECTION_STATE: ConnectionState = {
  status: 'disconnected',
  model: undefined,
  workingDirectory: undefined,
  branch: undefined,
};

export function useConnection(): UseConnectionReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>(DEFAULT_CONNECTION_STATE);

  // Check connection status periodically
  useEffect(() => {
    let cancelled = false;
    let intervalId: NodeJS.Timeout | null = null;

    async function checkConnection() {
      try {
        const state = await getConnectionState();
        if (!cancelled) {
          setConnectionState(state);
        }
      } catch (error) {
        if (!cancelled) {
          setConnectionState({
            status: 'error',
            error: error instanceof Error ? error.message : 'Connection failed',
          });
        }
      }
    }

    // Check immediately
    checkConnection();

    // Then poll every 5 seconds
    intervalId = setInterval(checkConnection, 5000);

    return () => {
      cancelled = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  // Connect to proxy
  const connect = useCallback(() => {
    setConnectionState({ ...DEFAULT_CONNECTION_STATE, status: 'connecting' });
    // The actual connection check happens in the interval
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    setConnectionState(DEFAULT_CONNECTION_STATE);
  }, []);

  return {
    connectionState,
    connected: connectionState.status === 'connected',
    connect,
    disconnect,
  };
}
