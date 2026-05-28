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
      <div 
        className="panel" 
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          border: "1px dashed rgba(255,255,255,0.15)",
          borderRadius: "var(--border-radius, 12px)",
          minHeight: "120px",
          textAlign: "center",
          backgroundColor: "rgba(255,255,255,0.02)"
        }}
      >
        <span className="section-label" style={{ marginBottom: "0.5rem" }}>AdSlot Placeholder</span>
        <p className="panel-copy" style={{ fontSize: "11px", margin: 0, opacity: 0.5 }}>
          Enable NEXT_PUBLIC_ADSENSE_BANNER_ADS_ENABLED to view live ads.
        </p>
      </div>
    );
  }

  return (
    <div 
      className="panel" 
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "1rem",
        overflow: "hidden",
        backgroundColor: "rgba(0,0,0,0.2)",
        borderRadius: "var(--border-radius, 12px)"
      }}
    >
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
