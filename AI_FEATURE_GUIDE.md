# AI Image Generation Feature Guide

## Overview

The AI Image Generation feature allows you to generate images from text prompts using **Gemini Imagen** (default when `GEMINI_API_KEY` is set) or **OpenAI DALL·E**, and automatically post them to Instagram with AI-generated captions.

## Setup

### 1. Get Gemini API Key (recommended for image generation)

1. Go to [Google AI Studio API Keys](https://aistudio.google.com/apikey)
2. Create an API key
3. Copy the key

### 2. Get OpenAI API Key (still required for captions + uploaded-image analysis)

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-proj-...`)

### 3. Add to Environment

Add the following to your `.env` file:

```env
GEMINI_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional: force provider selection for image generation
# IMAGE_GENERATION_PROVIDER=gemini
# IMAGE_GENERATION_PROVIDER=openai

# Optional: Imagen model/config
# GEMINI_IMAGE_MODEL=imagen-3.0-generate-002
# GEMINI_IMAGE_SIZE=1K
# GEMINI_ASPECT_RATIO=1:1
```

## Usage

### API Endpoint

**POST** `/generate-and-publish`

### Request Format

```json
{
  "prompt": "Your image description here"
}
```

### Example Request

```bash
curl -X POST http://localhost:8080/generate-and-publish \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A woman on a beach smiling drinking a soda"
  }'
```

### Example Response

```json
{
  "status": "success",
  "prompt": "A woman on a beach smiling drinking a soda",
  "generated_image_path": "/path/to/generated-images/1733942400000_a_woman_on_a_beach_smiling_drinking.png",
  "caption": "Beach vibes and good times! ☀️🥤 #beach #summer #happiness #beachlife #goodvibes",
  "uploaded_image_url": "https://your-bucket.s3.amazonaws.com/instagram/1733942400000-a_woman_on_a_beach_smiling_drinking.png",
  "instagram_response": {
    "id": "17895695668004550"
  }
}
```

## How It Works

The endpoint performs the following steps automatically:

1. **Generate Image** - Uses **Gemini Imagen** (if `GEMINI_API_KEY` is set) or OpenAI DALL·E 3 to create an image from your prompt
2. **Save Locally** - Saves the generated image to `generated-images/` directory
3. **Generate Caption** - Uses GPT-4 to create an engaging Instagram caption
4. **Upload to S3** - Uploads the image to your AWS S3 bucket
5. **Post to Instagram** - Publishes the image with caption to Instagram

## Generated Images Storage

All AI-generated images are saved to the `generated-images/` directory with timestamps:

```
generated-images/
├── 1733942400000_a_woman_on_a_beach_smiling_drinking.png
├── 1733942500000_serene_mountain_landscape_at_sunset.png
└── ...
```

**Note:** This directory is excluded from git via `.gitignore` to prevent accidentally committing images.

## Best Practices

### Writing Effective Prompts

✅ **Good Prompts:**
- "A serene mountain landscape at sunset with snow-capped peaks"
- "A cozy coffee shop interior with warm lighting and plants"
- "A golden retriever puppy playing in a field of flowers"

❌ **Less Effective:**
- "Nice picture" (too vague)
- "Something cool" (not descriptive)
- Very long prompts over 200 words (be concise)

### Tips

1. **Be Specific**: Include details about subject, setting, lighting, mood
2. **Keep it Simple**: 1-2 sentences is usually enough
3. **Avoid Trademarks**: Don't reference copyrighted characters or brands
4. **Natural Language**: Write as you would describe it to a person

## AI Models Used

- **Image Generation**: Gemini Imagen (`imagen-4.0-generate-001` by default) or DALL·E 3 (OpenAI)
- **Caption Generation**: OpenAI GPT-4

## Provider selection

The backend selects the image provider like this:

1. If `IMAGE_GENERATION_PROVIDER` is set to `gemini` or `openai`, it will be used.
2. Otherwise, if `GEMINI_API_KEY` is set, image generation uses **Gemini Imagen**.
3. Otherwise, image generation uses **OpenAI DALL·E**.

## Cost Considerations

### OpenAI Pricing (as of Dec 2024)

- **DALL-E 3 (1024x1024 standard)**: ~$0.04 per image
- **GPT-4**: ~$0.03-0.06 per request (for caption generation)

**Total cost per AI-generated post: ~$0.07-0.10**

### AWS S3 & Instagram

- S3 storage: Minimal (~$0.001 per image)
- Instagram API: Free

## Existing Functionality Preserved

The original `/publish-instagram` endpoint remains completely unchanged:

```bash
# Still works exactly as before!
curl -X POST http://localhost:8080/publish-instagram \
  -H "Content-Type: application/json" \
  -d '{
    "image_path": "/path/to/local/image.jpg",
    "caption": "My custom caption"
  }'
```

Both endpoints coexist independently with zero interference.

## Troubleshooting

### "OPENAI_API_KEY environment variable is not set"

**Solution:** Add your OpenAI API key to the `.env` file.

### "Image generation failed: ..."

**Common Causes:**
1. Invalid API key
2. Insufficient OpenAI credits
3. Prompt violates OpenAI content policy
4. Network connectivity issues

**Solution:** Check your OpenAI account status and billing.

### Caption generation fails but image succeeds

The system has a fallback mechanism. If caption generation fails, it will use your original prompt as the caption with a ✨ emoji.

### Generated images not appearing in directory

Check that the `generated-images/` directory exists in your project root. The service creates it automatically, but ensure you have write permissions.

## Example Prompts to Try

1. "A minimalist workspace with a laptop, coffee cup, and succulent plant"
2. "A vibrant street food market at night with colorful lights"
3. "A peaceful lake surrounded by autumn trees with morning mist"
4. "A modern kitchen with marble countertops and natural sunlight"
5. "A happy group of friends having a picnic in a park"

## Next Steps

- Test the endpoint with various prompts
- Monitor the quality of generated captions
- Adjust prompts based on results
- Consider implementing prompt templates for consistent style

