import json
import os
import requests
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from datetime import datetime

from google import genai
from google.genai import types


@dataclass
class AgentConfig:
    agent_id: str
    region: str
    text_model: str
    image_model: str
    system_instructions: str


def load_config(path: str = "agent_config.json", prompt_path: str = "prompt.md") -> AgentConfig:
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    
    # Read system instructions from prompt.md file
    with open(prompt_path, "r", encoding="utf-8") as f:
        system_instructions = f.read()
    
    return AgentConfig(
        agent_id=raw["agent_id"],
        region=raw["region"],
        text_model=raw["text_model"],
        image_model=raw["image_model"],
        system_instructions=system_instructions,
    )


def _extract_image_bytes(resp) -> Optional[bytes]:
    # Gemini responses contain "parts". Images appear as inline_data bytes.
    try:
        parts = resp.candidates[0].content.parts
    except Exception:
        return None
    for part in parts:
        if getattr(part, "inline_data", None) is not None:
            return part.inline_data.data
    return None


def _extract_image_url(message: str) -> tuple[str, Optional[str]]:
    """
    Extract image URL or file path from message text.
    Returns (clean_text, image_source) where image_source can be a URL or file path.
    """
    import re
    
    # Pattern to match HTTP/HTTPS URLs
    url_pattern = r'https?://[^\s]+'
    
    # Find all URLs in the message
    urls = re.findall(url_pattern, message)
    
    if urls:
        # Use the first URL found
        image_source = urls[0]
        # Remove the URL from the message to get clean text
        clean_text = re.sub(re.escape(image_source), '', message).strip()
    else:
        # Look for file paths (common patterns)
        # Matches: /path/to/file.jpg, ./file.png, ~/file.jpg, file.jpeg, etc.
        file_pattern = r'(?:\.{0,2}/)?(?:[\w\-~/]+/)*[\w\-]+\.(?:jpg|jpeg|png|gif|webp|bmp)'
        files = re.findall(file_pattern, message, re.IGNORECASE)
        
        if files:
            image_source = files[0]
            # Remove the file path from the message
            clean_text = re.sub(re.escape(image_source), '', message).strip()
        else:
            return message, None
    
    # Clean up extra whitespace
    clean_text = ' '.join(clean_text.split())
    
    return clean_text, image_source


def _get_mime_type_from_path(path: str) -> str:
    """Determine MIME type from file extension."""
    path_lower = path.lower()
    if path_lower.endswith('.jpg') or path_lower.endswith('.jpeg'):
        return 'image/jpeg'
    elif path_lower.endswith('.png'):
        return 'image/png'
    elif path_lower.endswith('.webp'):
        return 'image/webp'
    elif path_lower.endswith('.gif'):
        return 'image/gif'
    elif path_lower.endswith('.bmp'):
        return 'image/bmp'
    else:
        return 'image/jpeg'  # default


def _load_local_image(file_path: str) -> Optional[types.Part]:
    """
    Load an image from a local file and return it as a Google GenAI Part.
    Returns None if file doesn't exist or can't be read.
    """
    try:
        # Expand user home directory if path starts with ~
        expanded_path = os.path.expanduser(file_path)
        
        # Read the image file
        with open(expanded_path, 'rb') as f:
            image_bytes = f.read()
        
        # Determine mime type from file extension
        mime_type = _get_mime_type_from_path(file_path)
        
        # Create Google GenAI Part object from bytes
        part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)
        return part
    except Exception as e:
        print(f"Warning: Failed to load local image from {file_path}: {e}")
        return None


def _download_image_from_url(url: str) -> Optional[types.Part]:
    """
    Download an image from a URL and return it as a Google GenAI Part.
    Returns None if download fails.
    """
    try:
        # Add headers to avoid 403 Forbidden errors from websites
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': url
        }
        
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Determine mime type from response or file extension
        content_type = response.headers.get('content-type', '').lower()
        if 'image/' in content_type:
            mime_type = content_type.split(';')[0]  # Remove any charset info
        else:
            mime_type = _get_mime_type_from_path(url)
        
        # Create Google GenAI Part object from bytes
        part = types.Part.from_bytes(data=response.content, mime_type=mime_type)
        return part
    except Exception as e:
        print(f"Warning: Failed to download image from {url}: {e}")
        return None


def _load_image(source: str) -> Optional[types.Part]:
    """
    Load an image from either a URL or local file path as a Part object.
    Returns None if loading fails.
    """
    # Check if it's a URL or local file
    if source.startswith('http://') or source.startswith('https://'):
        return _download_image_from_url(source)
    else:
        return _load_local_image(source)


