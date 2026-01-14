import json
import os
import sys
import contextlib
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


# ============================================================================
# DEPRECATED 2025-01-07: JSON file-based text generation
# Text overlays now use SQLite design_guidelines column instead of JSON files
# This function is preserved for potential future reference but is no longer used
# ============================================================================
"""
def _load_reference_json(reference_filename: str) -> Optional[Dict[str, Any]:
    Load JSON file associated with a reference image.
    Returns None if JSON doesn't exist.
    DEPRECATED: Text now uses SQLite design_guidelines column
    try:
        # Get base name without extension
        base_name = os.path.splitext(reference_filename)[0]
        
        # Try reference-library/Jsons directory
        json_path = os.path.join(os.getcwd(), 'reference-library', 'Jsons', f'{base_name}.json')
        
        if os.path.exists(json_path):
            with open(json_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        
        print(f"[DEBUG] No JSON found for reference: {reference_filename}")
        return None
    except Exception as e:
        print(f"[DEBUG] Error loading reference JSON: {e}")
        return None
"""


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
        
        # Additional state for tool handlers
        self.backend_url = os.environ.get('BACKEND_URL', 'http://localhost:3000')
        self.selected_reference = None  # Store user's reference selection
        self.product_image_path = None  # Store uploaded product image path
        self.text_content = None  # Store user's text specifications for overlay
        self.awaiting_text_input = False  # Flag to track if we're waiting for text input
        self.design_guidelines = None  # Typography specs from selected reference (from SQLite)
        self.product_analysis = None  # Product image characteristics (colors, category, composition)

    def chat(self, user_message: str, image_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Returns:
          { "type": "text", "text": "..." }
        or
          { "type": "image", "file": "timestamp.png" }
        or
          { "type": "reference_options", "text": "...", "references": [...] }
        """
        # Store product image path if provided
        if image_path:
            self.product_image_path = image_path
        
        # Handle special reset conversation message
        if user_message == "RESET_CONVERSATION":
            # Clear all state to start fresh
            self.history = []
            self.selected_reference = None
            self.product_image_path = None
            self.text_content = None
            self.awaiting_text_input = False
            self.design_guidelines = None
            self.product_analysis = None
            
            # Return fresh greeting
            return {
                "type": "text",
                "text": "¡Hola! Soy tu especialista en fotografía de producto para Instagram. Para empezar, **subí la foto de tu producto** usando el botón (+) y te voy a ayudar a crear contenido profesional que destaque tu producto. 📸"
            }
        
        # Detect if user wants to start over with a new product
        user_msg_lower = user_message.lower()
        start_over_keywords = [
            'otro producto', 'nueva imagen', 'nuevo producto', 'empezar de nuevo',
            'start over', 'different product', 'another product', 'new product',
            'quiero crear otra', 'vamos a crear una nueva', 'crear algo con otro',
            'imagen de producto nueva', 'producto nueva'
        ]
        
        if any(keyword in user_msg_lower for keyword in start_over_keywords):
            # User wants to start over - reset all state
            print("[DEBUG] User requested to start over with new product - resetting state")
            self.history = []
            self.selected_reference = None
            self.product_image_path = None
            self.text_content = None
            self.awaiting_text_input = False
            self.design_guidelines = None
            self.product_analysis = None
            
            reset_msg = "¡Claro que sí! Entendido, vamos a empezar de nuevo. **Subí la foto del nuevo producto** y te ayudo a crear algo increíble. 📸"
            # Add a special marker to history to indicate a reset point
            self.history.append({"role": "assistant", "content": reset_msg, "is_reset": True})
            return {
                "type": "text",
                "text": reset_msg
            }
        
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

        # Build content for Gemini - include image if present in current message or stored product image
        image_to_analyze = image_source or self.product_image_path
        
        if image_to_analyze:
            # Load the image (from URL or local file) and convert to Google GenAI Part
            image_part = _load_image(image_to_analyze)
            if image_part:
                # Multi-part content with text and image
                content_parts = [full_prompt, image_part]
                print(f"Including product image in analysis: {image_to_analyze}")
            else:
                # Image loading failed, use text only
                print(f"Warning: Image loading failed for {image_to_analyze}, proceeding with text only")
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

        # Check if user is selecting a reference (1, 2, 3)
        if user_message.strip().isdigit():
            selected_num = int(user_message.strip())
            if 1 <= selected_num <= 3:
                # Find the last message with references (after any reset points)
                for msg in reversed(self.history):
                    # Stop searching if we hit a reset point
                    if msg.get("is_reset"):
                        break
                    if msg.get("references"):
                        refs = msg["references"]
                        if selected_num <= len(refs):
                            self.selected_reference = refs[selected_num - 1]
                            print(f"[DEBUG] User selected reference #{selected_num}: {self.selected_reference.get('filename')}")
                            
                            # Store design_guidelines from selected reference (Step 5)
                            self.design_guidelines = self.selected_reference.get('design_guidelines', {})
                            print(f"[DEBUG] Stored design_guidelines with typography: {self.design_guidelines.get('typography', {}) if isinstance(self.design_guidelines, dict) else 'N/A'}")
                            
                            # Analyze product image for text adaptation (Step 5.4)
                            if self.product_image_path:
                                try:
                                    self.product_analysis = self._analyze_product_for_text_context()
                                    print(f"[DEBUG] Product analysis completed: {self.product_analysis}")
                                except Exception as e:
                                    print(f"[DEBUG] Product analysis failed: {e}")
                                    self.product_analysis = None
                            
                            # After reference selection and product analysis, ask about text content (Step 5.5)
                            self.awaiting_text_input = True
                            
                            # Build dynamic text question based on design_guidelines from reference
                            text_elements = []
                            if isinstance(self.design_guidelines, dict):
                                typography = self.design_guidelines.get('typography', {})
                                
                                # Check for headline
                                headline = typography.get('headline', {})
                                if headline:
                                    purpose = headline.get('text_purpose', 'frase destacada')
                                    if purpose == 'product name':
                                        text_elements.append("- **Nombre del producto** (título principal)")
                                    elif purpose == 'benefit':
                                        text_elements.append("- **Beneficio principal** (ej: 'Hidratación profunda', 'Rendimiento mejorado')")
                                    elif purpose == 'offer':
                                        text_elements.append("- **Oferta destacada** (ej: '50% OFF', '3x2')")
                                    elif purpose == 'question':
                                        text_elements.append("- **Pregunta destacada** (ej: '¿Listo para el cambio?')")
                                    else:
                                        text_elements.append("- **Título principal o frase destacada**")
                                
                                # Check for subheadline
                                subheadline = typography.get('subheadline', {})
                                if subheadline and subheadline.get('present', False):
                                    purpose = subheadline.get('text_purpose', 'descripción')
                                    if purpose == 'benefits':
                                        text_elements.append("- **Beneficios adicionales** (características del producto)")
                                    elif purpose == 'features':
                                        text_elements.append("- **Características** (detalles técnicos o ingredientes)")
                                    elif purpose == 'tagline':
                                        text_elements.append("- **Tagline o frase secundaria**")
                                    elif purpose == 'ingredients':
                                        text_elements.append("- **Ingredientes o componentes principales**")
                                    else:
                                        text_elements.append("- **Texto secundario o subtítulo**")
                                
                                # Check for badges
                                badges = typography.get('badges', {})
                                if badges and badges.get('present', False):
                                    content = badges.get('content', '')
                                    if 'discount' in content or 'price' in content:
                                        text_elements.append("- **Descuento o precio especial** (ej: '30% OFF', '$999')")
                                    elif 'certification' in content:
                                        text_elements.append("- **Certificación o badge** (ej: 'Orgánico', 'Vegan', 'Cruelty-free')")
                                    elif 'size' in content:
                                        text_elements.append("- **Tamaño o cantidad** (ej: '500ml', 'Pack x3')")
                                    else:
                                        text_elements.append("- **Badge o etiqueta destacada**")
                                
                                # Check for CTA button
                                cta = self.design_guidelines.get('cta_button', {})
                                if cta and cta.get('present', False):
                                    text_elements.append("- **Llamado a acción** (ej: 'Comprá ahora', 'Ver más', 'Link en bio')")
                            
                            # Build the question
                            if text_elements:
                                elements_text = "\n".join(text_elements)
                                text_question = (
                                    f"Perfecto! Basándome en la referencia que elegiste, necesito:\n\n"
                                    f"{elements_text}\n\n"
                                    "O decime **'sin texto'** si preferís la imagen sola."
                                )
                            else:
                                # Fallback to generic if no typography info available
                                text_question = (
                                    "Perfecto! Ahora, ¿qué texto querés que tenga tu post de Instagram?\n\n"
                                    "Podés incluir:\n"
                                    "- Título principal o frase destacada\n"
                                    "- Oferta o beneficio (ej: '3x2', 'Envío gratis')\n"
                                    "- Llamado a acción (ej: 'Comprá ahora', 'Link en bio')\n\n"
                                    "O decime **'sin texto'** si preferís la imagen sola."
                                )
                            
                            print(f"[DEBUG] Generated dynamic text question with {len(text_elements)} elements from design_guidelines")
                            self.history.append({"role": "assistant", "content": text_question})
                            return {"type": "text", "text": text_question}
        
        # Check if we're waiting for text input from user (Step 5.5 response)
        if self.awaiting_text_input:
            self.awaiting_text_input = False
            
            # Check if user wants no text
            user_msg_lower = user_message.lower().strip()
            no_text_keywords = ['sin texto', 'no texto', 'sin text', 'no text', 'imagen sola', 'ninguno', 'nada', 'skip']
            
            if any(keyword in user_msg_lower for keyword in no_text_keywords):
                # User wants no text
                self.text_content = None
                print("[DEBUG] User chose no text overlay")
                
                ready_msg = (
                    "Perfecto! Tengo todo listo para crear tu post sin texto:\n"
                    f"- {self.selected_reference.get('description', 'Referencia seleccionada')}\n\n"
                    "**Cuando quieras generar el post, apretá el botón 'Generar' y listo.**"
                )
                self.history.append({"role": "assistant", "content": ready_msg})
                return {"type": "text", "text": ready_msg}
            else:
                # Parse user's text specifications
                self.text_content = self._parse_text_content(user_message)
                print(f"[DEBUG] User text content parsed: {self.text_content}")
                
                # Build preview of what will be included
                text_preview_parts = []
                if self.text_content.get('headline'):
                    text_preview_parts.append(f"- Título: '{self.text_content['headline']}'")
                if self.text_content.get('subheadline'):
                    text_preview_parts.append(f"- Oferta/Subtítulo: '{self.text_content['subheadline']}'")
                if self.text_content.get('cta'):
                    text_preview_parts.append(f"- Llamado a acción: '{self.text_content['cta']}'")
                
                text_preview = "\n".join(text_preview_parts) if text_preview_parts else "- Texto personalizado"
                
                ready_msg = (
                    "Perfecto! Tengo todo listo para crear tu post:\n"
                    f"{text_preview}\n"
                    f"- Basado en la referencia que elegiste\n\n"
                    "**Cuando quieras generar el post, apretá el botón 'Generar' y listo.**"
                )
                self.history.append({"role": "assistant", "content": ready_msg})
                return {"type": "text", "text": ready_msg}
        
        # Check for reference search trigger
        if "[TRIGGER_SEARCH_REFERENCES]" in response_text_stripped:
            return self._handle_search_references(response_text_stripped)
        
        # Check for pipeline generation trigger
        if "[TRIGGER_GENERATE_PIPELINE]" in response_text_stripped:
            return self._handle_generate_pipeline(response_text_stripped)

        # Check for reel generation trigger (Veo -> ready_to_upload)
        if "[TRIGGER_GENERATE_REEL]" in response_text_stripped:
            return self._handle_generate_reel(response_text_stripped)

        # Check if the agent wants to generate an image (legacy Gemini direct)
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
    
    def _parse_text_content(self, user_message: str) -> Dict[str, str]:
        """
        Parse user's text specifications into structured format.
        Returns dict with headline, subheadline, and/or cta keys.
        """
        text_content = {}
        
        # Simple heuristic parsing
        # Look for common patterns in Spanish/English
        msg_lower = user_message.lower()
        
        # Try to identify CTA (call to action) keywords
        cta_keywords = ['comprá', 'compra', 'buy', 'shop', 'link en bio', 'link in bio', 'visita', 'visit', 'descubrí', 'descubre']
        
        # Split by common separators
        lines = user_message.replace(' y ', '\n').replace(' Y ', '\n').split('\n')
        
        # Collect all text pieces
        text_pieces = []
        for line in lines:
            line = line.strip().strip('"').strip("'").strip(',').strip()
            if line and len(line) > 1:
                text_pieces.append(line)
        
        # Assign pieces to roles based on position and keywords
        if len(text_pieces) >= 3:
            # 3+ pieces: headline, subheadline, cta
            text_content['headline'] = text_pieces[0]
            text_content['subheadline'] = text_pieces[1]
            text_content['cta'] = text_pieces[2]
        elif len(text_pieces) == 2:
            # 2 pieces: check if second is CTA
            text_content['headline'] = text_pieces[0]
            if any(kw in text_pieces[1].lower() for kw in cta_keywords):
                text_content['cta'] = text_pieces[1]
            else:
                text_content['subheadline'] = text_pieces[1]
        elif len(text_pieces) == 1:
            # Just one piece: make it headline
            text_content['headline'] = text_pieces[0]
        else:
            # Fallback: use entire message as headline
            text_content['headline'] = user_message.strip()
        
        return text_content

    def _handle_generate_reel(self, response_text: str) -> Dict[str, Any]:
        """
        Handle TOOL 3 trigger from prompt.md:
        [TRIGGER_GENERATE_REEL]
        PRODUCT_IMAGE: <optional path>
        PROMPT: <video prompt>
        CAPTION: <optional caption>

        This starts an async Veo job on the backend that saves the reel as ready_to_upload (Firestore-backed).
        """
        try:
            # Extract fields after the trigger
            block = response_text.split("[TRIGGER_GENERATE_REEL]", 1)[1]
            lines = [ln.strip() for ln in block.splitlines() if ln.strip()]

            product_image = None
            prompt = None
            caption = None

            for ln in lines:
                if ln.startswith("PRODUCT_IMAGE:"):
                    v = ln.split(":", 1)[1].strip()
                    product_image = v if v else None
                elif ln.startswith("PROMPT:"):
                    prompt = ln.split(":", 1)[1].strip()
                elif ln.startswith("CAPTION:"):
                    caption = ln.split(":", 1)[1].strip()

            if not prompt:
                return {"type": "text", "text": "Faltó el PROMPT para generar el reel."}

            backend_url = os.environ.get("BACKEND_URL", self.backend_url or "http://localhost:8080")
            internal_token = os.environ.get("POSTTY_INTERNAL_TOKEN", "")
            user_id = getattr(self, "user_id", None)

            if not user_id:
                # Fallback: use product image path as session marker (best-effort, should be uid in production)
                user_id = "unknown"

            files: Dict[str, Any] = {}
            data = {
                "prompt": prompt,
                "caption": caption or "",
                "userId": user_id,
            }

            headers = {}
            if internal_token:
                headers["X-Postty-Internal-Token"] = internal_token

            print(f"[DEBUG] Calling backend /video/generate for user {str(user_id)[:8]}...", file=sys.stderr, flush=True)
            # Always send multipart/form-data (Fastify expects multipart parsing on this endpoint).
            # If we don't attach a file, `requests` would otherwise default to x-www-form-urlencoded.
            with contextlib.ExitStack() as stack:
                # Prefer explicit PRODUCT_IMAGE; fall back to stored uploaded image
                image_path = product_image or self.product_image_path
                if image_path and os.path.exists(os.path.expanduser(image_path)):
                    expanded = os.path.expanduser(image_path)
                    f = stack.enter_context(open(expanded, "rb"))
                    files["productImage"] = (os.path.basename(expanded), f)
                else:
                    # Force multipart even when no product image is available
                    files["_forceMultipart"] = ("force.txt", b"")

                resp = requests.post(
                    f"{backend_url}/video/generate",
                    data=data,
                    files=files,
                    headers=headers,
                    timeout=30,
                )
            try:
                payload = resp.json()
            except Exception:
                payload = {"status": "error", "message": resp.text}

            if resp.status_code >= 400 or payload.get("status") != "accepted":
                msg = payload.get("message") or f"HTTP {resp.status_code}"
                return {"type": "text", "text": f"Hubo un error al iniciar el reel: {msg}"}

            post_id = payload.get("postId")
            ready_msg = (
                "Listo. Estoy generando tu reel ahora. "
                "Te avisamos cuando esté listo para subir en **Mis posts**."
            )
            return {"type": "text", "text": ready_msg, "postId": post_id}
        except Exception as e:
            return {"type": "text", "text": f"Error iniciando el reel: {str(e)}"}
    
    def _analyze_product_for_text_context(self) -> Dict[str, Any]:
        """
        Analyze product image to extract context for text adaptation.
        Returns dict with colors, category, and composition information.
        This is Step 5.4 in the workflow.
        """
        if not self.product_image_path:
            return {
                'colors': [],
                'category': 'neutral',
                'composition': 'center'
            }
        
        try:
            # Build a simple prompt to analyze product image for text context
            analysis_prompt = """Analyze this product image and extract:
1. Dominant colors (up to 3 hex codes)
2. Product category/aesthetic (luxury, casual, tech, organic, minimal, bold)
3. Product position in image (center, left, right, top, bottom)
4. Available text zones (areas where text won't obscure the product)

Return ONLY a JSON object with this structure:
{
  "colors": ["#hex1", "#hex2", "#hex3"],
  "category": "luxury|casual|tech|organic|minimal|bold",
  "composition": {
    "product_position": "center|left|right|top|bottom",
    "available_zones": ["top", "bottom", "left", "right"]
  }
}"""
            
            # Load product image
            image_part = _load_image(self.product_image_path)
            if not image_part:
                raise Exception("Failed to load product image")
            
            # Call Gemini for analysis
            response = self.client.models.generate_content(
                model=self.config.text_model,
                contents=[analysis_prompt, image_part],
            )
            
            response_text = (response.text or "").strip()
            
            # Try to parse JSON response
            import json
            # Remove markdown code blocks if present
            if response_text.startswith('```'):
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
                response_text = response_text.strip()
            
            analysis = json.loads(response_text)
            print(f"[DEBUG] Product analysis result: {analysis}")
            return analysis
            
        except Exception as e:
            print(f"[DEBUG] Product analysis error: {e}")
            # Return safe defaults
            return {
                'colors': ['#000000'],
                'category': 'neutral',
                'composition': {
                    'product_position': 'center',
                    'available_zones': ['top', 'bottom']
                }
            }
    
    def _handle_search_references(self, response_text: str) -> Dict[str, Any]:
        """
        Search reference library and present options to user
        """
        # Extract QUERY and LIMIT parameters
        query = ""
        limit = 3
        
        for line in response_text.splitlines():
            line_stripped = line.strip()
            if line_stripped.startswith("QUERY:"):
                query = line_stripped[len("QUERY:"):].strip()
            elif line_stripped.startswith("LIMIT:"):
                try:
                    limit = int(line_stripped[len("LIMIT:"):].strip())
                except:
                    limit = 3
        
        if not query:
            # Fallback query from context
            query = "product photography professional"
        
        try:
            import requests
            
            # Call backend search endpoint
            response = requests.post(
                f'{self.backend_url}/search-references',
                json={'query': query, 'limit': limit},
                timeout=10
            )
            response.raise_for_status()
            result = response.json()
            
            if result.get('status') == 'success' and result.get('results'):
                # Format results for user display
                references = result['results']
                
                # Build message showing the references
                text_before_trigger = response_text.split("[TRIGGER_SEARCH_REFERENCES]")[0].strip()
                if not text_before_trigger:
                    text_before_trigger = "Encontré estas referencias que podrían inspirar tu imagen:"
                
                message_parts = [text_before_trigger, ""]
                
                for i, ref in enumerate(references, 1):
                    # Use 'tags' instead of 'keywords' (backend returns 'tags')
                    tags = ref.get('tags', [])
                    # Tags might be a string (comma-separated) or list
                    if isinstance(tags, str):
                        tags = [t.strip() for t in tags.split(',') if t.strip()]
                    tags_str = ", ".join(tags[:5]) if tags else ref.get('aesthetic', 'Sin estilo')
                    
                    # Build description from available fields (backend doesn't return 'description')
                    description_parts = []
                    if ref.get('industry'):
                        description_parts.append(ref['industry'])
                    if ref.get('aesthetic'):
                        description_parts.append(ref['aesthetic'])
                    if ref.get('mood'):
                        description_parts.append(ref['mood'])
                    description = " - ".join(description_parts) if description_parts else ref.get('filename', 'Referencia')
                    
                    message_parts.append(
                        f"{i}. {description}\n"
                        f"   Estilo: {tags_str}"
                    )
                
                message_parts.append("")
                message_parts.append("¿Cuál te gusta más? (1, 2, 3, o 'ninguna' si querés que genere sin referencia)")
                
                full_message = "\n".join(message_parts)
                
                # Store references in history for later use
                self.history.append({
                    "role": "assistant",
                    "content": full_message,
                    "references": references
                })
                
                return {
                    "type": "reference_options",
                    "text": full_message,
                    "references": references
                }
            else:
                fallback = "No encontré referencias exactas. ¿Querés que genere la imagen según tu descripción?"
                self.history.append({"role": "assistant", "content": fallback})
                return {"type": "text", "text": fallback}
                
        except Exception as e:
            error_msg = f"Error buscando referencias: {str(e)}"
            print(error_msg)
            fallback = "Tuve un problema buscando referencias. ¿Seguimos sin referencias visuales?"
            self.history.append({"role": "assistant", "content": fallback})
            return {"type": "text", "text": fallback}
    
    def _handle_generate_pipeline(self, response_text: str) -> Dict[str, Any]:
        """
        Generate image using /pipeline endpoint with product + reference + prompt
        """
        # Extract parameters - use stored product image path
        product_image = self.product_image_path
        reference_image = ""
        prompt = ""
        skip_text = "true"
        
        # Use selected reference if available
        if self.selected_reference:
            reference_image = self.selected_reference.get('filename', '')
            print(f"[DEBUG] Using stored selected reference: {reference_image}")
        
        for line in response_text.splitlines():
            line_stripped = line.strip()
            # NOTE: Don't override product_image - we use the stored path from upload
            # The LLM might hallucinate incorrect paths
            # Only override reference if not already set from selection
            if line_stripped.startswith("REFERENCE_IMAGE:") and not reference_image:
                reference_image = line_stripped[len("REFERENCE_IMAGE:"):].strip()
            elif line_stripped.startswith("PROMPT:"):
                prompt = line_stripped[len("PROMPT:"):].strip()
            elif line_stripped.startswith("SKIP_TEXT:"):
                skip_text = line_stripped[len("SKIP_TEXT:"):].strip()
        
        if not product_image:
            error_msg = "No product image available for generation"
            print(f"[DEBUG] No product image path stored")
            self.history.append({"role": "assistant", "content": error_msg})
            return {"type": "text", "text": error_msg}
        
        print(f"[DEBUG] Using product image: {product_image}")
        print(f"[DEBUG] Using reference: {reference_image}")
        print(f"[DEBUG] Using prompt: {prompt}")
        
        if not prompt:
            prompt = "Professional product photography with elegant composition"
        
        try:
            import requests
            import json
            
            # Check if user provided text content
            has_text = self.text_content is not None and len(self.text_content) > 0
            
            # Build multipart form data with proper file handle management
            with open(product_image, 'rb') as product_file:
                files = {'productImage': product_file}
                data = {
                    'textPrompt': prompt,
                    'referenceImage': reference_image if reference_image else '',
                    'skipText': 'false',  # Let Gemini generate text
                    'language': 'es',
                    'aspectRatio': '1:1',
                }
                
                # Add text specifications if user provided text
                if has_text:
                    print(f"[DEBUG] User provided text: {self.text_content}")
                    
                    # Convert text_content dict to ordered array (by position)
                    text_array = []
                    if self.text_content.get('headline'):
                        text_array.append(self.text_content['headline'])
                    if self.text_content.get('subheadline'):
                        text_array.append(self.text_content['subheadline'])
                    if self.text_content.get('cta'):
                        text_array.append(self.text_content['cta'])
                    
                    print(f"[DEBUG] Text array: {text_array}")
                    data['userText'] = json.dumps(text_array)
                    
                    # Add typography guidelines from design_guidelines
                    if self.design_guidelines and self.design_guidelines.get('typography'):
                        print(f"[DEBUG] Including typography guidelines from SQLite")
                        data['typographyStyle'] = json.dumps(self.design_guidelines['typography'])
                    
                    # Add product analysis for color adaptation
                    if self.product_analysis:
                        print(f"[DEBUG] Including product analysis for color adaptation")
                        data['productAnalysis'] = json.dumps(self.product_analysis)
                else:
                    # No text requested - generate base image only
                    data['skipText'] = 'true'
                    print(f"[DEBUG] No text content, generating base image only")
                
                # Call pipeline endpoint - Gemini generates complete image with text
                print(f"[DEBUG] Calling pipeline with skipText={data['skipText']}")
                response = requests.post(
                    f'{self.backend_url}/pipeline',
                    files=files,
                    data=data,
                    timeout=60  # Pipeline can take longer
                )
            
            response.raise_for_status()
            result = response.json()
            
            if not result.get('success') or not result.get('finalImagePath'):
                error_msg = "La generación de imagen falló. ¿Intentamos de nuevo?"
                self.history.append({"role": "assistant", "content": error_msg})
                return {"type": "text", "text": error_msg}
            
            final_image_path = result['finalImagePath']
            print(f"[DEBUG] Complete image generated: {final_image_path}")
            
            # Increment ranking for the reference that was used
            if reference_image:
                try:
                    import os
                    import requests
                    reference_filename = os.path.basename(reference_image)
                    print(f"[DEBUG] Incrementing ranking for reference: {reference_filename}", file=sys.stderr)
                    requests.post(
                        f'{self.backend_url}/increment-reference-ranking',
                        json={'referenceFilename': reference_filename},
                        timeout=5
                    )
                except Exception as e:
                    print(f"[DEBUG] Failed to increment ranking: {e}", file=sys.stderr)
            
            # Extract text before trigger
            text_before_trigger = response_text.split("[TRIGGER_GENERATE_PIPELINE]")[0].strip()
            if not text_before_trigger:
                text_before_trigger = "✨ ¡Listo! Acá está tu imagen"
            
            assistant_msg = f"{text_before_trigger}\n[Image generated via pipeline]"
            self.history.append({"role": "assistant", "content": assistant_msg})
            
            # Build response with textLayout if available
            response = {
                "type": "image",
                "file": final_image_path,
                "text": text_before_trigger
            }
            
            # Add textLayout if it was captured from JSON application
            if 'text_layout' in locals() and text_layout:
                response['textLayout'] = text_layout
            
            return response
                
        except Exception as e:
            error_msg = f"Error generando imagen: {str(e)}"
            print(error_msg)
            fallback = "Tuve un problema generando la imagen. ¿Intentamos de nuevo?"
            self.history.append({"role": "assistant", "content": fallback})
            return {"type": "text", "text": fallback}


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
