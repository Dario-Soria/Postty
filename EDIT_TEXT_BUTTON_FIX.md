# Edit Text Button Fix - Root Cause & Solution

## Problem

The "Edit text" button was not appearing after generating images with text in the AgentChat flow, even though:
- ✅ Images were generated successfully with text overlays
- ✅ Button code was added to AgentChat.tsx
- ✅ Condition checked for `textLayout.elements.length > 0`

## Root Cause Analysis

The `textLayout` data was **never passed from backend to frontend**. The data flow had multiple breaks:

### Data Flow Chain (Before Fix)

```
1. /apply-reference-json endpoint
   ↓ generates image with text
   ↓ ONLY returns: {finalImagePath, finalImage, width, height}
   ❌ Missing: textLayout

2. agent.py receives response
   ↓ extracts only: finalImagePath
   ❌ Missing: textLayout

3. agent.py returns
   ↓ returns: {type: "image", file: path, text: message}
   ❌ Missing: textLayout

4. /agent-chat route processes response
   ↓ returns: {type: "image", imageUrl: url, text: message}
   ❌ Missing: textLayout

5. Frontend AgentChat.tsx
   ↓ receives: {type: "image", imageUrl: url, text: message}
   ❌ Missing: textLayout
   ↓ condition: msg.textLayout?.elements?.length > 0
   ↓ Result: FALSE (undefined?.elements) → button hidden
```

## Solution

Added `textLayout` extraction and passing through entire chain:

### 1. `/apply-reference-json` Route

**File**: `src/routes/applyReferenceJson.ts`

**Change**: Extract textLayout from reference JSON and include in response

```typescript
// Load the reference JSON to extract textLayout structure
let textLayout = null;
try {
  const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  // Convert JSON format to textLayout format
  textLayout = {
    elements: userText.map((text, index) => {
      const jsonElement = jsonContent.texts[index];
      // ... conversion logic ...
    })
  };
} catch (e) {
  logger.warn('Could not extract textLayout from JSON');
}

// Return result with textLayout
return reply.send({
  success: true,
  finalImagePath: result.imagePath,
  textLayout: textLayout, // ← ADDED
  // ... other fields
});
```

### 2. Agent Python Code

**File**: `Agents/Product Showcase/agent.py`

**Change**: Capture textLayout from JSON response and include in return

```python
if json_response.ok:
    json_result = json_response.json()
    if json_result.get('success') and json_result.get('finalImagePath'):
        final_image_path = json_result['finalImagePath']
        text_layout = json_result.get('textLayout')  # ← ADDED: Capture textLayout
        print(f"[DEBUG] JSON applied successfully: {final_image_path}")

# Build response with textLayout
response = {
    "type": "image",
    "file": final_image_path,
    "text": text_before_trigger
}

# Add textLayout if available
if 'text_layout' in locals() and text_layout:
    response['textLayout'] = text_layout  # ← ADDED

return response
```

### 3. `/agent-chat` Route

**File**: `src/routes/agent-chat.ts`

**Change**: Pass textLayout from agent response to frontend

```typescript
if (result.type === 'image' && result.file) {
  const filename = path.basename(result.file);
  const backendUrl = process.env.BACKEND_URL || 'http://localhost:8080';
  
  const response: any = {
    type: 'image',
    text: result.text,
    imageUrl: `${backendUrl}/generated-images/${filename}`,
  };
  
  // Include textLayout if present
  if (result.textLayout) {
    response.textLayout = result.textLayout;  // ← ADDED
  }
  
  return reply.send(response);
}
```

### 4. Frontend (Already Implemented)

**File**: `frontend/src/app/v2/_components/AgentChat.tsx`

Button condition (already correct):
```typescript
{msg.textLayout?.elements?.length > 0 && (
  <button onClick={() => handleEditText(msg.imageUrl!, msg.textLayout)}>
    Editar texto
  </button>
)}
```

## Data Flow After Fix

```
1. /apply-reference-json
   ↓ generates image + extracts textLayout from JSON
   ✅ returns: {finalImagePath, textLayout, ...}

2. agent.py
   ↓ captures textLayout from response
   ✅ returns: {type: "image", file: path, text: msg, textLayout: layout}

3. /agent-chat route
   ↓ receives textLayout from agent
   ✅ returns: {type: "image", imageUrl: url, text: msg, textLayout: layout}

4. Frontend AgentChat.tsx
   ✅ receives: {imageUrl, text, textLayout}
   ✅ condition: textLayout?.elements?.length > 0 → TRUE
   ✅ button appears!
```

## Files Modified

1. **`src/routes/applyReferenceJson.ts`** - Extract and return textLayout
2. **`Agents/Product Showcase/agent.py`** - Capture and pass textLayout
3. **`src/routes/agent-chat.ts`** - Pass textLayout to frontend

## Testing

After restarting backend:

1. ✅ Upload product image
2. ✅ Describe scene
3. ✅ Select reference
4. ✅ Add text: "Aguante Argentina\nMe encanta el messi"
5. ✅ Generate image
6. ✅ **"Editar texto" button now appears!** (between "Publicar" and "Crear otra")

## Summary

The issue was a **broken data pipeline**: textLayout was generated but never passed through the backend → agent → route → frontend chain. The fix ensures textLayout flows through all layers so the frontend can conditionally show the "Edit text" button when text overlays are present.

