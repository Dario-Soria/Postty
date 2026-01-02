# Skip/Upload Buttons Implementation

## Feature Overview
Added two-button choice when the Product Showcase agent requests an image: "Omitir" (Skip) and "Subir Imagen" (Upload).

## User Experience

### When Agent Requests Image
The agent will display a message like:
> "Para que la creatina sea la protagonista absoluta, ¿tienes una foto de tu producto que te gustaría subir? Así puedo asegurarme de que el renderizado sea lo más fiel posible."

Below this message, two buttons appear side-by-side:
- **Omitir** (left) - Light gray button
- **📤 Subir Imagen** (right) - Dark button with upload icon

### Skip Flow
1. User clicks "Omitir"
2. Message "Prefiero continuar sin imagen" is sent to agent
3. Agent continues conversation without expecting an image
4. Agent may generate a generic/placeholder product image or suggest alternatives

### Upload Flow
1. User clicks "Subir Imagen"
2. Native file picker dialog opens (works on all platforms)
3. User selects an image file
4. Image is validated (type: must be image/*, size: max 10MB)
5. Image is uploaded and sent to agent
6. Agent processes the image and continues

## Cross-Platform Compatibility

### Desktop (Mac/Windows/Linux)
- Standard file picker dialog opens
- User can browse folders and select image files

### Mobile (iOS/Android)
- Native image picker opens automatically
- Options typically include:
  - Take Photo (camera)
  - Choose from Photo Library
  - Choose from Files
- Works in Safari (iOS) and Chrome (Android)

## Technical Implementation

### Files Modified
- `frontend/src/app/v2/_components/AgentChat.tsx`

### Changes Made

1. **Added Skip Handler** (line ~197):
```typescript
const handleSkipImage = () => {
  // User chose to skip image upload, continue without image
  handleSendMessage("Prefiero continuar sin imagen");
};
```

2. **Updated Button UI** (lines ~265-283):
```typescript
{msg.showUploadButton && (
  <div className="flex gap-2 mt-3">
    {/* Skip button */}
    <button
      onClick={handleSkipImage}
      className="flex-1 py-2.5 px-4 bg-slate-200 text-slate-800 font-medium rounded-xl text-sm hover:bg-slate-300 transition"
    >
      Omitir
    </button>
    
    {/* Upload button */}
    <button
      onClick={() => fileInputRef.current?.click()}
      className="flex-1 py-2.5 px-4 bg-slate-900 text-white font-medium rounded-xl text-sm hover:bg-slate-800 transition flex items-center justify-center gap-2"
    >
      <span>📤</span>
      <span>Subir Imagen</span>
    </button>
  </div>
)}
```

## Agent Behavior
The Product Showcase agent (based on its `prompt.md` instructions) will:
- Acknowledge when user skips image upload
- Continue with the creative process
- May generate an image using generic product representations
- Or adapt its approach based on available information

## Testing Checklist
- ✅ Two buttons appear when agent requests image
- ✅ "Omitir" button sends skip message and continues flow
- ✅ "Subir Imagen" opens file picker on desktop
- ✅ File picker works on mobile devices (iOS/Android)
- ✅ Image validation works (type and size checks)
- ✅ Uploaded images are sent to agent correctly
- ✅ Agent responds appropriately to both skip and upload actions

## Design Notes
- Buttons are equal width (`flex-1`) for balanced appearance
- Skip button uses lighter styling to indicate secondary action
- Upload button maintains primary styling with icon for emphasis
- Both buttons have hover states for better UX
- Responsive design works on all screen sizes

