export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export const CORNERS: { id: Corner; label: string }[] = [
  { id: "top-left", label: "Top left" },
  { id: "top-right", label: "Top right" },
  { id: "bottom-left", label: "Bottom left" },
  { id: "bottom-right", label: "Bottom right" },
];

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Top-left point (physical px) that puts a window of `size` into `corner` of the monitor's work area. */
export function cornerPosition(corner: Corner, area: Rect, size: { width: number; height: number }, margin: number) {
  const left = area.x + margin;
  const top = area.y + margin;
  const right = area.x + area.width - size.width - margin;
  const bottom = area.y + area.height - size.height - margin;
  return {
    x: corner.endsWith("left") ? left : right,
    y: corner.startsWith("top") ? top : bottom,
  };
}
