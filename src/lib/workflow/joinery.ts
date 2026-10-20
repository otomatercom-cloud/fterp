// Shared (client + server) constants. Never import values from server-only modules into client components.
export const JOINERY_STAGES = [
  ["drawing", "Shop drawing"], ["approved", "Drawing approved"], ["cutting", "Cutting"], ["assembly", "Assembly"], ["finishing", "Finishing"], ["ready", "Ready"], ["installed", "Installed"],
] as const;
