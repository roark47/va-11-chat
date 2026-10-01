import { patronFaceBy, type PatronFaceId } from "../../../avatars";
import "./patron-portrait.css";

type PatronPortraitProps = {
  face: PatronFaceId;
};

export function PatronPortrait({ face }: PatronPortraitProps) {
  const sprite = patronFaceBy(face);

  return (
    <svg className="patron-portrait" viewBox="-1 -1 34 34" aria-hidden="true">
      {sprite.dots.map(([x, y, fill]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} />
      ))}
    </svg>
  );
}
