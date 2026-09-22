// Simple in-memory stream state for Docker environments
// This persists stream status across page refreshes within the same container

interface StreamState {
  [streamId: number]: {
    status: 'running' | 'stopped' | 'error';
    startedAt: string;
    lastChecked: string;
  };
}

// Global state that persists during the container lifetime
const globalStreamState: StreamState = {};

export function setStreamRunning(streamId: number, originalStartedAt?: string) {
  const startedAt = originalStartedAt || globalStreamState[streamId]?.startedAt || new Date().toISOString();
  globalStreamState[streamId] = {
    status: 'running',
    startedAt,
    lastChecked: new Date().toISOString(),
  };
}

export function setStreamStopped(streamId: number) {
  if (globalStreamState[streamId]) {
    globalStreamState[streamId].status = 'stopped';
    globalStreamState[streamId].lastChecked = new Date().toISOString();
  }
}

export function getStreamState(streamId: number) {
  return globalStreamState[streamId];
}

export function getAllStreamStates() {
  return globalStreamState;
}

export function isStreamRunning(streamId: number): boolean {
  const state = globalStreamState[streamId];
  return state?.status === 'running';
}