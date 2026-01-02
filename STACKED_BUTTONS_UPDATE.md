# Stacked Buttons Layout Update

## Change
Modified the "+" button and send button to be stacked vertically instead of horizontally side by side.

## New Layout

### Horizontal Layout (Left to Right):
1. **🎤 Microphone button** (52x52px)
2. **📝 Text input** (flexible width)
3. **Stacked buttons column** (52px wide):
   - **➕ Plus button** (52x52px) - TOP
   - **↗️ Send button** (52x52px) - BOTTOM

### Visual Representation:
```
┌────┐  ┌──────────────────────┐  ┌────┐
│ 🎤 │  │                      │  │ ➕ │
└────┘  │   Text Input Area    │  ├────┤
        │                      │  │ ↗️ │
        └──────────────────────┘  └────┘
```

## Technical Implementation

**File Modified:** `frontend/src/app/v2/_components/AgentChat.tsx`

**Added Container:**
```tsx
<div className="flex flex-col gap-2 shrink-0">
  {/* Plus button - TOP */}
  <button ... >...</button>
  
  {/* Send button - BOTTOM */}
  <button ... >...</button>
</div>
```

**Key CSS Classes:**
- `flex flex-col` - Creates vertical flex container
- `gap-2` - 8px space between buttons
- `shrink-0` - Prevents container from shrinking

## Button Specifications
- **Plus Button (Top):**
  - Size: 52x52px
  - Function: Opens file picker for image upload
  - Icon: Plus sign (+)
  
- **Send Button (Bottom):**
  - Size: 52x52px
  - Function: Sends the typed message
  - Icon: Send arrow (↗️)
  - Disabled when: No text in input or system is busy

## Spacing
- Vertical gap between buttons: 8px (gap-2)
- Horizontal spacing maintained at 8px between all elements

## Advantages of Vertical Stack
1. **More compact horizontally** - Saves screen width
2. **Clear hierarchy** - Upload (top) → Send (bottom)
3. **Better mobile experience** - Buttons easier to tap when stacked
4. **Matches the textarea height** - Better visual alignment



