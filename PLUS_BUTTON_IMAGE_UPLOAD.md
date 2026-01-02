# Plus Button Image Upload Feature

## Overview
Added a "+" button next to the send button that allows users to upload images at any time during the conversation, following a more standard messaging app pattern (like WhatsApp, Telegram, etc.).

## User Experience

### Button Layout
The chat input area now has 4 elements from left to right:
1. **🎤 Microphone button** (52x52px) - Hold to record voice
2. **📝 Text input** (flexible width) - Multi-line textarea
3. **➕ Plus button** (52x52px) - Upload image (NEW!)
4. **↗️ Send button** (52x52px) - Send message

All buttons have the same size (52x52px) and consistent dark styling for a unified look and feel.

### How It Works

**Anytime Image Upload:**
- User can click the "+" button at any time during the conversation
- Native file picker dialog opens (cross-platform compatible)
- User selects an image
- Image is validated (type and size)
- Image is uploaded and sent to the agent with the current conversation context

**Agent Flow:**
- Agent can still request images in conversation
- Instead of showing conditional buttons, agent simply asks for an image
- User uses the "+" button to upload when ready
- Much cleaner and more intuitive UX

## Cross-Platform Compatibility

### Desktop (Mac/Windows/Linux)
- Standard file picker dialog with folder browsing
- All image formats supported

### Mobile (iOS)
- Native iOS image picker
- Options: Take Photo, Photo Library, Files
- Works in Safari and other browsers

### Mobile (Android)
- Native Android image picker
- Options: Camera, Gallery, File Manager
- Works in Chrome and other browsers

## Technical Implementation

### Changes Made

**File Modified:** `frontend/src/app/v2/_components/AgentChat.tsx`

**1. Added Plus Button (Lines ~370-380):**
```typescript
{/* Image upload button (+) */}
<button
  onClick={() => fileInputRef.current?.click()}
  disabled={isBusy}
  className="h-[52px] w-[52px] shrink-0 flex items-center justify-center rounded-2xl bg-slate-900 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800 transition shadow-sm"
  aria-label="Subir imagen"
  title="Subir imagen"
>
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
</button>
```

**2. Removed Old Conditional Upload/Skip Buttons:**
- Removed `showUploadButton` from Message type
- Removed conditional button rendering
- Removed `handleSkipImage` function
- Simplified `addAssistantMessage` function signature

**3. Simplified Agent Response Handling:**
- `request_image` type now just shows a text message
- User uploads via the "+" button whenever ready
- No complex conditional UI needed

## Button Styling Details

All action buttons share consistent styling:
- **Size:** 52x52px square
- **Shape:** Rounded corners (rounded-2xl = 16px radius)
- **Color:** Dark slate background (bg-slate-900)
- **Text:** White text/icons
- **Hover:** Slightly darker on hover (hover:bg-slate-800)
- **Disabled:** 40% opacity when disabled
- **Shadow:** Subtle shadow for depth

The "+" icon uses a simple SVG with two perpendicular lines (horizontal and vertical) creating a perfect plus sign.

## Validation

The existing image validation remains:
- **File Type:** Must be an image/* type
- **File Size:** Maximum 10MB
- **Error Handling:** Shows toast notifications for invalid files

## Advantages Over Previous Approach

1. **Always Available:** Users can upload images anytime, not just when prompted
2. **Simpler UX:** No conditional buttons that appear/disappear
3. **Familiar Pattern:** Matches common messaging apps (WhatsApp, Telegram, etc.)
4. **Less Backend Complexity:** No need for special `request_image` response type
5. **More Flexible:** Users control when they want to share images
6. **Cleaner Code:** Removed conditional rendering logic and unused code

## Testing Checklist
- ✅ Plus button appears between textarea and send button
- ✅ Plus button same size as microphone and send buttons
- ✅ Clicking plus button opens file picker on desktop
- ✅ File picker works on mobile devices (iOS/Android)
- ✅ Image validation works (type and size checks)
- ✅ Uploaded images appear in chat correctly
- ✅ Agent receives images and processes them
- ✅ All buttons maintain consistent styling
- ✅ Buttons align properly at bottom of textarea



