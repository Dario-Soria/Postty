# Text Editor Module

Interactive text editor for generated images with text overlays.

## Quick Start

```typescript
import { openTextEditor } from '@/lib/features/text-editor';

// Open editor
const result = await openTextEditor({
  baseImageUrl: 'data:image/png;base64,...',
  textLayout: backendTextLayout,
});

if (result) {
  // User clicked Done
  const { textContent, overlays } = result;
  // textContent: { headline?, subheadline?, cta? }
  // overlays: Array<EditableTextOverlay>
} else {
  // User clicked Cancel
}
```

## Features

- ✅ Drag to move text
- ✅ Scale with corner handles
- ✅ Rotate with top handle
- ✅ Edit text content (double-click)
- ✅ Change font (8 options)
- ✅ Adjust size (20-120px)
- ✅ Pick color (10 presets + custom)
- ✅ Set alignment (left/center/right)
- ✅ Undo/Redo (Cmd/Ctrl+Z)

## Architecture

```
index.tsx              → Public API (openTextEditor)
types.ts               → TypeScript definitions
state/
  useTextEditor.ts     → State management hook
  history.ts           → Undo/redo logic
components/
  TextEditorModal.tsx  → Main container
  TextEditorCanvas.tsx → Canvas + overlays
  EditableTextOverlay.tsx → Single text element
  TransformHandles.tsx → Scale + rotate handles
  ControlPanel.tsx     → Bottom controls
  FontPicker.tsx       → Font selector
  ColorPalette.tsx     → Color selector
  TextInput.tsx        → Text editor modal
utils/
  adapters.ts          → Format conversions
  coordinateMapping.ts → Screen ↔ canvas coords
  fontRegistry.ts      → Available fonts
  colorPalette.ts      → Preset colors
```

## Data Flow

```
Backend textLayout → layoutToOverlays() → Editor
                                           ↓
                                      User edits
                                           ↓
                     overlaysToTextContent() ← Editor
                                           ↓
                                    { textContent }
```

## Types

### BackendTextLayout
Format returned by `/api/pipeline`:
```typescript
{
  elements: Array<{
    text: string;
    type: 'headline' | 'subheadline' | 'cta' | 'body';
    position: { x: number; y: number; anchor: string };
    style: {
      fontFamily: string;
      fontSize: number;
      fontWeight: string;
      color: string;
      // ... more style props
    };
  }>;
}
```

### EditableTextOverlay
Internal editor format:
```typescript
{
  id: string;
  text: string;
  type: 'headline' | 'subheadline' | 'cta' | 'body';
  x: number;        // 0-100%
  y: number;        // 0-100%
  scale: number;    // 0.5-3.0
  rotation: number; // degrees
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  align: 'left' | 'center' | 'right';
}
```

### TextContent
Format for API regeneration:
```typescript
{
  headline?: string;
  subheadline?: string;
  cta?: string;
}
```

## Keyboard Shortcuts

- `Cmd/Ctrl + Z` - Undo
- `Cmd/Ctrl + Shift + Z` - Redo
- `Backspace` or `Delete` - Delete selected overlay
- `Double-click` - Edit text content

## Coordinate System

- **Canvas**: 0-100% (percentage of image dimensions)
- **Screen**: Pixels relative to viewport
- **Mapping**: `CanvasMapper` handles conversions

All transforms use canvas percentages internally, converted to screen pixels for rendering.

## Styling

Uses existing design system:
- NextUI components (Button, Modal, Slider, Select)
- Tailwind utility classes
- Framer Motion for animations
- Matches site aesthetic (glass morphism, gradients)

## Browser Support

- ✅ Chrome/Edge
- ✅ Firefox
- ✅ Safari (desktop + mobile)
- ✅ Touch devices (mobile/tablet)

## Performance

- Debounced transform calculations
- History limited to 20 snapshots
- Portal rendering for z-index isolation
- Next.js Image optimization

## Extending

### Add New Font

1. Update `utils/fontRegistry.ts`:
```typescript
export const AVAILABLE_FONTS = [
  // ...
  { name: 'New Font', family: 'New Font', weights: ['400', '700'] },
];
```

2. Load font in `app/layout.tsx` (if using Google Fonts)

### Add New Color

Update `utils/colorPalette.ts`:
```typescript
export const COLOR_PALETTE = [
  // ...
  { name: 'Purple', hex: '#A855F7' },
];
```

### Add New Control

1. Create component in `components/`
2. Add to `ControlPanel.tsx`
3. Update `EditableTextOverlay` type if needed
4. Wire to `updateOverlay()` callback

## Testing

See `TEXT_EDITOR_IMPLEMENTATION.md` for full testing checklist.

Quick smoke test:
1. Generate image with text
2. Click "Edit text"
3. Drag headline
4. Rotate CTA
5. Change color
6. Click Done
7. Verify changes applied

## Troubleshooting

### Editor doesn't open
- Check `textLayout.elements` exists and has items
- Check browser console for errors
- Verify `baseImageUrl` is valid data URL

### Coordinates are wrong
- Check `CanvasMapper` is using correct container rect
- Verify image has loaded (`onLoad` fired)
- Check for CSS transforms on parent elements

### Transforms feel laggy
- Check for excessive re-renders
- Verify debouncing is working
- Test on different devices

## License

Part of Postty v4.0 - Internal use only