class NanoBananaAgent:
    """
    Minimal stateful agent:
    - Keeps a local in-memory message history (Step 11 will persist this).
    - Uses a text model for reasoning + tool routing.
    - Uses gemini-2.5-flash-image for image creation.
    """

    def __init__(self, project_id: str, config: AgentConfig, service_account_path: str = "secrets/sa.json"):
        self.project_id = project_id
        self.config = config
        
        # Set the service account credentials path
        if os.path.exists(service_account_path):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = service_account_path
        else:
            print(f"Warning: Service account file not found at {service_account_path}")
        
        self.client = genai.Client(
            vertexai=True,
            project=self.project_id,
            location=self.config.region,
        )
        self.history: List[Dict[str, Any]] = []  # [{"role":"user|assistant","content":"...","image_url":Optional[str]}]

    def chat(self, user_message: str) -> Dict[str, Any]:
        """
        Returns:
          { "type": "text", "text": "..." }
        or
          { "type": "image", "file": "timestamp.png" }
        """
        # Handle special start conversation message
        is_initial_greeting = user_message == "START_CONVERSATION"
        
        if is_initial_greeting:
            # For initial greeting, use a message that triggers the agent's greeting behavior
            user_message = "Hola"
        
        # Extract image URL or file path if present in the message
        clean_text, image_source = _extract_image_url(user_message)
        
        # Store in history with optional image reference
        self.history.append({
            "role": "user", 
            "content": clean_text if clean_text else user_message,
            "image_url": image_source  # Can be URL or file path
        })

        # Build conversation history for context, including image references
        conversation_parts = []
        for m in self.history[-12:]:
            msg_text = f'{m["role"].upper()}: {m["content"]}'
            if m.get("image_url"):
                msg_text += f' [Image: {m["image_url"]}]'
            conversation_parts.append(msg_text)
        conversation = "\n".join(conversation_parts)

        # Build the prompt that respects the system instructions workflow
        full_prompt = f"""
{self.config.system_instructions}

---

CONVERSATION SO FAR:
{conversation}

---

INSTRUCTIONS:
Follow your workflow as defined in the system instructions above. Have a natural conversation with the user.

When you're ready to generate an image, use this exact format:
[TRIGGER_GENERATE_NANOBANANA]
IMAGE_PROMPT: <detailed single-line prompt for image generation>

Otherwise, respond naturally to continue the conversation.
""".strip()

        # Build content for Gemini - include image if present in current message
        if image_source:
            # Load the image (from URL or local file) and convert to Google GenAI Part
            image_part = _load_image(image_source)
            if image_part:
                # Multi-part content with text and image
                content_parts = [full_prompt, image_part]
            else:
                # Image loading failed, use text only
                print("Warning: Image loading failed, proceeding with text only")
                content_parts = [full_prompt]
        else:
            # Text-only content
            content_parts = [full_prompt]

        # Get response from the text model
        response = self.client.models.generate_content(
            model=self.config.text_model,
            contents=content_parts,
        )

        response_text = response.text or ""
        response_text_stripped = response_text.strip()

        # Check if the agent wants to generate an image
        if "[TRIGGER_GENERATE_NANOBANANA]" in response_text_stripped or "CALL_TOOL: GENERATE_IMAGE" in response_text_stripped:
            # Extract the image prompt
            image_prompt = ""
            for line in response_text.splitlines():
                line_stripped = line.strip()
                if line_stripped.startswith("IMAGE_PROMPT:"):
                    image_prompt = line_stripped[len("IMAGE_PROMPT:"):].strip()
                    break
                elif line_stripped.startswith("PROMPT:"):
                    image_prompt = line_stripped[len("PROMPT:"):].strip()
                    break
            
            # If no explicit prompt found, extract text before the trigger
            if not image_prompt:
                # Try to use the last user message as context
                image_prompt = f"Professional product photography: {user_message}"

            # Generate the image
            img_resp = self.client.models.generate_content(
                model=self.config.image_model,
                contents=[image_prompt],
            )
            img_bytes = _extract_image_bytes(img_resp)
            
            if not img_bytes:
                assistant_msg = "Image generation failed: no image bytes returned."
                self.history.append({"role": "assistant", "content": assistant_msg})
                return {"type": "text", "text": assistant_msg}

            # Create timestamp filename in format yyyyMMdd_hhmmss.png
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S.png")
            
            with open(timestamp, "wb") as f:
                f.write(img_bytes)

            # Extract any text before the trigger to show to user
            text_before_trigger = response_text_stripped.split("[TRIGGER_GENERATE_NANOBANANA]")[0].strip()
            if not text_before_trigger:
                text_before_trigger = f"✨ Generated image saved to {timestamp}"
            
            assistant_msg = f"{text_before_trigger}\n[Image generated: {timestamp}]"
            self.history.append({"role": "assistant", "content": assistant_msg})
            return {"type": "image", "file": timestamp, "text": text_before_trigger}

        # Regular conversation response
        self.history.append({"role": "assistant", "content": response_text_stripped})
        return {"type": "text", "text": response_text_stripped}


if __name__ == "__main__":
    # Update this if you use a different project
    PROJECT_ID = "postty-482019"

    cfg = load_config()
    agent = NanoBananaAgent(project_id=PROJECT_ID, config=cfg)

    print(f"Agent loaded: {cfg.agent_id}")
    print("Type a message. Examples:")
    print("- 'Quiero promocionar mis galletitas de navidad'")
    print("- 'I need a hero shot for my new protein powder jar'")
    print("- 'How should I showcase my handmade candles for Instagram?'")
    print("Type 'exit' to quit.\n")

    while True:
        msg = input("You: ").strip()
        if msg.lower() in ("exit", "quit"):
            break
        
        # Check if user provided an image URL or file path and give feedback
        _, detected_source = _extract_image_url(msg)
        if detected_source:
            # Determine if it's a URL or file path
            if detected_source.startswith('http://') or detected_source.startswith('https://'):
                source_type = "URL"
            else:
                source_type = "File"
            # Truncate for display if too long
            display_source = detected_source if len(detected_source) <= 60 else detected_source[:60] + "..."
            print(f"🖼️  Image {source_type} detected: {display_source}")
        
        result = agent.chat(msg)
        if result["type"] == "text":
            print("\nAssistant:", result["text"], "\n")
        else:
            # Image generated
            if "text" in result and result["text"]:
                print("\nAssistant:", result["text"])
            print(f"📸 Image saved to: {result['file']}\n")
