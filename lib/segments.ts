/** SponsorBlock segment kinds, shared by the server (lib/sponsorblock.ts) and the player. */
export type SegmentCategory = "sponsor" | "selfpromo" | "interaction" | "intro" | "outro" | "preview" | "music_offtopic";
export type Segment = { start: number; end: number; category: SegmentCategory };

/** Skipped automatically: the ads inside videos. The rest are only marked on the seek bar. */
export const AUTO_SKIP: SegmentCategory[] = ["sponsor", "selfpromo", "interaction"];

export const SEGMENT_INFO: Record<SegmentCategory, { label: string; color: string }> = {
  sponsor: { label: "Sponsor", color: "#00d400" },
  selfpromo: { label: "Self-promotion", color: "#ffff00" },
  interaction: { label: "Subscribe reminder", color: "#cc00ff" },
  intro: { label: "Intro", color: "#00ffff" },
  outro: { label: "Outro", color: "#0202ed" },
  preview: { label: "Preview", color: "#008fd6" },
  music_offtopic: { label: "Non-music part", color: "#ff9900" },
};
