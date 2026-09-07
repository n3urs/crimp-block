/** Every value copied verbatim from DailyCardView.swift. These are not
    taste calls — several were tuned against direct user feedback about
    the card feeling laggy or abrupt. Changing one is a behaviour change. */
export const Motion = {
  swipe: {
    minimumDistance: 10,
    horizontalClaimDx: 12,
    // Was 0.3 (verbatim from Swift) — 30% of the card's width is ~120pt
    // on a typical iPhone, and Oscar reported needing "quite a large
    // swipe" to browse sessions on the RN build specifically, asking to
    // "bring it down a little bit". Lowered here only (not touching the
    // Swift app) per that direct feedback; re-tune again if it now
    // over-fires on an incidental drag.
    commitFraction: 0.2,
    // Added for the fade redesign (replacing the old drag-follow +
    // slide-to-commit/spring-back animation): how long the OUTGOING
    // session's content takes to fade to fully transparent once a swipe
    // is confirmed, and how long the INCOMING session takes to fade back
    // in once the caller's real state has caught up. Deliberately quick
    // and asymmetric (out faster than in) — Oscar's own "just like
    // quickly" description of the feel he wanted — but these are a
    // starting guess, not tuned: confirm/adjust against a real device.
    fadeOutMs: 120,
    fadeInMs: 150,
  },
  tickCollapseMs: 200,
  infoToggleMs: 150,
  setsTallyLongPressMs: 450,
  loggedStamp: {
    delayBeforeShowMs: 1000,
    fadeInMs: 250,
    holdMs: 2500,
    fadeOutMs: 400,
  },
  restOverlaySlideMs: 200,
  restOverlayTickMs: 200,
  intervalTickMs: 50,
  /** IntervalTimerController's OWN ticker — distinct from intervalTickMs
      above, which is IntervalTimerView's separate, faster 50ms ticker used
      only for smooth progress-bar rendering. The controller ticks at this
      slower rate to decide phase transitions (Timer.scheduledTimer(
      withTimeInterval: 0.2...) in IntervalTimerController.swift's start()).
      Two different timers at two different rates for two different jobs,
      exactly as the Swift source has them. */
  intervalControllerTickMs: 200,
  /** How long a finished interval timer's DONE state stays on screen
      before auto-clearing (IntervalTimerController.finish()'s
      `DispatchQueue.main.asyncAfter(deadline: .now() + 1.4)`). */
  intervalDoneAutoClearMs: 1400,
} as const;
