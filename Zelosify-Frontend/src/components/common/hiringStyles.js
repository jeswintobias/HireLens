/**
 * Tailwind class maps for contract-hiring badges and status pills.
 * Kept under src/components so Tailwind's content scan generates them
 * (tailwind.config only scans pages/, components/ and app/).
 */

/** Visual config for AI recommendation badges (light + dark variants). */
export const BADGE_STYLES = {
  RECOMMENDED: {
    label: "Recommended",
    className:
      "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900",
    bar: "bg-emerald-500",
  },
  BORDERLINE: {
    label: "Borderline",
    className:
      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900",
    bar: "bg-amber-500",
  },
  NOT_RECOMMENDED: {
    label: "Not Recommended",
    className:
      "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-900",
    bar: "bg-rose-500",
  },
};

/** Visual config for opening / profile workflow statuses. */
export const STATUS_STYLES = {
  OPEN: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  ON_HOLD: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  CLOSED: "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  SUBMITTED: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  SHORTLISTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  REJECTED: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
};
