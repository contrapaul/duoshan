/** JSON control messages for the Phase 0 latency probe (/rt/probe). */

export const PROBE_HINTS = ['apac', 'wnam', 'enam', 'weur', 'eeur', 'oc'] as const;
export type ProbeHint = (typeof PROBE_HINTS)[number] | 'auto';

/** How long one probe room runs before closing itself (cost control). */
export const PROBE_MAX_SECONDS = 90;

export type ProbeClientMsg = { t: 'ping'; id: number; c: number };

export type ProbeServerMsg =
  | { t: 'hello'; edgeColo: string; country: string; hint: string }
  | { t: 'where'; doColo: string }
  | { t: 'pong'; id: number; c: number }
  | {
      t: 'stats';
      /** Seconds since the room started. */
      up: number;
      /** Sim ticks run in the last second (target 60). */
      ticks: number;
      /** Timer fires in the last second, and the largest gap between two fires (ms). */
      fires: number;
      maxGapMs: number;
      /** Snapshots sent and input packets received in the last second. */
      snaps: number;
      inputs: number;
      snapBytes: number;
    }
  | { t: 'bye'; reason: string };
