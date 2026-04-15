/**
 * useHaptics
 *
 * Wraps the Vibration API for native-feel feedback on mobile.
 * Silently no-ops on desktop or browsers that don't support it.
 *
 * Usage:
 *   const { tap, success, error, heavy } = useHaptics();
 *   tap();      // light 10ms tap — button presses
 *   success();  // double pulse — like, follow, purchase complete
 *   error();    // long buzz — failed action
 *   heavy();    // strong single — play/pause
 */
export function useHaptics() {
  const vibrate = (pattern) => {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch {}
  };

  return {
    tap:     () => vibrate(10),
    success: () => vibrate([10, 50, 10]),
    error:   () => vibrate(80),
    heavy:   () => vibrate(25),
    light:   () => vibrate(5),
  };
}
