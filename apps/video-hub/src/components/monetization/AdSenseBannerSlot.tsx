"use client";

import { useEffect, useState } from "react";

interface AdSenseBannerSlotProps {
  slotId: string;
  format?: "auto" | "fluid" | "rectangle";
}

export default function AdSenseBannerSlot({ slotId, format = "auto" }: AdSenseBannerSlotProps) {
  const adsenseClient = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_CLIENT;
  const isEnabled = process.env.NEXT_PUBLIC_ADSENSE_BANNER_ADS_ENABLED === "true";
  const [adLoaded, setAdLoaded] = useState(false);

  useEffect(() => {
    if (isEnabled && adsenseClient) {
      try {
        // @ts-ignore
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        setAdLoaded(true);
      } catch (err) {
        console.error("AdSense injection failed", err);
      }
    }
  }, [isEnabled, adsenseClient]);

  if (!isEnabled || !adsenseClient) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border border-rose-500/10 bg-rose-500/5 rounded-xl min-h-[120px] text-center font-mono">
        <span className="text-xs text-rose-450 font-semibold uppercase tracking-wider mb-1 font-display">AdSlot Placeholder</span>
        <span className="text-[10px] text-zinc-500">Enable NEXT_PUBLIC_ADSENSE_BANNER_ADS_ENABLED to view live ads.</span>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center py-4 overflow-hidden min-h-[100px] border border-zinc-900 bg-black/10 rounded-xl">
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "100%", textAlign: "center" }}
        data-ad-client={adsenseClient}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
