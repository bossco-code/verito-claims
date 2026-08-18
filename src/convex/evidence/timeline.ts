/**
 * Evidence Timeline (spec §12).
 *
 * Chronological events generated ONLY from actual source records — nothing is
 * invented. Every timeline event links to its EvidenceItem (stable evidenceNo).
 */

import type { EvidenceItemDraft, TimelineEvent } from "./types";
import { evidenceNoFor } from "./calculation";

export interface TimelineInput {
  items: EvidenceItemDraft[];
  /** Assign stable evidence numbers in collection order (matches storage). */
  evidenceNoByKey: Map<string, string>;
  now?: number;
}

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Build a chronological timeline from evidence items with event dates.
 * Items without dates are appended last (they carry no time facts).
 */
export function buildTimeline({
  items,
  evidenceNoByKey,
}: TimelineInput): TimelineEvent[] {
  const dated: TimelineEvent[] = [];
  const undated: TimelineEvent[] = [];

  for (const item of items) {
    const evidenceNo = evidenceNoByKey.get(item.evidenceKey) ?? evidenceNoFor(items.indexOf(item));
    const entry: TimelineEvent = {
      when: item.event_date != null ? fmtDateTime(item.event_date) : "—",
      title: item.title,
      detail: item.description ?? "",
      source: item.source,
      evidenceNo,
    };
    if (item.event_date != null) {
      dated.push(entry);
    } else {
      undated.push(entry);
    }
  }

  dated.sort((a, b) => {
    const ta = a.when === "—" ? 0 : Date.parse(a.when);
    const tb = b.when === "—" ? 0 : Date.parse(b.when);
    return ta - tb;
  });

  return [...dated, ...undated];
}
