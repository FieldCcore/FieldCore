import { AdvancedMarker, Pin } from '@vis.gl/react-google-maps';

// Wraps AdvancedMarker with FieldCore brand defaults.
// Pass `children` to render a fully custom pin (HTML/SVG).
// Pass no children to get the default branded pin (navy body, sand border).
export function Marker({
  position,
  title,
  onClick,
  // Brand defaults
  color = '#1C2333',
  glyphColor = '#ffffff',
  borderColor = '#D6B58A',
  scale,
  glyph,
  children,
  ...props
}) {
  return (
    <AdvancedMarker
      position={position}
      title={title}
      onClick={onClick}
      {...props}
    >
      {children ?? (
        <Pin
          background={color}
          glyphColor={glyphColor}
          borderColor={borderColor}
          scale={scale}
          glyph={glyph}
        />
      )}
    </AdvancedMarker>
  );
}
