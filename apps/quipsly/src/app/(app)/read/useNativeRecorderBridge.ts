import { useState, useEffect, useCallback, useRef } from 'react';

export type RecorderState = 'READY' | 'RECORDING' | 'PAUSED' | 'STOPPED' | 'ERROR';

export interface RecorderEventDetail {
  state?: RecorderState;
  durationMs?: number;
  progress?: number;
  mediaAssetId?: string;
  errorMessage?: string;
}

export function useNativeRecorderBridge() {
  const [recorderState, setRecorderState] = useState<RecorderState>('READY');
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Track if we are communicating with the real iOS bridge
  const [hasNativeBridge, setHasNativeBridge] = useState(false);
  
  // Use a ref to check current state inside callbacks without triggering re-renders
  const stateRef = useRef(recorderState);
  useEffect(() => {
    stateRef.current = recorderState;
  }, [recorderState]);

  useEffect(() => {
    const hasBridge = typeof window !== 'undefined' && !!(window as any).webkit?.messageHandlers?.recorderControl;
    setHasNativeBridge(hasBridge);

    const handleNativeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ detail: RecorderEventDetail; type: string }>;
      const { type, detail } = customEvent.detail;
      
      console.log('Received native event:', type, detail);
      
      if (type === 'STATE_CHANGE' && detail.state) {
        setRecorderState(detail.state);
        if (detail.durationMs !== undefined) {
          setDurationMs(detail.durationMs);
        }
      } else if (type === 'ERROR') {
        setRecorderState('ERROR');
        setError(detail.errorMessage || 'Unknown recording error');
      } else if (type === 'UPLOAD_COMPLETE') {
        console.log('Upload complete, media asset:', detail.mediaAssetId);
        // We could trigger a router.refresh() here to show the new clip
      }
    };

    window.addEventListener('nativeRecorderState', handleNativeEvent);
    return () => {
      window.removeEventListener('nativeRecorderState', handleNativeEvent);
    };
  }, []);

  const sendCommand = useCallback((action: 'START' | 'STOP' | 'PAUSE' | 'RESUME' | 'MARK_BREAK') => {
    const current = stateRef.current;
    
    // State machine guards to prevent invalid bridge commands
    if (action === 'START' && current !== 'READY' && current !== 'STOPPED') return;
    if (action === 'STOP' && current !== 'RECORDING' && current !== 'PAUSED') return;
    if (action === 'PAUSE' && current !== 'RECORDING') return;
    if (action === 'RESUME' && current !== 'PAUSED') return;
    
    console.log('Sending command to bridge:', action);
    
    if (hasNativeBridge) {
      (window as any).webkit.messageHandlers.recorderControl.postMessage({ action });
    } else {
      // Mock behavior for web fallback dev testing
      console.warn('Native bridge not found. Mocking command:', action);
      
      if (action === 'START' || action === 'RESUME') {
        setRecorderState('RECORDING');
      } else if (action === 'PAUSE') {
        setRecorderState('PAUSED');
      } else if (action === 'STOP') {
        setRecorderState('STOPPED');
      }
    }
  }, [hasNativeBridge]);

  return {
    recorderState,
    durationMs,
    error,
    hasNativeBridge,
    start: useCallback(() => sendCommand('START'), [sendCommand]),
    stop: useCallback(() => sendCommand('STOP'), [sendCommand]),
    pause: useCallback(() => sendCommand('PAUSE'), [sendCommand]),
    resume: useCallback(() => sendCommand('RESUME'), [sendCommand]),
    markBreak: useCallback(() => sendCommand('MARK_BREAK'), [sendCommand])
  };
}
