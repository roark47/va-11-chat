/** Stable bar-neon speaker tints hashed from userId. */

export type SpeakerTone = {
  ink: string;
  wash: string;
  border: string;
};

export type SpeakerToneStyle = {
  "--speaker-ink": string;
  "--speaker-wash": string;
  "--speaker-border": string;
};

/** Night-counter drinks: cyan, pink, amber, green, coral, sky, champagne, teal. */
const speakerTones: SpeakerTone[] = [
  {
    ink: "#68f2ed",
    wash: "rgba(104, 242, 237, 0.1)",
    border: "rgba(104, 242, 237, 0.34)",
  },
  {
    ink: "#ff6d9f",
    wash: "rgba(255, 109, 159, 0.12)",
    border: "rgba(255, 109, 159, 0.36)",
  },
  {
    ink: "#ffc267",
    wash: "rgba(255, 194, 103, 0.12)",
    border: "rgba(255, 194, 103, 0.36)",
  },
  {
    ink: "#68f2a6",
    wash: "rgba(104, 242, 166, 0.1)",
    border: "rgba(104, 242, 166, 0.34)",
  },
  {
    ink: "#ff8a7a",
    wash: "rgba(255, 138, 122, 0.12)",
    border: "rgba(255, 138, 122, 0.36)",
  },
  {
    ink: "#7ec8ff",
    wash: "rgba(126, 200, 255, 0.1)",
    border: "rgba(126, 200, 255, 0.34)",
  },
  {
    ink: "#e8d48b",
    wash: "rgba(232, 212, 139, 0.12)",
    border: "rgba(232, 212, 139, 0.36)",
  },
  {
    ink: "#5eead4",
    wash: "rgba(94, 234, 212, 0.1)",
    border: "rgba(94, 234, 212, 0.34)",
  },
];

export function hashSpeakerKey(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function speakerToneFor(userId: string): SpeakerTone {
  const index = hashSpeakerKey(userId || "anonymous") % speakerTones.length;
  return speakerTones[index]!;
}

export function speakerToneStyle(userId: string): SpeakerToneStyle {
  const tone = speakerToneFor(userId);
  return {
    "--speaker-ink": tone.ink,
    "--speaker-wash": tone.wash,
    "--speaker-border": tone.border,
  };
}
