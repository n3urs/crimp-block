/** Every value copied verbatim from DailyCardView.swift. These are not
    taste calls — several were tuned against direct user feedback about
    the card feeling laggy or abrupt. Changing one is a behaviour change. */
export const Motion = {
  swipe: {
    minimumDistance: 10,
    horizontalClaimDx: 12,
    horizontalClaimRatio: 1.5,
    commitFraction: 0.3,
    completeDurationMs: 200,
    animatedBrowseDurationMs: 300, // NOT the same as completeDurationMs (200) — animatedBrowse() uses a distinct duration+curve (easeInOut) from the live-swipe commit (easeOut)
    springBack: { response: 0.32, dampingFraction: 0.82 },
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
