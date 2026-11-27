import { useEffect, useRef, type RefObject } from "react";
import { t } from "../../lib/i18n";
import { createStage, type Kit, type Stage, type View } from "./stage";

interface Props {
  build: (k: Kit) => View;
  /** Color per lit part; parts missing here were not found and stay unlit. */
  colors: Record<string, string>;
  selected: string | null;
  /** A part was clicked (or, on a teardown model, lifted out / put back: null). */
  onSelect: (part: string | null) => void;
  onOpen?: (open: boolean) => void;
  /** Receives the stage, for the page's buttons (put back, close the case, lift a part from the list). */
  stageRef?: RefObject<Stage | null>;
  /** Guide hotspot text per part id (and "case" for the closed PC). */
  labels: Record<string, string>;
}

export function Stage3D({ build, colors, selected, onSelect, onOpen, stageRef, labels }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const events = useRef({ onSelect, onOpen });
  events.current = { onSelect, onOpen };

  useEffect(() => {
    const s = createStage(host.current!, build, {
      onPick: (p) => events.current.onSelect(p),
      onOpen: (o) => events.current.onOpen?.(o),
      labels,
      rgbText: t("RGB found"),
      noRgbText: t("no RGB found"),
    });
    stage.current = s;
    if (stageRef) stageRef.current = s;
    return () => {
      s.dispose();
      stage.current = null;
      if (stageRef) stageRef.current = null;
    };
    // Labels are fixed per page (translated once); a new build means a new scene anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, stageRef]);

  useEffect(() => stage.current?.paint(colors, selected), [colors, selected, build]);

  return <div ref={host} className="lighting__scene" role="img" aria-label={t("3D view. Drag to rotate, scroll to zoom, click a lit part to change its color.")} />;
}
