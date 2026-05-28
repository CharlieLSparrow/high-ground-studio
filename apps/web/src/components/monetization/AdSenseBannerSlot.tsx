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
      <div className="flex flex-col items-center justify-center p-6 border border-white/10 bg-white/5 rounded-xl min-h-[120px] text-center font-mono">
        <span className="text-xs text-amber-500 font-semibold uppercase tracking-wider mb-1">AdSlot Placeholder</span>
        <span className="text-[10px] text-slate-500">Enable NEXT_PUBLIC_ADSENSE_BANNER_ADS_ENABLED to view live ads.</span>
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center py-4 overflow-hidden min-h-[100px] border border-white/10 bg-black/20 rounded-xl">
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
