import { useState, useEffect, useCallback, useRef } from 'react';

export type RecorderState = 'READY' | 'RECORDING' | 'PAUSED' | 'STOPPED' | 'ERROR';
export type UploadState = 'IDLE' | 'SAVING_LOCALLY' | 'UPLOADING' | 'UPLOADED' | 'FAILED';

export interface RecorderEventDetail {
  state?: RecorderState;
  durationMs?: number;
  progress?: number;
  mediaAssetId?: string;
  errorMessage?: string;
}

export function useNativeRecorderBridge(projectSlug: string, episodeSlug: string) {
  const [recorderState, setRecorderState] = useState<RecorderState>('READY');
  const [uploadState, setUploadState] = useState<UploadState>('IDLE');
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const [hasNativeBridge, setHasNativeBridge] = useState(false);
  
  const stateRef = useRef(recorderState);
  useEffect(() => {
    stateRef.current = recorderState;
  }, [recorderState]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTimestampRef = useRef<number | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');

  useEffect(() => {
    if (typeof MediaRecorder !== 'undefined') {
      const types = ['audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
      for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeTypeRef.current = type;
          break;
        }
      }
    }
  }, []);

  const performUpload = useCallback(async (blob: Blob, startedAt: number, stoppedAt: number) => {
    setUploadState('UPLOADING');
    setError(null);
    
    const formData = new FormData();
    const ext = mimeTypeRef.current.split('/')[1] || 'webm';
    formData.append('file', blob, `take-${Date.now()}.${ext}`);
    formData.append('projectSlug', projectSlug);
    formData.append('episodeSlug', episodeSlug);
    formData.append('importRole', 'phone-audio');
    
    formData.append('startedAt', startedAt.toString());
    formData.append('stoppedAt', stoppedAt.toString());
    formData.append('userAgent', navigator.userAgent);
    
    try {
      const res = await fetch('/api/episode-production/import-media', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to import media to episode.');
      }
      
      console.log('Upload successful:', data);
      setUploadState('UPLOADED');
      
      window.dispatchEvent(new CustomEvent('nativeRecorderState', {
        detail: { type: 'UPLOAD_COMPLETE', detail: { mediaAssetId: data.importedAsset?.id || 'beta-fallback-mock-asset' } }
      }));
    } catch (uploadErr: any) {
      console.error('Web Fallback Upload error:', uploadErr);
      setUploadState('FAILED');
      setError(uploadErr.message || 'Recording upload failed. Keep this page open to retry.');
    }
  }, [projectSlug, episodeSlug]);

  useEffect(() => {
    const hasBridge = typeof window !== 'undefined' && !!(window as any).webkit?.messageHandlers?.recorderControl;
    setHasNativeBridge(hasBridge);

    const handleNativeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ detail: RecorderEventDetail; type: string }>;
      const { type, detail } = customEvent.detail;
      
      if (type === 'STATE_CHANGE' && detail.state) {
        setRecorderState(detail.state);
        if (detail.durationMs !== undefined) {
          setDurationMs(detail.durationMs);
        }
      } else if (type === 'ERROR') {
        setRecorderState('ERROR');
        setError(detail.errorMessage || 'Unknown recording error');
      } else if (type === 'UPLOAD_COMPLETE') {
        setUploadState('UPLOADED');
      }
    };

    window.addEventListener('nativeRecorderState', handleNativeEvent);
    return () => {
      window.removeEventListener('nativeRecorderState', handleNativeEvent);
    };
  }, []);

  const sendCommand = useCallback(async (action: 'START' | 'STOP' | 'PAUSE' | 'RESUME' | 'MARK_BREAK') => {
    const current = stateRef.current;
    
    if (action === 'START' && current !== 'READY' && current !== 'STOPPED') return;
    if (action === 'STOP' && current !== 'RECORDING' && current !== 'PAUSED') return;
    if (action === 'PAUSE' && current !== 'RECORDING') return;
    if (action === 'RESUME' && current !== 'PAUSED') return;
    
    if (hasNativeBridge) {
      (window as any).webkit.messageHandlers.recorderControl.postMessage({ action });
    } else {
      try {
        if (action === 'START') {
          setDurationMs(0);
          setUploadState('IDLE');
          setError(null);
          blobRef.current = null;
          chunksRef.current = [];
          
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
          mediaRecorderRef.current = mediaRecorder;
          
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunksRef.current.push(e.data);
            }
          };

          mediaRecorder.onstop = async () => {
            setUploadState('SAVING_LOCALLY');
            const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
            blobRef.current = blob;
            const stoppedAt = Date.now();
            const startedAt = startTimestampRef.current || stoppedAt;
            
            stream.getTracks().forEach(track => track.stop());
            
            await performUpload(blob, startedAt, stoppedAt);
          };

          mediaRecorder.start(1000);
          startTimestampRef.current = Date.now();
          setRecorderState('RECORDING');
          
        } else if (action === 'PAUSE' && mediaRecorderRef.current) {
          mediaRecorderRef.current.pause();
          setRecorderState('PAUSED');
          
        } else if (action === 'RESUME' && mediaRecorderRef.current) {
          mediaRecorderRef.current.resume();
          setRecorderState('RECORDING');
          
        } else if (action === 'STOP' && mediaRecorderRef.current) {
          mediaRecorderRef.current.stop();
          setRecorderState('STOPPED');
          
        } else if (action === 'MARK_BREAK') {
          console.log('Break marked in web fallback.');
        }
      } catch (err: any) {
        console.error('Web Fallback MediaRecorder error:', err);
        setRecorderState('ERROR');
        setError(err.message || 'Microphone access denied');
      }
    }
  }, [hasNativeBridge, performUpload]);

  const retryUpload = useCallback(() => {
    if (blobRef.current) {
      const stoppedAt = Date.now();
      const startedAt = startTimestampRef.current || stoppedAt;
      performUpload(blobRef.current, startedAt, stoppedAt);
    }
  }, [performUpload]);

  return {
    recorderState,
    uploadState,
    durationMs,
    error,
    hasNativeBridge,
    start: useCallback(() => sendCommand('START'), [sendCommand]),
    stop: useCallback(() => sendCommand('STOP'), [sendCommand]),
    pause: useCallback(() => sendCommand('PAUSE'), [sendCommand]),
    resume: useCallback(() => sendCommand('RESUME'), [sendCommand]),
    markBreak: useCallback(() => sendCommand('MARK_BREAK'), [sendCommand]),
    retryUpload
  };
}
