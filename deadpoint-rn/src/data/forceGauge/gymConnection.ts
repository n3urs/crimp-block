// src/data/forceGauge/gymConnection.ts
/** What the gym station says while it isn't connected to the gauge.

    The gauge's own battery-saving code switches it off after a while, and
    the only way back is to power-cycle it by hand (the station can't fix
    that from the app). So once the station HAS been connected, a drop must
    tell people exactly that, in plain words they can act on from across the
    room, instead of the generic start-up "looking for the gauge". The
    station keeps scanning by itself, so the moment the gauge is switched
    back on it reconnects with no further tap. */
import type { ForceGaugeStatus } from './useForceGauge';

export interface GymConnectionNotice {
  headline: string;
  hint: string;
  /** True only for "the gauge dropped and needs power-cycling" — the loud state. */
  lost: boolean;
}

export function gymConnectionNotice(status: ForceGaugeStatus, wasConnected: boolean): GymConnectionNotice | null {
  if (status === 'connected') return null;
  if (status === 'connecting') {
    return wasConnected
      ? { headline: 'Reconnecting to the force gauge…', hint: 'Almost there.', lost: false }
      : { headline: 'Connecting to the force gauge…', hint: 'Keep the gauge close to this device.', lost: false };
  }
  if (wasConnected) {
    return {
      headline: 'FORCE GAUGE TURNED OFF',
      hint: 'Switch it off, then on again, to reconnect. This screen picks it up by itself.',
      lost: true,
    };
  }
  return {
    headline: 'Looking for the force gauge…',
    hint: 'Switch the gauge on and keep it close to this device.',
    lost: false,
  };
}
