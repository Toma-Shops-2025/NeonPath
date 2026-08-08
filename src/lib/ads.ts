// Neon Path - High Performance Ad Engine
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";

const isNative = () => Capacitor.isNativePlatform();
const UNITY_GAME_ID = "6168869"; // Temporarily using BingoX ID, you can update this later

declare global {
  interface Window {
    unityads?: any;
  }
}

/** Initialize and Load Ads */
export async function initAds(): Promise<void> {
  if (!isNative()) return;

  const startInit = () => {
    if (window.unityads && typeof window.unityads.initialize === 'function') {
      window.unityads.initialize(UNITY_GAME_ID, false, () => {
        console.log("✅ Unity Ads Ready - Neon Path");
        if (typeof window.unityads.load === 'function') {
            window.unityads.load("Rewarded_Android");
            window.unityads.load("Interstitial_Android");
            window.unityads.load("Banner_Android");
        }
      });
    }
  };

  if (window.unityads) startInit();
  else document.addEventListener("deviceready", startInit, { once: true });
}

/** Show a rewarded ad with Auto-Reload */
export async function showRewardedAd(): Promise<{ success: boolean }> {
  if (!isNative()) {
      return new Promise((resolve) => {
          toast.info("Simulating Video Ad (Web)");
          setTimeout(() => resolve({ success: true }), 2000);
      });
  }

  return new Promise((resolve) => {
    if (!window.unityads || typeof window.unityads.show !== 'function') {
      toast.error("Ad Engine not ready");
      initAds();
      resolve({ success: false });
      return;
    }

    window.unityads.show("Rewarded_Android", (res: any) => {
      if (typeof window.unityads.load === 'function') {
          window.unityads.load("Rewarded_Android");
      }
      if (res === "COMPLETED") {
        resolve({ success: true });
      } else {
        toast.error("Video skipped - no reward");
        resolve({ success: false });
      }
    });
  });
}

/** Show an interstitial */
export async function showInterstitial(): Promise<void> {
    if (!isNative()) return;
    if (!window.unityads || typeof window.unityads.show !== 'function') return;

    window.unityads.show("Interstitial_Android", () => {
        if (typeof window.unityads.load === 'function') {
            window.unityads.load("Interstitial_Android");
        }
    });
}

/** Show/Hide Banner Ad */
export function setBannerVisible(visible: boolean): void {
    if (!isNative() || !window.unityads) return;

    try {
        if (visible) {
            if (typeof window.unityads.showBanner === 'function') {
                window.unityads.showBanner("Banner_Android");
            }
        } else {
            if (typeof window.unityads.hideBanner === 'function') {
                window.unityads.hideBanner();
            }
        }
    } catch (e) {
        console.error("Banner Ad Error:", e);
    }
}
