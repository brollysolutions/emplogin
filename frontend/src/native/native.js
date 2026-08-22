/* ══════════════════════════════════════════════════════════════
   Native (Capacitor) integration.
   --------------------------------------------------------------
   Everything here is a no-op in a browser, so login.jsx can call it
   unconditionally and the web build behaves exactly as it did before.
   Only the Android app takes the native paths.
-------------------------------------------------------------- */
import { Capacitor } from "@capacitor/core";

export const isNativeApp = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/**
 * Wires up the Android hardware back button, the status bar, and the splash
 * screen. Returns a cleanup function.
 *
 * @param {object}   opts
 * @param {Function} opts.onBackPressed  Called for each back press. Return true
 *                                       if the app consumed it (a page or modal
 *                                       was closed); return false to let the
 *                                       app move to the background.
 */
export async function initNative({ onBackPressed } = {}) {
  if (!isNativeApp()) return () => {};

  const cleanups = [];

  try {
    const { App: CapApp } = await import("@capacitor/app");

    // Android's back button must never silently drop an employee out of a
    // running shift. It closes whatever is open; failing that it backgrounds
    // the app, the same as pressing Home. It never calls exitApp(), because
    // killing the WebView mid-shift is exactly the surprise to avoid.
    const handle = await CapApp.addListener("backButton", () => {
      let consumed = false;
      try {
        consumed = Boolean(onBackPressed && onBackPressed());
      } catch (e) {
        console.error("back button handler failed", e);
      }
      if (!consumed) CapApp.minimizeApp();
    });
    cleanups.push(() => handle.remove());
  } catch (e) {
    console.error("App plugin unavailable", e);
  }

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Light }); // dark icons on light bar
  } catch {
    /* status bar plugin is optional; ignore on devices that lack it */
  }

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* splash may already be hidden */
  }

  return () => cleanups.forEach((fn) => fn());
}
