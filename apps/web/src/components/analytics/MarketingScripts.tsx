import Script from "next/script";
import { GoogleAnalytics } from "@next/third-parties/google";

function isEnabled(value: string | undefined) {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export default function MarketingScripts() {
  const gaMeasurementId = process.env.HGO_GA_MEASUREMENT_ID?.trim();
  const adsenseClient = process.env.GOOGLE_ADSENSE_CLIENT?.trim();
  const adsenseEnabled = isEnabled(process.env.HGO_ADSENSE_AUTO_ADS_ENABLED);

  return (
    <>
      {gaMeasurementId ? (
        <GoogleAnalytics gaId={gaMeasurementId} />
      ) : null}

      {adsenseClient && adsenseEnabled ? (
        <Script
          async
          crossOrigin="anonymous"
          id="hgo-google-adsense"
          src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
            adsenseClient,
          )}`}
          strategy="afterInteractive"
        />
      ) : null}
    </>
  );
}
