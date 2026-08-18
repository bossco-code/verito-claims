/**
 * Pure SEO engine — technical SEO health score.
 * Framework-free so it runs in the test suite.
 *
 * Algorithm (documented — see HEALTH_ALGORITHM):
 *   Start at 100. Every OPEN issue subtracts a fixed penalty by severity:
 *     CRITICAL 20, HIGH 10, MEDIUM 4, LOW 1, INFO 0.
 *   The score is the max(0, 100 − total penalty). No open issues → 100.
 *   IGNORED / RESOLVED / AUTO_FIXED issues do not count.
 *   The score is a function of REAL detected issues — never arbitrary.
 */

export const SEVERITY_PENALTY = {
  CRITICAL: 20,
  HIGH: 10,
  MEDIUM: 4,
  LOW: 1,
  INFO: 0,
} as const;

export type Severity = keyof typeof SEVERITY_PENALTY;

export const HEALTH_ALGORITHM = [
  "Technical SEO health score (0–100).",
  "Start at 100 and subtract the penalty of every OPEN issue:",
  "  CRITICAL = −20, HIGH = −10, MEDIUM = −4, LOW = −1, INFO = −0.",
  "Score = max(0, 100 − total penalty).",
  "IGNORED, RESOLVED and AUTO_FIXED issues do not affect the score.",
  "The score reflects only real, persisted issues — never an arbitrary figure.",
].join("\n");

export type IssueLike = {
  severity: Severity;
  status: string;
};

export function healthScore(issues: IssueLike[]): number {
  let penalty = 0;
  for (const issue of issues) {
    if (issue.status !== "OPEN") continue;
    penalty += SEVERITY_PENALTY[issue.severity] ?? 0;
  }
  return Math.max(0, 100 - penalty);
}

export type HealthBreakdown = {
  score: number;
  open: number;
  total: number;
  bySeverity: Record<Severity, number>;
};

export function healthBreakdown(issues: IssueLike[]): HealthBreakdown {
  const bySeverity: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  for (const issue of issues) {
    const severity = issue.severity in bySeverity ? issue.severity : ("INFO" as Severity);
    bySeverity[severity] += 1;
  }
  const open = issues.filter((i) => i.status === "OPEN").length;
  return { score: healthScore(issues), open, total: issues.length, bySeverity };
}
