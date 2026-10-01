export const patronFaceIds = [
  "visor",
  "specs",
  "hoop",
  "undercut",
  "bun",
  "cap",
  "waves",
  "pixie",
] as const;

export type PatronFaceId = (typeof patronFaceIds)[number];

export const defaultPatronFaceId: PatronFaceId = "visor";

export function isPatronFaceId(value: unknown): value is PatronFaceId {
  return typeof value === "string" && (patronFaceIds as readonly string[]).includes(value);
}

export function resolvePatronFaceId(value: unknown): PatronFaceId {
  return isPatronFaceId(value) ? value : defaultPatronFaceId;
}

export type PatronDot = readonly [number, number, string];

export type PatronFace = {
  id: PatronFaceId;
  label: string;
  dots: PatronDot[];
};

const ink = "#140e18";
const eye = "#1a1020";
const catchlight = "#fff6ea";

function block(x: number, y: number, w: number, h: number, color: string): PatronDot[] {
  const dots: PatronDot[] = [];
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      dots.push([col, row, color]);
    }
  }
  return dots;
}

function ring(x: number, y: number, w: number, h: number, color: string): PatronDot[] {
  return [
    ...block(x, y, w, 1, color),
    ...block(x, y + h - 1, w, 1, color),
    ...block(x, y, 1, h, color),
    ...block(x + w - 1, y, 1, h, color),
  ];
}

function bust(skin: string, clothes: string, mouth: string): PatronDot[] {
  return [
    ...block(6, 24, 20, 6, clothes),
    ...block(13, 23, 6, 3, skin),
    ...block(8, 12, 2, 4, skin),
    ...block(22, 12, 2, 4, skin),
    ...block(10, 8, 12, 13, skin),
    ...block(12, 13, 2, 2, eye),
    ...block(18, 13, 2, 2, eye),
    ...block(12, 13, 1, 1, catchlight),
    ...block(18, 13, 1, 1, catchlight),
    ...block(14, 17, 4, 1, mouth),
  ];
}

function sprite(parts: PatronDot[]): PatronDot[] {
  const paint = new Map<string, string>();
  for (const [x, y, color] of parts) paint.set(`${x},${y}`, color);

  const framed = new Map<string, string>();
  for (const key of paint.keys()) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const neighbor = `${x + dx},${y + dy}`;
      if (!paint.has(neighbor)) framed.set(neighbor, ink);
    }
  }

  return [
    ...[...framed.entries()].map(([key, color]) => {
      const [x, y] = key.split(",").map(Number) as [number, number];
      return [x, y, color] as const;
    }),
    ...[...paint.entries()].map(([key, color]) => {
      const [x, y] = key.split(",").map(Number) as [number, number];
      return [x, y, color] as const;
    }),
  ];
}

const hairCyan = "#3ad4cc";
const hairAmber = "#e39a3c";
const hairInk = "#1a120e";
const hairTeal = "#2ee6c7";
const hairSilver = "#d5d0d8";
const hairBun = "#f4f1ea";
const capNavy = "#1c2433";
const hairCopper = "#c4622d";
const hairBlue = "#3d6bff";
const streak = "#ff6d9f";

export const patronFaces: PatronFace[] = [
  {
    id: "visor",
    label: "Cyan visor",
    dots: sprite([
      ...bust("#f6d7c3", "#243044", "#c46b73"),
      ...block(8, 4, 16, 6, hairCyan),
      ...block(7, 8, 4, 12, hairCyan),
      ...block(21, 8, 4, 12, hairCyan),
      ...block(11, 8, 10, 3, hairCyan),
      ...block(9, 12, 14, 4, "#1c2230"),
      ...block(10, 13, 12, 1, "#68f2ed"),
    ]),
  },
  {
    id: "specs",
    label: "Amber glasses",
    dots: sprite([
      ...bust("#f0c09a", "#3a2a44", "#b85a62"),
      ...block(9, 5, 14, 5, hairAmber),
      ...block(9, 10, 2, 3, hairAmber),
      ...block(21, 10, 2, 3, hairAmber),
      ...ring(11, 12, 5, 5, "#ffc267"),
      ...ring(16, 12, 5, 5, "#ffc267"),
      ...block(15, 14, 2, 1, "#ffc267"),
    ]),
  },
  {
    id: "hoop",
    label: "Gold hoop",
    dots: sprite([
      ...bust("#8d4e32", "#5a2340", "#5c2a28"),
      ...block(10, 6, 12, 4, hairInk),
      ...block(11, 5, 4, 2, "#ffc267"),
      ...ring(4, 13, 5, 6, "#ffc267"),
    ]),
  },
  {
    id: "undercut",
    label: "Teal undercut",
    dots: sprite([
      ...bust("#c4a06a", "#1e3348", "#8d5344"),
      ...block(15, 4, 10, 7, hairTeal),
      ...block(18, 3, 4, 2, "#7dfff0"),
      ...block(11, 12, 1, 4, "#ff5b7d"),
    ]),
  },
  {
    id: "bun",
    label: "Silver bun",
    dots: sprite([
      ...bust("#f3c7b0", "#2c2438", "#c46b73"),
      ...block(9, 7, 14, 4, hairSilver),
      ...block(12, 2, 8, 6, hairBun),
      ...block(13, 3, 6, 3, "#c8c2cc"),
      ...block(10, 21, 12, 3, "#c9a0b8"),
    ]),
  },
  {
    id: "cap",
    label: "Night cap",
    dots: sprite([
      ...bust("#e8b896", "#3d4a62", "#b85a62"),
      ...block(8, 3, 16, 6, capNavy),
      ...block(6, 8, 20, 2, "#2a3348"),
      ...block(11, 10, 10, 2, "#f6f3ea"),
    ]),
  },
  {
    id: "waves",
    label: "Copper waves",
    dots: sprite([
      ...bust("#f0b48a", "#4a2e28", "#a85a55"),
      ...block(8, 5, 16, 5, hairCopper),
      ...block(6, 8, 4, 18, hairCopper),
      ...block(22, 8, 4, 18, hairCopper),
      ...block(7, 12, 1, 8, "#e7a06a"),
      ...block(13, 16, 1, 1, "#d4896a"),
      ...block(18, 16, 1, 1, "#d4896a"),
      ...block(12, 22, 8, 2, "#68f2a6"),
    ]),
  },
  {
    id: "pixie",
    label: "Blue pixie",
    dots: sprite([
      ...bust("#f7d7c4", "#1a1e33", "#c46b73"),
      ...block(8, 6, 16, 4, hairBlue),
      ...block(9, 3, 2, 4, hairBlue),
      ...block(13, 2, 2, 5, hairBlue),
      ...block(18, 3, 2, 4, hairBlue),
      ...block(22, 5, 2, 3, hairBlue),
      ...block(19, 4, 2, 8, streak),
      ...block(24, 14, 2, 2, catchlight),
    ]),
  },
];

const patronFaceById = new Map(patronFaces.map((face) => [face.id, face]));

export function patronFaceBy(id: PatronFaceId): PatronFace {
  const face = patronFaceById.get(id);
  if (!face) return patronFaces[0]!;
  return face;
}
