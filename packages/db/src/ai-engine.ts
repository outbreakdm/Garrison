/**
 * What the AI assistant's engine is called in the product: Bastion v1, in two modes. Fast is
 * every plan's (the bot's QM_MODEL), Smart is Pro and Agency's (QM_SMART_MODEL). The name
 * stays the same when the models underneath change; a new version is a deliberate step.
 */
export const AI_ENGINE = "Bastion v1";

export const AI_MODES = {
  fast: { label: "Fast", about: "quick answers and everyday changes" },
  smart: { label: "Smart", about: "big designs and tricky permissions" },
} as const;

/**
 * "Smart", for a message or a picker. The engine's name stays out of the dashboard
 * (2026-11-23): admins choose Fast or Smart, and a product name for the model underneath was
 * one more word to learn. The AI still answers "Bastion" if asked what it runs on.
 */
export const engineLabel = (mode: keyof typeof AI_MODES) => AI_MODES[mode].label;
