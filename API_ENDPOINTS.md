# API Endpoints Reference

## Image generation provider selection

Image generation is handled by `src/services/imageGenerator.ts` and supports **Gemini Imagen** and **OpenAI DALL·E**.

- If `IMAGE_GENERATION_PROVIDER` is set to `gemini` or `openai`, it will be used.
- Otherwise, if `GEMINI_API_KEY` is set, image generation uses **Gemini Imagen**.
- Otherwise, image generation uses **OpenAI DALL·E**.

## Available Endpoints

### 1. Health Check
**Endpoint:** `GET /health`

**Description:** Check if the server is running

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-11T19:00:00.000Z"
}
```

---

### 2. Generate AI Image + Caption + Upload (NO PUBLISH) ✅
**Endpoint:** `POST /generate`

**Description:** Generate an AI image from a text prompt, generate a caption, upload the image to S3, and return the result. Does **not** publish to Instagram (frontend approval flow).

**Request Body (JSON):**
```json
{
  "prompt": "A detailed description of the image you want to generate",
  "use_pixabay": false
}
```

**Response:**
```json
{
  "status": "success",
  "prompt": "Original prompt",
  "refined_prompt": "Optional: prompt refined via Pixabay + Gemini (only if opted-in)",
  "pixabay": {
    "id": 123,
    "pageURL": "https://pixabay.com/...",
    "tags": "river, stream, mountains",
    "query": "river stream snowy mountains"
  },
  "generated_image_path": "/path/to/generated/image.png",
  "caption": "Generated caption",
  "uploaded_image_url": "https://s3.amazonaws.com/..."
}
```

---

### 3. Generate AI Image from Uploaded Image + Prompt (NO PUBLISH) ✅
**Endpoint:** `POST /generate-with-image`

**Description:** Upload an image, analyze it with GPT-4 Vision, combine with your prompt to generate a new AI image, generate a caption, upload to S3, and return the result. Does **not** publish to Instagram (frontend approval flow).

**Request Format:** `multipart/form-data`

**Form Fields:**
- `image` (file, required): The image file to upload
- `prompt` (text, required): Your creative prompt
- `use_pixabay` (text, optional): Set to `true` to opt into Pixabay + Gemini prompt refinement (requires `ENABLE_PIXABAY=true`)

**Response:**
```json
{
  "status": "success",
  "prompt": "Original user prompt",
  "uploaded_image_analysis": "GPT-4 Vision analysis of the uploaded image",
  "enhanced_prompt": "Combined prompt with visual context",
  "refined_prompt": "Optional: prompt refined via Pixabay + Gemini (only if opted-in)",
  "pixabay": {
    "id": 123,
    "pageURL": "https://pixabay.com/...",
    "tags": "river, stream, mountains",
    "query": "river stream snowy mountains"
  },
  "generated_image_path": "/path/to/generated/image.png",
  "caption": "Generated Instagram caption",
  "uploaded_image_url": "https://s3.amazonaws.com/..."
}
```

**Notes (Pixabay opt-in):**
- The opt-in only activates when both `ENABLE_PIXABAY=true` and `use_pixabay=true` are provided.
- Pixabay has rate limits, requires **24h caching**, and disallows permanent hotlinking; we download images server-side. See [Pixabay API documentation](https://pixabay.com/api/docs/).

---

### 4. Publish Instagram Post from Public Image URL ✅
**Endpoint:** `POST /publish-instagram-from-url`

**Description:** Publish a **public HTTPS image URL** to Instagram with a caption. This is frontend-safe (no server-local file paths).

**Request Body (JSON):**
```json
{
  "image_url": "https://your-public-image-url",
  "caption": "Your Instagram caption"
}
```

**Response:**
```json
{
  "status": "success",
  "instagram_response": {
    "id": "instagram_post_id"
  }
}
```

---

### 5. Publish Instagram Post (Original)
**Endpoint:** `POST /publish-instagram`

**Description:** Publish an existing local image to Instagram

**Request Body (JSON):**
```json
{
  "image_path": "/absolute/path/to/image.jpg",
  "caption": "Your Instagram caption"
}
```

**Response:**
```json
{
  "status": "success",
  "uploaded_image_url": "https://s3.amazonaws.com/...",
  "instagram_response": {
    "id": "instagram_post_id"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/publish-instagram \
  -H "Content-Type: application/json" \
  -d '{
    "image_path": "/Users/dariosoria/Code/Postty v2/TestImage/DariMontana.jpeg",
    "caption": "My automated post! #automation"
  }'
```

---

### 6. Generate AI Image and Publish (Original)
**Endpoint:** `POST /generate-and-publish`

**Description:** Generate an AI image from a text prompt and publish to Instagram

**Request Body (JSON):**
```json
{
  "prompt": "A detailed description of the image you want to generate"
}
```

**Response:**
```json
{
  "status": "success",
  "prompt": "Original prompt",
  "generated_image_path": "/path/to/generated/image.png",
  "caption": "Generated caption",
  "uploaded_image_url": "https://s3.amazonaws.com/...",
  "instagram_response": {
    "id": "instagram_post_id"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/generate-and-publish \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A man running on a mountain with a backpack, enjoying the scenery"
  }'
```

---

### 7. Generate AI Image from Uploaded Image + Prompt (Publish) (Original)
**Endpoint:** `POST /generate-with-image-and-publish`

**Description:** Upload an image, analyze it with GPT-4 Vision, combine with your prompt to generate a new AI image, and publish to Instagram

**Request Format:** `multipart/form-data`

**Form Fields:**
- `image` (file, required): The image file to upload
- `prompt` (text, required): Your creative prompt

**Response:**
```json
{
  "status": "success",
  "prompt": "Original user prompt",
  "uploaded_image_analysis": "GPT-4 Vision analysis of the uploaded image",
  "enhanced_prompt": "Combined prompt with visual context",
  "generated_image_path": "/path/to/generated/image.png",
  "caption": "Generated Instagram caption",
  "uploaded_image_url": "https://s3.amazonaws.com/...",
  "instagram_response": {
    "id": "instagram_post_id"
  }
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/generate-with-image-and-publish \
  -F "image=@TestImage/DariMontana.jpeg" \
  -F "prompt=I want to promote this new product for summer holidays. Create a hyper realistic image of a man drinking water while recovering from an ultra marathon in the mountains"
```

**Or use the test script:**
```bash
./test-new-endpoint.sh
```

**Processing Time:** 20-45 seconds (includes GPT-4 Vision analysis, DALL-E 3 generation, caption generation, S3 upload, and Instagram publishing)

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "status": "error",
  "message": "Descriptive error message"
}
```

**Common HTTP Status Codes:**
- `400` - Bad Request (missing or invalid parameters)
- `413` - Payload Too Large (file size exceeds limits)
- `500` - Internal Server Error (processing failed)

---

## Environment Variables Required

```env
# OpenAI API (for image generation and analysis)
OPENAI_API_KEY=your_openai_api_key

# Instagram API
INSTAGRAM_USER_ID=your_instagram_user_id
INSTAGRAM_ACCESS_TOKEN=your_long_lived_token

# AWS S3 (for image storage)
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-1
AWS_BUCKET_NAME=your-bucket-name

# Server (optional)
PORT=3000
```

---

## Quick Start

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **Test the health endpoint:**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Test the new endpoint:**
   ```bash
   ./test-new-endpoint.sh
   ```

---

## Frontend Integration

### React/JavaScript Example

```javascript
async function generateWithImage(imageFile, promptText) {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('prompt', promptText);
  
  try {
    const response = await fetch('http://localhost:3000/generate-with-image-and-publish', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.status === 'success') {
      console.log('Success!');
      console.log('Instagram Post ID:', data.instagram_response.id);
      console.log('Image Analysis:', data.uploaded_image_analysis);
      return data;
    } else {
      console.error('Error:', data.message);
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
}

// Usage
const fileInput = document.querySelector('input[type="file"]');
const promptInput = document.querySelector('textarea');

generateWithImage(fileInput.files[0], promptInput.value)
  .then(result => console.log('Posted to Instagram!', result))
  .catch(error => console.error('Failed:', error));
```

---

## Workflow Comparison

### Original Workflow (generate-and-publish)
```
Text Prompt → DALL-E 3 → Caption → S3 → Instagram
```

### New Workflow (generate-with-image-and-publish)
```
Image Upload + Text Prompt → GPT-4 Vision Analysis → Enhanced Prompt → DALL-E 3 → Caption → S3 → Instagram
```

The new endpoint adds visual context analysis to create more relevant and contextually appropriate generated images.

