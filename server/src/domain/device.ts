import type { DeviceId } from "./shared.js";

/**
 * A historical device snapshot. Product catalog changes must not alter an
 * application or contract that already references this snapshot.
 */
export interface DeviceSnapshot {
  readonly deviceId: DeviceId;
  readonly sku: string;
  readonly brand: string;
  readonly model: string;
  readonly storage: string;
  readonly color: string;
  readonly imei?: string;
}
