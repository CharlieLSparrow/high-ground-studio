'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';

export function WakeLockManager() {
  const [isWakeLockSupported, setIsWakeLockSupported] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [isNativeBridge, setIsNativeBridge] = useState(true);

  useEffect(() => {
    // Check if we are running inside the native iOS wrapper
    const hasBridge = typeof window !== 'undefined' && 
                      (window as any).webkit?.messageHandlers?.recorderControl;
    setIsNativeBridge(!!hasBridge);

    if (!hasBridge && 'wakeLock' in navigator) {
      setIsWakeLockSupported(true);
      requestWakeLock();

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          requestWakeLock();
        }
      };
      
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, []);

  const requestWakeLock = async () => {
    try {
      const wakeLock = await navigator.wakeLock.request('screen');
      setWakeLockActive(true);
      wakeLock.addEventListener('release', () => {
        setWakeLockActive(false);
      });
    } catch (err) {
      console.error('Failed to acquire wake lock:', err);
      setWakeLockActive(false);
    }
  };

  if (isNativeBridge) return null;

  return (
    <div className="bg-orange-500 text-white p-3 text-sm font-medium flex items-start gap-2 shadow-sm z-50 relative">
      <AlertCircle className="w-5 h-5 shrink-0" />
      <div>
        <strong>Mobile Web Fallback Active.</strong><br/>
        Keep this screen unlocked and open while recording. iOS Safari will silently drop audio if the screen locks.
        {!wakeLockActive && isWakeLockSupported && (
          <p className="mt-1 text-orange-200">Warning: Screen wake lock failed.</p>
        )}
      </div>
    </div>
  );
}
