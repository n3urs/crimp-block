// src/data/forceGauge/gaugeDiscovery.ts
/** Decides, for each Bluetooth device the scan hears, whether it's a force
    gauge the app can use and which kind. The scan can't be filtered to one
    gauge's service any more (a broadcast-only gauge like the WeiHeng WH-C06
    has no service to filter on), so this is what keeps unrelated headphones
    and watches out of the list while still finding every supported gauge.

    To support another gauge: add its recognition here and its decoder next
    to whc06.ts / protocol.ts, then teach useForceGauge to read it. */
import { PROGRESSOR_SERVICE_UUID } from './protocol';
import { parseWhc06Advertisement } from './whc06';

export type GaugeKind = 'progressor' | 'whc06';

export interface Advertisement {
  serviceUUIDs: string[] | null | undefined;
  name: string | null | undefined;
  manufacturerData: string | null | undefined;
}

export interface ClassifiedGauge {
  kind: GaugeKind;
  name: string;
}

/** Only used if the service UUID isn't in the packet we were handed (iOS can
    hide it in an overflow area), so a real Progressor or Oscar's homemade
    emulator, which is named after it, is never lost to the unfiltered scan. */
const PROGRESSOR_NAME = /progressor|tindeq|lettice/i;

export function classifyAdvertisement(ad: Advertisement): ClassifiedGauge | null {
  const uuids = (ad.serviceUUIDs ?? []).map((u) => u.toLowerCase());
  if (uuids.includes(PROGRESSOR_SERVICE_UUID)) {
    return { kind: 'progressor', name: ad.name || 'Force gauge' };
  }
  if (ad.name && PROGRESSOR_NAME.test(ad.name)) {
    return { kind: 'progressor', name: ad.name };
  }
  if (parseWhc06Advertisement(ad.manufacturerData, ad.name).isGauge) {
    return { kind: 'whc06', name: 'WH-C06 force gauge' };
  }
  return null;
}
