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

# ============================================================================
# DEBUG TRACKER - Logs all agent actions for visibility
# ============================================================================
class AgentDebugTracker:
    """Tracks all agent actions with timestamps and data for debugging."""
    
    def __init__(self):
        self.actions = []
        self.start_time = None
    
    def start_flow(self, product_image_path: str):
        """Start tracking a new flow."""
        self.actions = []
        self.start_time = datetime.now()
        self._log("FLOW_START", {
            "product_image": product_image_path,
            "timestamp": self.start_time.isoformat()
        })
    
    def log_step(self, step_name: str, data: dict = None, success: bool = True, error: str = None):
        """Log a step in the flow."""
        elapsed = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
        action = {
            "step": step_name,
            "elapsed_seconds": round(elapsed, 2),
            "success": success,
            "data": data or {},
            "error": error
        }
        self.actions.append(action)
        
        # Print to stderr for visibility
        status = "✅" if success else "❌"
        print(f"[AGENT DEBUG] {status} Step {len(self.actions)}: {step_name} ({elapsed:.2f}s)", file=sys.stderr)
        if data:
            for key, value in data.items():
                val_str = str(value)[:100] + "..." if len(str(value)) > 100 else str(value)
                print(f"    → {key}: {val_str}", file=sys.stderr)
        if error:
            print(f"    ⚠️ Error: {error}", file=sys.stderr)
    
    def _log(self, action_type: str, data: dict):
        """Internal logging."""
        print(f"[AGENT DEBUG] {action_type}: {json.dumps(data, default=str)[:200]}", file=sys.stderr)
    
    def get_summary(self) -> dict:
        """Get a summary of all actions."""
        return {
            "total_steps": len(self.actions),
            "total_time": (datetime.now() - self.start_time).total_seconds() if self.start_time else 0,
            "actions": self.actions
        }

# Global debug tracker instance
debug_tracker = AgentDebugTracker()


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
        
        # Try API key first (from environment), then fall back to service account
        api_key = os.environ.get('GEMINI_API_KEY', '').strip()
        
        if api_key:
            # Use API key (simpler, works without service account)
            print(f"[DEBUG] Using Gemini API key authentication")
            self.client = genai.Client(api_key=api_key)
        else:
            # Fall back to VertexAI with service account
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
        self.backend_url = os.environ.get('BACKEND_URL', 'http://localhost:8080')
        self.selected_reference = None  # Store user's reference selection
        self.product_image_path = None  # Store uploaded product image path
        self.text_content = None  # Store user's text specifications for overlay
        self.awaiting_text_input = False  # Flag to track if we're waiting for text input
        self.design_guidelines = None  # Typography specs from selected reference (from SQLite)
        self.product_analysis = None  # Product image characteristics (colors, category, composition)
        self.last_scene_prompt = None  # Optional[str]
        
        # New state for v3 flow
        self.current_step = 0  # Track current workflow step (1-6)
        self.selected_post_type = None  # Store selected post type (hero-shot, product-on-human, etc.)
        self.post_type_examples = {}  # V2: Store post type example image IDs for prioritization
        self.design_changes = None  # Store user's requested design changes
        self.changes_summary = None  # Store summarized version of design changes
        self.text_analysis = None  # Store text analysis from selected reference
        self.last_smart_suggestions = None  # V2: Store smart suggestions for when user accepts them
        self.product_name = None  # Store analyzed product name
        self.product_industry = None  # Store analyzed product industry
        self.product_category = None  # Store analyzed product category (cream, serum, lipstick, etc.)
        self.available_references = []  # Store references from search for later selection
        self.last_generated_image = None  # Store path to last generated image for edit mode
        self.generation_count = 0  # Track number of generations (0=first, >0=edits)

    def chat(self, user_message: str, image_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Returns structured JSON for the frontend:
          { "type": "text", "text": "...", "readyToGenerate": bool }
        or
          { "type": "post_type_options", "text": "...", "postTypes": [...] }
        or
          { "type": "reference_options", "text": "...", "references": [...] }
        or
          { "type": "image", "imageUrl": "...", "text": "..." }
        """
        # Store product image path if provided
        if image_path:
            self.product_image_path = image_path
            # Reset state for new product
            self.current_step = 0
            self.selected_post_type = None
            self.selected_reference = None
            self.design_changes = None
            self.changes_summary = None
            self.text_content = None
            self.text_analysis = None
            self.design_guidelines = None
            
            # Step 1: Product uploaded, analyze and get post types
            print(f"[DEBUG] Product image uploaded, triggering Step 1: {image_path}")
            return self._handle_get_post_types()
        
        # Check if user selected a post type (Step 1 -> Step 2)
        user_msg_lower = user_message.lower().strip()
        
        # First, check against hardcoded keywords for common types
        post_type_keywords = {
            'hero shot': 'hero-shot',
            'hero-shot': 'hero-shot',
            'product on human': 'product-on-human',
            'product-on-human': 'product-on-human',
            'lifestyle': 'lifestyle',
            'flat lay': 'flat-lay',
            'flat-lay': 'flat-lay',
            'unboxing': 'unboxing',
            'ingredientes': 'ingredients',  # Spanish label -> English type
            'ingredients': 'ingredients',
        }
        
        for keyword, post_type in post_type_keywords.items():
            if keyword in user_msg_lower:
                self.selected_post_type = post_type
                print(f"[DEBUG] Post type selected (hardcoded): {post_type}, triggering Step 2")
                return self._handle_search_references_by_type(post_type)
        
        # DYNAMIC: If not found in hardcoded list, check against post_type_examples from backend
        # This allows any post type returned by the backend to work (e.g., "ingredientes", "ingredients", etc.)
        if self.post_type_examples:
            for pt_type in self.post_type_examples.keys():
                # Check if the post type name (or variations) is in the user message
                pt_lower = pt_type.lower()
                pt_readable = pt_type.replace('-', ' ').lower()
                if pt_lower in user_msg_lower or pt_readable in user_msg_lower:
                    self.selected_post_type = pt_type
                    print(f"[DEBUG] Post type selected (dynamic): {pt_type}, triggering Step 2")
                    return self._handle_search_references_by_type(pt_type)
        
        # Check if user selected a reference (Step 2 -> Step 3)
        # Look for UUID pattern in message - this indicates a reference selection
        import re
        id_match = re.search(r'([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})', user_message.lower())
        if id_match and self.available_references:
            ref_id = id_match.group(1)
            print(f"[DEBUG] Looking for reference ID: {ref_id} in {len(self.available_references)} available references")
            # Find reference in available_references
            for ref in self.available_references:
                if ref.get("id") == ref_id:
                    print(f"[DEBUG] Reference selected: {ref_id}, triggering Step 3")
                    return self._handle_reference_selected(ref)
            print(f"[DEBUG] Reference {ref_id} not found in available_references")
        
        # Check if we're at Step 3 waiting for design changes
        if self.current_step == 3 and not self.awaiting_text_input:
            print(f"[DEBUG] Processing design changes at Step 3")
            return self._handle_design_changes(user_message)
        
        # Check if we're awaiting text input (Step 4)
        if self.awaiting_text_input:
            print(f"[DEBUG] Processing text input at Step 4")
            return self._handle_text_confirmed(user_message)
        
        # ================================================================================
        # VERSION 2 (STABLE) - Edit Mode Detection (Step 7)
        # DO NOT MODIFY without explicit permission from the user.
        # ================================================================================
        # Check if we're in edit mode (Step 7) - user providing feedback on generated image
        if self.current_step == 7 and self.last_generated_image:
            # CRITICAL: Check if user clicked "Generar" FIRST before treating as feedback
            # This fix prevents the infinite thinking bug when user clicks Generate in edit mode
            if user_msg_lower in ['generar', 'generate']:
                print(f"[DEBUG] Edit mode: User clicked Generar, calling edit pipeline")
                return self._handle_edit_pipeline()
            
            # Check if user wants to start over
            start_over_words = ['nuevo', 'otra', 'empezar', 'diferente', 'cambiar producto', 'otro producto']
            if any(word in user_msg_lower for word in start_over_words):
                # User wants to start fresh - reset and prompt for new product
                print(f"[DEBUG] User wants to start over from edit mode")
                self.last_generated_image = None
                self.current_step = 0
                return {
                    "type": "text",
                    "text": "¡Perfecto! Para crear algo nuevo, subí la foto de tu producto usando el botón (+)."
                }
            
            # User is providing edit feedback
            print(f"[DEBUG] Processing edit feedback at Step 7: {user_message[:50]}...")
            return self._handle_edit_feedback(user_message)
        
        # Check if user clicked "Generar" (Step 5 -> Step 6, or edit mode)
        if user_msg_lower in ['generar', 'generate']:
            if self.generation_count == 0:
                # First generation - use normal pipeline
                print(f"[DEBUG] First generation, calling pipeline")
                self.current_step = 6
                return self._handle_generate_pipeline("[TRIGGER_GENERATE_PIPELINE]")
            else:
                # Edit mode - use edit pipeline with accumulated changes
                print(f"[DEBUG] Edit generation #{self.generation_count + 1}, calling edit pipeline")
                return self._handle_edit_pipeline()

        # Cache user's creative brief so generation always has a non-empty prompt.
        # We only record messages that look like an actual scene description (not control words / selections).
        try:
            msg_norm = (user_message or "").strip()
            msg_lower = msg_norm.lower()
            is_control = msg_lower in {"generar", "generate", "post", "reel", "reset_conversation", "start_conversation"}
            is_selection = msg_norm.isdigit()
            is_upload_marker = msg_norm in {"[user uploaded product image]", "📸 imagen subida"}
            # If we're awaiting text input, the user's message is likely the overlay copy, not the scene prompt.
            if (
                msg_norm
                and len(msg_norm) >= 20
                and not is_control
                and not is_selection
                and not is_upload_marker
                and not self.awaiting_text_input
            ):
                self.last_scene_prompt = msg_norm
        except Exception:
            # Never break chat flow due to caching logic
            pass
        
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
        # Sanitize: If LLM generated JSON as text, handle it gracefully
        # V2: Also handle cases where JSON block appears at the END of text
        if response_text_stripped.startswith('```json') or response_text_stripped.startswith('{'):
            print(f"[DEBUG] LLM generated JSON as text, sanitizing response")
            # Try to extract meaningful text or provide fallback
            try:
                import json
                # Remove markdown code block if present
                json_text = response_text_stripped
                if json_text.startswith('```json'):
                    json_text = json_text[7:]
                if json_text.startswith('```'):
                    json_text = json_text[3:]
                if json_text.endswith('```'):
                    json_text = json_text[:-3]
                json_text = json_text.strip()
                
                parsed = json.loads(json_text)
                # If it has a text field, use that
                if parsed.get('text'):
                    response_text_stripped = parsed['text']
                else:
                    response_text_stripped = "¿En qué te puedo ayudar?"
            except:
                response_text_stripped = "¿En qué te puedo ayudar?"
        
        # V2: Remove JSON blocks that appear at the END of text (LLM sometimes appends them)
        if '```json' in response_text_stripped:
            # Find the position of ```json and remove everything from there
            json_block_start = response_text_stripped.find('```json')
            if json_block_start > 0:
                print(f"[DEBUG] Removing trailing JSON block from response")
                response_text_stripped = response_text_stripped[:json_block_start].strip()
        
        # Also check for raw JSON object appended ({"type": ...)
        if '{"type":' in response_text_stripped or '{"text":' in response_text_stripped:
            # Find the first occurrence and remove from there
            for pattern in ['{"type":', '{"text":']:
                if pattern in response_text_stripped:
                    idx = response_text_stripped.find(pattern)
                    if idx > 50:  # Only if there's meaningful text before
                        print(f"[DEBUG] Removing appended JSON object from response")
                        response_text_stripped = response_text_stripped[:idx].strip()
        
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
    
    def _analyze_product_image(self) -> Dict[str, Any]:
        """
        Analyze product image with Gemini to extract product name and category.
        Returns dict with product_name, category, industry.
        """
        debug_tracker.log_step("1.1 ANALYZE_PRODUCT_IMAGE_START", {
            "image_path": self.product_image_path
        })
        
        if not self.product_image_path:
            debug_tracker.log_step("1.1 ANALYZE_PRODUCT_IMAGE", success=False, error="No product image path")
            return {
                'product_name': 'tu producto',
                'category': 'product',
                'industry': 'general'
            }
        
        try:
            analysis_prompt = """Analyze this product image and extract:
1. Product name (brand + product type if visible, e.g. "Vichy Mineral 89", "Clarins Multi-Active")
2. Product category (cream, serum, lipstick, shoes, watch, etc.)
3. Industry (beauty, fashion, food, tech, home, sports, etc.)

Return ONLY a JSON object with this structure:
{
  "product_name": "Brand Product Name",
  "category": "product category",
  "industry": "industry"
}

If you can't read the brand name clearly, describe it as "crema facial" or "producto de belleza" etc.
Be specific with the product name if you can see it."""

            # Load product image
            image_part = _load_image(self.product_image_path)
            if not image_part:
                debug_tracker.log_step("1.1 ANALYZE_PRODUCT_IMAGE", success=False, error="Failed to load image")
                raise Exception("Failed to load product image")
            
            debug_tracker.log_step("1.2 CALLING_GEMINI_VISION", {"model": self.config.text_model})
            
            # Call Gemini for analysis
            response = self.client.models.generate_content(
                model=self.config.text_model,
                contents=[analysis_prompt, image_part],
            )
            
            response_text = (response.text or "").strip()
            
            # Try to parse JSON response
            # Remove markdown code blocks if present
            if response_text.startswith('```'):
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
                response_text = response_text.strip()
            
            analysis = json.loads(response_text)
            
            debug_tracker.log_step("1.3 PRODUCT_ANALYZED", {
                "product_name": analysis.get('product_name'),
                "category": analysis.get('category'),
                "industry": analysis.get('industry')
            })
            
            return analysis
            
        except Exception as e:
            debug_tracker.log_step("1.1 ANALYZE_PRODUCT_IMAGE", success=False, error=str(e))
            return {
                'product_name': 'tu producto',
                'category': 'product',
                'industry': 'beauty'
            }
    
    def _interpret_user_changes(self, user_input: str) -> str:
        """
        =======================================================================
        INTERPRET USER CHANGES - VERSION 1 (STABLE)
        =======================================================================
        DO NOT EDIT without explicit permission from the user.
        
        Uses Gemini Flash to interpret the user's change request and reformulate
        it into clear instructions for NanoBanana.
        
        Examples:
        - "todo igual pero agua en vez de arena" -> "Cambiar el fondo de arena a agua. Mantener todo lo demás igual."
        - "me gusta así" -> "NONE"
        - "quiero fondo azul y luz más cálida" -> "Cambiar fondo a azul. Cambiar iluminación a más cálida."
        
        Returns:
        - "NONE" if user wants no changes
        - Clear instructions string if user wants changes
        
        Last verified: 2026-01-31
        =======================================================================
        """
        if not user_input or not user_input.strip():
            return "NONE"
        
        prompt = f"""Eres un asistente que interpreta solicitudes de cambios para imágenes de productos.

El usuario ha visto una referencia de imagen y respondió: "{user_input}"

Tu tarea es reformular su respuesta en instrucciones CLARAS y ESPECÍFICAS para un generador de imágenes.

Reglas:
1. Si el usuario NO quiere cambios (dice "igual", "perfecto", "me gusta", "sin cambios", "así está bien", etc. SIN pedir ninguna modificación), responde exactamente: NONE
2. Si el usuario quiere cambios (aunque diga "igual pero...", "todo bien excepto...", "me gusta, solo cambiar..."), lista cada cambio de forma clara y concisa
3. No inventes cambios que el usuario no pidió
4. Usa español simple y directo
5. Si hay ambigüedad, interpreta a favor de hacer el cambio solicitado

Ejemplos:
- "todo igual pero con agua en vez de arena" -> "Cambiar el fondo de arena a agua"
- "me gusta, solo que el fondo sea azul" -> "Cambiar el fondo a color azul"
- "perfecto así" -> NONE
- "igual" -> NONE
- "más iluminación y fondo verde" -> "Aumentar la iluminación. Cambiar el fondo a verde"

Responde SOLO con las instrucciones (sin explicaciones adicionales):"""

        try:
            response = self.client.models.generate_content(
                model=self.config.text_model,
                contents=[{"role": "user", "parts": [{"text": prompt}]}]
            )
            result = response.text.strip()
            print(f"[DEBUG] _interpret_user_changes input: '{user_input}' -> output: '{result}'", file=sys.stderr)
            return result if result else "NONE"
        except Exception as e:
            print(f"[DEBUG] Error interpreting changes: {e}", file=sys.stderr)
            return user_input  # Fallback: usar el texto original
    
    def _generate_smart_text_suggestions(self, text_elements: list) -> dict:
        """
        =======================================================================
        SMART TEXT SUGGESTIONS - VERSION 3
        =======================================================================
        Generate UNIQUE suggestions for each text element instance.
        If reference has 2 headlines, generates 2 different headline suggestions.
        
        Uses Gemini's knowledge base (no web search required).
        
        Returns dict with indexed suggestions like:
        {"headline_1": "...", "headline_2": "...", "subheadline_1": "..."}
        or None if generation fails.
        
        V3 Changes:
        - Count instances of each text type and request unique suggestions
        - Return indexed keys (headline_1, headline_2) for multiple instances
        - Never return placeholders or bracketed text
        =======================================================================
        """
        product_name = self.product_name or 'Tu producto'
        
        if not product_name or product_name == 'Tu producto':
            print("[DEBUG] No product name available, skipping smart suggestions")
            return None
        
        # V3: Count instances of each text type
        type_counts = {}
        for elem in text_elements:
            elem_type = elem.get('type', 'texto')
            type_counts[elem_type] = type_counts.get(elem_type, 0) + 1
        
        # Build requirement list with counts
        type_requirements = []
        for elem_type, count in type_counts.items():
            if count > 1:
                type_requirements.append(f"{count} textos diferentes de tipo '{elem_type}'")
            else:
                type_requirements.append(f"1 texto de tipo '{elem_type}'")
        
        # Analyze what the reference text shows to guide suggestions
        detected_texts = [e.get('detected_text', '') for e in text_elements if e.get('detected_text')]
        has_percentages = any('%' in t for t in detected_texts)
        has_ingredients = any('ingrediente' in t.lower() or 'con ' in t.lower() for t in detected_texts)
        
        print(f"[DEBUG] Smart suggestions V3: product={product_name}, type_counts={type_counts}, has_percentages={has_percentages}")
        
        # Build contextual hints
        context_hints = []
        if has_percentages:
            context_hints.append("Si conoces estudios clinicos o porcentajes de eficacia del producto, incluyelos")
        if has_ingredients:
            context_hints.append("Si conoces los ingredientes activos principales del producto, mencionalos")
        
        context_str = "\n".join([f"- {h}" for h in context_hints]) if context_hints else "- Usa beneficios generales del producto"
        
        # V3: Build expected JSON structure with indexed keys
        expected_keys = []
        for elem_type, count in type_counts.items():
            for i in range(1, count + 1):
                expected_keys.append(f'"{elem_type}_{i}": "texto unico aqui"')
        expected_json = "{" + ", ".join(expected_keys) + "}"
        
        prompt = f"""Eres un experto en marketing de productos de belleza y consumo.

Para el producto "{product_name}", genera sugerencias de texto REALES para un anuncio de Instagram.

NECESITO EXACTAMENTE:
{chr(10).join(['- ' + req for req in type_requirements])}

IMPORTANTE: Cada texto debe ser DIFERENTE y UNICO. No repitas el mismo texto.

CONTEXTO:
{context_str}

INSTRUCCIONES:
- Usa tu conocimiento sobre este producto (ingredientes, beneficios, caracteristicas)
- Si no conoces el producto exacto, genera texto profesional basado en la categoria
- Textos MUY CORTOS (maximo 5-7 palabras por elemento)
- NUNCA uses corchetes [], placeholders, ni textos como "[Tu texto]"
- Responde SOLO en español
- Cada headline diferente debe destacar un aspecto diferente del producto
- Los textos deben ser variados y complementarios entre si

Responde SOLO con este JSON exacto (sin explicaciones):
{expected_json}
"""
        
        try:
            response = self.client.models.generate_content(
                model=self.config.text_model,
                contents=[{"role": "user", "parts": [{"text": prompt}]}]
            )
            result = response.text.strip()
            print(f"[DEBUG] LLM smart suggestions V3 response: {result[:300]}")
            
            # Parse JSON response
            if '{' in result:
                json_str = result[result.find('{'):result.rfind('}')+1]
                suggestions = json.loads(json_str)
                
                # V3: Filter out any placeholders that might have slipped through
                filtered = {}
                for key, value in suggestions.items():
                    if value and '[' not in value and ']' not in value:
                        filtered[key] = value
                
                print(f"[DEBUG] Parsed smart suggestions V3: {filtered}")
                return filtered if filtered else None
        except Exception as e:
            print(f"[DEBUG] Smart suggestions LLM failed: {e}")
        
        return None
    
    def _build_nanobanana_prompt(self) -> str:
        """
        =======================================================================
        BUILD NANOBANANA PROMPT - VERSION 5 (STABLE)
        =======================================================================
        DO NOT EDIT without explicit permission from the user.
        
        Build the fixed prompt template for NanoBanana.
        Uses confirmed user inputs instead of LLM-generated prompts.
        
        Features:
        - Fixed template structure (ROLE, OBJECTIVE, MY PRODUCT, etc.)
        - Uses self.product_category, self.product_name for product info
        - V2: Uses _interpret_user_changes() to process design_changes with LLM
        - V3: Added CRITICAL PRODUCT REPLACEMENT section to ensure reference
              product is removed and only user's product appears
        - V4: Added AUTOMATIC COLOR ADAPTATION section to always adapt
              background colors to harmonize with the user's product palette
        - V5: Added Rule 11 - ASPECT RATIO 4:5 MANDATORY with composition
              adaptation (no padding, extend backgrounds instead)
        - Uses self.text_content for text overlay (headline, subheadline, cta)
        - Includes enhanced IMMUTABLE RULES for quality control
        
        Template based on: nanobanana prompt.pdf
        Last verified: 2026-01-31
        =======================================================================
        """
        # === MY PRODUCT section ===
        product_type = self.product_category or self.product_name or "producto"
        product_name = self.product_name or "producto"
        
        # === REQUESTED CHANGES section ===
        # V2: Use LLM to interpret user's change request instead of rigid keywords
        if self.design_changes and self.design_changes.strip():
            interpreted_changes = self._interpret_user_changes(self.design_changes)
            
            if interpreted_changes.upper() == "NONE":
                changes_section = "- None. Keep reference exact."
            else:
                changes_section = f"- {interpreted_changes}"
        else:
            changes_section = "- None. Keep reference exact."
        
        # === TEXT section ===
        has_text = self.text_content is not None and len(self.text_content) > 0
        if has_text:
            text_parts = []
            if self.text_content.get('headline'):
                text_parts.append(f'Headline: "{self.text_content["headline"]}"')
            if self.text_content.get('subheadline'):
                text_parts.append(f'Subheadline: "{self.text_content["subheadline"]}"')
            if self.text_content.get('cta'):
                text_parts.append(f'CTA: "{self.text_content["cta"]}"')
            
            confirmed_text = "\n".join([f"- {part}" for part in text_parts])
            # VERSION 2: Enhanced typography replication instructions
            text_section = f"""CRITICAL TYPOGRAPHY REPLICATION:
Analyze the REFERENCE IMAGE text and replicate EXACTLY:
1. FONT STYLE: Copy the exact font family (serif, sans-serif, script, display)
2. FONT WEIGHT: Match exactly (thin, light, regular, medium, bold, black)
3. TEXT COLOR: Use the EXACT same color as reference text
4. TEXT POSITION: Place in the EXACT same position (same % from edges)
5. TEXT SIZE: Match the relative size to canvas
6. TEXT EFFECTS: Copy shadows, glow, outline, gradients if present
7. LETTER SPACING: Match character spacing
8. TEXT CASE: Match uppercase/lowercase/title case

Text to display (replace reference text with these):
{confirmed_text}

RULE: The text must look like it was always part of the original design.
DO NOT use a generic font - analyze and match the reference typography exactly."""
        else:
            text_section = "- No text."
        
        # === BUILD FULL PROMPT ===
        # V3: Enhanced prompt with explicit product replacement instructions
        prompt = f"""=== ROLE ===
You are an expert Instagram product post designer. Your job is to replicate visual references with different products.

=== OBJECTIVE ===
Take the REFERENCE IMAGE and recreate it exactly, but replace the original product with MY PRODUCT.

=== MY PRODUCT ===
- Type: {product_type}
- Name: {product_name}
- Visual: Use the product image I provided (attached)

=== CRITICAL: PRODUCT REPLACEMENT ===
- The product shown in the REFERENCE IMAGE MUST BE COMPLETELY REMOVED
- ONLY MY PRODUCT (the one I uploaded/attached) should appear in the final image
- DO NOT show any part of the original product from the reference
- The reference is ONLY for style, composition, lighting, and background - NOT for the product itself
- If the reference shows a jar, bottle, tube, or any product: REMOVE IT and put MY PRODUCT instead

=== AUTOMATIC COLOR ADAPTATION ===
- ALWAYS adapt the BACKGROUND COLORS (gradients, ambient tones, overall atmosphere) to harmonize with MY PRODUCT's color palette
- The background should complement and enhance MY PRODUCT as the visual center
- DO NOT change colors of specific props or decorative objects - only background/ambient colors
- The final image should feel cohesive, with colors that naturally complement my product

=== REFERENCE IMAGE ===
Use the reference ONLY for:
- Composition and framing (where to place MY product)
- Lighting (direction, intensity, temperature)
- Color palette and mood
- Background and props (NOT the product!)
- Photographic style
- Atmosphere/mood

=== REQUESTED CHANGES ===
{changes_section}

=== TEXT ===
{text_section}

=== IMMUTABLE RULES ===
1. Format: Instagram Post 4:5 (1080x1350px)
2. The ORIGINAL PRODUCT from the reference MUST NOT appear - replace it 100% with MY PRODUCT
3. DO NOT invent elements not present in the reference
4. DO NOT modify anything the user did not request
5. NO spelling errors in text
6. MY PRODUCT must look professional and be the protagonist
7. Commercial advertising quality
8. If there is text, it must be 100% legible
9. Maintain total visual coherence with the reference (except the product)
10. When in doubt: REMOVE the reference product, KEEP everything else
11. ASPECT RATIO 4:5 IS MANDATORY: If the reference image has a different aspect ratio, you MUST adapt the composition to 4:5 by extending backgrounds, adjusting framing, or repositioning elements. NEVER add padding, whitespace, or black bars. The output must be a native 4:5 composition."""

        return prompt
    
    def _build_nanobanana_edit_prompt(self, user_feedback: str) -> str:
        """
        =======================================================================
        BUILD NANOBANANA EDIT PROMPT - VERSION 3 (STABLE)
        =======================================================================
        DO NOT EDIT without explicit permission from the user.
        
        Build the fixed prompt template for NanoBanana EDIT mode.
        Used when user provides feedback after seeing generated image.
        
        Features:
        - Only applies requested changes to existing image
        - Preserves everything not explicitly mentioned
        - Critical constraint: editing, not recreating
        - V2: Includes original reference design_guidelines for context
        - V3: Added Rule 9 - ASPECT RATIO 4:5 MANDATORY (no padding)
        
        Template based on: nanobanan edit output prompt.pdf
        Last verified: 2026-01-31
        =======================================================================
        """
        # Extract user's requested changes
        user_changes = user_feedback.strip() if user_feedback else "No changes specified"
        
        # V2: Build reference style section from design_guidelines
        reference_style_section = ""
        if self.selected_reference and self.selected_reference.get('design_guidelines'):
            dg = self.selected_reference.get('design_guidelines', {})
            style_parts = []
            
            # Background info
            bg = dg.get('background', {})
            if bg:
                bg_type = bg.get('type', 'unknown')
                bg_colors = bg.get('colors', [])
                bg_elements = bg.get('elements', '')
                if bg_type or bg_colors:
                    style_parts.append(f"Background: {bg_type}, colors {bg_colors}, {bg_elements}")
            
            # Lighting info
            lighting = dg.get('lighting', {})
            if lighting:
                light_type = lighting.get('type', '')
                light_temp = lighting.get('color_temperature', '')
                if light_type:
                    style_parts.append(f"Lighting: {light_type}, {light_temp}")
            
            # Color palette
            palette = dg.get('color_palette', {})
            if palette:
                primary = palette.get('primary', '')
                secondary = palette.get('secondary', '')
                temp = palette.get('temperature', '')
                if primary:
                    style_parts.append(f"Colors: primary {primary}, secondary {secondary}, {temp}")
            
            # Overall style
            overall = dg.get('overall_style', {})
            if overall:
                mood = overall.get('mood', '')
                aesthetic = overall.get('aesthetic', '')
                if mood or aesthetic:
                    style_parts.append(f"Style: {aesthetic}, mood {mood}")
            
            if style_parts:
                reference_style_section = f"""
=== ORIGINAL REFERENCE STYLE (for context) ===
The user selected a reference with these characteristics:
- {chr(10).join(['- ' + p for p in style_parts])}
If the user mentions "reference" or "original", they mean this style.
"""
        
        prompt = f"""=== ROLE ===
You are an expert Instagram product post designer. Your job is to make ONLY the requested changes to an existing image.

=== OBJECTIVE ===
Take the PROVIDED IMAGE and apply ONLY the specific changes listed below. Everything else must remain identical.

=== CRITICAL CONSTRAINT ===
You are NOT creating a new image. You are editing an existing one.
- DO NOT reinterpret the image
- DO NOT add creative improvements
- DO NOT change anything not explicitly requested
- DO NOT modify composition, lighting, colors, or any other element unless specifically asked
{reference_style_section}
=== REQUESTED CHANGES ===
- {user_changes}

=== ELEMENTS TO PRESERVE (DO NOT TOUCH) ===
- Product appearance and position
- Background and all props
- Lighting and shadows
- Color palette and grading
- Composition and framing
- Text style, font, color, and position (if present)
- Overall mood and atmosphere
- Every single detail NOT mentioned in REQUESTED CHANGES

=== IMMUTABLE RULES ===
1. Format: Instagram Post 4:5 (1080x1350px) - MUST remain the same
2. Change ONLY what is explicitly requested - nothing more
3. NO spelling errors if text is modified
4. NO creative liberties or "improvements"
5. NO reinterpretation of the image
6. The output must be identical to the input EXCEPT for the requested changes
7. If in doubt, DO NOT change it
8. Commercial advertising quality must be maintained
9. ASPECT RATIO 4:5 IS MANDATORY: The output MUST be 4:5. NEVER add padding, whitespace, or black bars."""

        return prompt
    
    def _handle_edit_feedback(self, user_feedback: str) -> Dict[str, Any]:
        """
        ================================================================================
        VERSION 2 (STABLE) - Edit Feedback Handler
        DO NOT MODIFY without explicit permission from the user.
        
        Previous Version 1: Simple concatenation of user feedback
        Version 2: Uses LLM to interpret feedback and generate coherent confirmation
        ================================================================================
        
        Handle user feedback after image generation.
        Confirms the changes and shows Generate button - does NOT auto-generate.
        User must click Generate to apply changes.
        """
        debug_tracker.log_step("7.0 EDIT_FEEDBACK_RECEIVED", {
            "feedback": user_feedback[:100],
            "previous_changes": self.design_changes[:50] if self.design_changes else None
        })
        
        # Accumulate changes (append new feedback to existing)
        if self.design_changes:
            self.design_changes = f"{self.design_changes}. Además: {user_feedback}"
        else:
            self.design_changes = user_feedback
        
        print(f"[DEBUG] Accumulated edit changes: {self.design_changes[:100]}...")
        
        # Use LLM to interpret the user feedback and generate a COHERENT confirmation
        # This fixes the "Voy a pero no tiene las flores azules" bug
        try:
            interpretation_prompt = f"""Sos un asistente que resume pedidos de edición de imágenes.

El usuario pidió cambios en una imagen. Tu tarea es RESUMIR su pedido en UNA FRASE CORTA y NATURAL que complete "Voy a..."

Pedido del usuario: "{user_feedback}"

REGLAS:
1. Resume en máximo 15 palabras
2. Ignora frases como "pero", "no tiene nada que ver", quejas - enfocate solo en LO QUE QUIERE
3. Usa verbos en infinitivo: "adaptar", "cambiar", "agregar", "ajustar"
4. Si pide varias cosas, resúmelas brevemente

EJEMPLOS:
- "pero no tiene las flores azules" → "agregar las flores azules"
- "el fondo debería ser más claro" → "aclarar el fondo"  
- "pero no tiene nada que ver, adaptar el fondo a los colores de mi producto y poner el producto con el mismo angulo" → "adaptar el fondo a tus colores y ajustar el ángulo del producto"
- "quiero que el producto esté más centrado y con más luz" → "centrar el producto y agregar más luz"

Tu respuesta (SOLO el resumen, sin comillas ni explicaciones):"""
            
            interpretation_response = self.client.models.generate_content(
                model=self.config.text_model,
                contents=[interpretation_prompt]
            )
            action_text = interpretation_response.text.strip().lower()
            # Remove any leading "voy a" if the LLM added it
            if action_text.startswith("voy a "):
                action_text = action_text[6:]
            print(f"[DEBUG] LLM interpreted action: {action_text}")
        except Exception as e:
            print(f"[DEBUG] Failed to interpret feedback with LLM: {e}")
            # Fallback: use the original feedback but clean it up
            action_text = user_feedback.lower().strip()
            if action_text.startswith("pero "):
                action_text = action_text[5:]
            if action_text.startswith("no tiene "):
                action_text = "agregar " + action_text[9:]
        
        # Return confirmation message with Generate button (single line break, not double)
        # User must click Generate to apply the changes
        confirmation_msg = f"¡Entendido! Voy a {action_text}.\n¿Hay algo más que quieras cambiar? Si no, presioná **Generar** para aplicar los cambios."
        
        self.history.append({"role": "assistant", "content": confirmation_msg})
        
        return {
            "type": "text",
            "text": confirmation_msg,
            "readyToGenerate": True
        }
    
    def _handle_edit_pipeline(self) -> Dict[str, Any]:
        """
        ================================================================================
        VERSION 2 (STABLE) - Edit Pipeline Handler
        DO NOT MODIFY without explicit permission from the user.
        ================================================================================
        
        Handle edit generation - uses the EDIT prompt template.
        Called when generation_count > 0 (user is editing a previous output).
        
        V2 Changes:
        - Uses last_generated_image as the reference to edit (instead of original reference)
        - Sends absolute path via referenceImage field
        """
        debug_tracker.log_step("7.1 EDIT_PIPELINE_START", {
            "generation_count": self.generation_count,
            "design_changes": self.design_changes[:100] if self.design_changes else None,
            "last_generated_image": self.last_generated_image
        })
        
        # Validate we have required data
        if not self.product_image_path:
            return {"type": "text", "text": "No tengo la imagen del producto. ¿Podés subirla de nuevo?"}
        
        # V2: For edits, we need the previously generated image
        if not self.last_generated_image:
            return {"type": "text", "text": "No tengo la imagen generada anterior. ¿Querés empezar de nuevo?"}
        
        try:
            import requests
            import json
            
            # Build EDIT prompt with accumulated changes
            prompt = self._build_nanobanana_edit_prompt(self.design_changes or "mantener igual")
            print(f"[DEBUG] Built EDIT prompt ({len(prompt)} chars)")
            print(f"[DEBUG] Using last_generated_image as reference: {self.last_generated_image}", file=sys.stderr)
            
            has_text = self.text_content is not None and len(self.text_content) > 0
            
            with open(self.product_image_path, 'rb') as product_file:
                files = {'productImage': product_file}
                # V2: Use the previously generated image as reference (absolute path)
                data = {
                    'textPrompt': prompt,
                    'referenceImage': self.last_generated_image,  # V2: Send absolute path of generated image
                    'skipText': 'false' if has_text else 'true',
                    'language': 'es',
                    'aspectRatio': '4:5',
                }
                
                if has_text:
                    text_array = []
                    if self.text_content.get('headline'):
                        text_array.append(self.text_content['headline'])
                    if self.text_content.get('subheadline'):
                        text_array.append(self.text_content['subheadline'])
                    if self.text_content.get('cta'):
                        text_array.append(self.text_content['cta'])
                    data['userText'] = json.dumps(text_array)
                
                debug_tracker.log_step("7.2 CALLING_EDIT_PIPELINE", {
                    "prompt_length": len(prompt),
                    "has_text": has_text
                })
                
                response = requests.post(
                    f'{self.backend_url}/pipeline',
                    files=files,
                    data=data,
                    timeout=60
                )
            
            response.raise_for_status()
            result = response.json()
            
            if not result.get('success') or not result.get('finalImagePath'):
                return {"type": "text", "text": "No pude aplicar los cambios. ¿Querés intentar de nuevo?"}
            
            final_image_path = result['finalImagePath']
            self.last_generated_image = final_image_path
            self.generation_count += 1
            self.current_step = 7  # Stay in edit mode
            
            debug_tracker.log_step("7.3 EDIT_COMPLETE", {
                "new_image": final_image_path,
                "generation_count": self.generation_count
            })
            
            self.history.append({"role": "assistant", "content": "¡Listo! Apliqué los cambios."})
            
            return {
                "type": "image",
                "file": final_image_path,
                "text": "¡Listo! Apliqué los cambios. ¿Qué te parece? Podés pedirme más ajustes o empezar con otro producto."
            }
            
        except Exception as e:
            print(f"[DEBUG] Edit pipeline error: {e}")
            debug_tracker.log_step("7.1 EDIT_PIPELINE_ERROR", success=False, error=str(e))
            return {"type": "text", "text": "Tuve un problema aplicando los cambios. ¿Querés intentar de nuevo?"}
    
    def _handle_get_post_types(self) -> Dict[str, Any]:
        """
        =======================================================================
        GET POST TYPES - VERSION 2 (STABLE)
        =======================================================================
        ⚠️  DO NOT EDIT without explicit permission from the user.
        
        Step 1: Analyze product, then get recommended post types with example images
        
        Features:
        - Sends productCategory to backend for precise filtering
        - Stores example images for hardcoded first reference
        
        BACKUP: agent.backup-v2.py
        Last verified: 2026-01-31
        =======================================================================
        """
        debug_tracker.start_flow(self.product_image_path)
        debug_tracker.log_step("1.0 STEP1_GET_POST_TYPES_START", {
            "product_image": self.product_image_path
        })
        
        try:
            # First, analyze the product image to get name and category
            product_info = self._analyze_product_image()
            product_name = product_info.get('product_name', 'tu producto')
            industry = product_info.get('industry', 'beauty')
            category = product_info.get('category', 'product')
            
            # Store for later use
            self.product_name = product_name
            self.product_industry = industry
            self.product_category = category  # Store product category for reference filtering
            
            debug_tracker.log_step("1.4 FETCHING_POST_TYPES_FROM_DB", {
                "backend_url": self.backend_url,
                "industry": industry,
                "category": category
            })
            
            internal_token = os.environ.get("POSTTY_INTERNAL_TOKEN", "").strip()
            headers = {"Content-Type": "application/json"}
            if internal_token:
                headers["X-Postty-Internal-Token"] = internal_token
            
            # V2: Also send productCategory for precise filtering
            response = requests.post(
                f'{self.backend_url}/get-post-types',
                json={
                    'productAnalysis': f"{category} {product_name}",
                    'industry': industry,
                    'productCategory': category,  # V2: Filter by product category (cream, lipstick, etc.)
                    'limit': 4
                },
                headers=headers,
                timeout=15
            )
            response.raise_for_status()
            result = response.json()
            
            if result.get('status') == 'success' and result.get('postTypes'):
                post_types = result['postTypes']
                self.current_step = 1
                
                # V2: Store FULL example image data for each post type to ensure it appears first in references
                # This is HARDCODED to always show the selected post type image as the first reference
                self.post_type_examples = {}
                for pt in post_types:
                    pt_type = pt.get('type')
                    example_img = pt.get('exampleImage', {})
                    if pt_type and example_img.get('id'):
                        # Store full image data, not just ID
                        self.post_type_examples[pt_type] = {
                            'id': example_img.get('id'),
                            'url': example_img.get('url'),
                            'designGuidelines': example_img.get('designGuidelines', {})
                        }
                
                debug_tracker.log_step("1.5 POST_TYPES_RETRIEVED", {
                    "count": len(post_types),
                    "types": [pt.get('type') for pt in post_types],
                    "example_ids": {k: v.get('id')[:8] if v.get('id') else 'none' for k, v in self.post_type_examples.items()}
                })
                
                return {
                    "type": "post_type_options",
                    "text": f"¡Excelente Foto! Veo que quieres lograr un post para tu producto de **{product_name}**. Estuve investigando mientras esperabas y estos son los **top tipos de ads para tu producto**, elige alguno para continuar con tu post por favor.",
                    "productThumbnail": self.product_image_path,
                    "postTypes": post_types
                }
            else:
                debug_tracker.log_step("1.5 POST_TYPES_RETRIEVED", success=False, error="No post types found")
                return {
                    "type": "text",
                    "text": f"¡Excelente Foto! Veo tu **{product_name}**. No encontré tipos de post en la base de datos. ¿Querés describir qué tipo de imagen te gustaría crear?"
                }
                
        except Exception as e:
            debug_tracker.log_step("1.0 STEP1_GET_POST_TYPES", success=False, error=str(e))
            return {
                "type": "text",
                "text": "Tuve un problema obteniendo los tipos de post. ¿Podés describir qué tipo de imagen te gustaría?"
            }
    
    def _handle_search_references_by_type(self, post_type: str) -> Dict[str, Any]:
        """
        =======================================================================
        SEARCH REFERENCES BY TYPE - VERSION 4 (STABLE)
        =======================================================================
        ⚠️  DO NOT EDIT without explicit permission from the user.
        
        Features:
        - Filters by productCategory for precise matching (cream, lipstick, etc.)
        - Normalizes category names (facial cream -> cream)
        - Fallback to industry filter when category has no matches
        - HARDCODED: Post type example image ALWAYS appears first in references
        - V4: Copies design_guidelines from search results when hardcoding post type example
              This ensures the first reference has full metadata (text_analysis, etc.)
        
        BACKUP: agent.backup-v7.py
        Last verified: 2026-01-31
        =======================================================================
        """
        debug_tracker.log_step("2.0 STEP2_SEARCH_REFERENCES_START", {
            "selected_post_type": post_type
        })
        
        try:
            internal_token = os.environ.get("POSTTY_INTERNAL_TOKEN", "").strip()
            headers = {"Content-Type": "application/json"}
            if internal_token:
                headers["X-Postty-Internal-Token"] = internal_token
            
            uid = getattr(self, "user_id", None) or ""
            
            # V2: Use product_category for precise filtering (cream, lipstick, serum, etc.)
            raw_category = self.product_category or "product"
            product_industry = self.product_industry or "beauty"
            
            # V2: Normalize category - map similar terms to DB values
            category_mapping = {
                "facial cream": "cream",
                "face cream": "cream", 
                "moisturizer": "cream",
                "moisturizing cream": "cream",
                "hydrating cream": "cream",
                "skincare cream": "cream",
                "face serum": "serum",
                "facial serum": "serum",
                "lip stick": "lipstick",
                "lip color": "lipstick",
                "fragrance": "perfume",
                "cologne": "perfume",
                "nail lacquer": "nail-polish",
                "nail color": "nail-polish",
            }
            product_category = category_mapping.get(raw_category.lower(), raw_category)
            
            # Search query is generic, filtering is done by productCategory
            search_query = "premium"
            
            debug_tracker.log_step("2.1 CALLING_SEARCH_REFERENCES_API", {
                "post_type_filter": post_type,
                "product_category_filter": product_category,  # V2: Changed from industry
                "search_query": search_query,
                "limit": 20
            })
            
            response = requests.post(
                f'{self.backend_url}/search-references',
                json={
                    'query': search_query,
                    'postType': post_type,
                    'productCategory': product_category,  # V2: Filter by product category (cream, lipstick, etc.)
                    'limit': 20,
                    'userId': uid
                },
                headers=headers,
                timeout=15
            )
            response.raise_for_status()
            result = response.json()
            
            references = result.get('results', []) if result.get('status') == 'success' else []
            
            # V2: Fallback - if no results with exact category, retry with INDUSTRY filter (not nothing!)
            if len(references) == 0 and product_category != "product":
                debug_tracker.log_step("2.1b FALLBACK_SEARCH_WITH_INDUSTRY", {
                    "original_category": product_category,
                    "fallback_industry": product_industry,
                    "reason": "No results with exact category match, using industry filter"
                })
                
                fallback_response = requests.post(
                    f'{self.backend_url}/search-references',
                    json={
                        'query': search_query,
                        'postType': post_type,
                        'industry': product_industry,  # FIX: Use industry filter instead of nothing!
                        'limit': 20,
                        'userId': uid
                    },
                    headers=headers,
                    timeout=15
                )
                fallback_response.raise_for_status()
                fallback_result = fallback_response.json()
                references = fallback_result.get('results', []) if fallback_result.get('status') == 'success' else []
            
            # Get label for post type (used in both cases)
            type_labels = {
                'hero-shot': 'Hero Shot',
                'product-on-human': 'Product on human',
                'lifestyle': 'Lifestyle',
                'flat-lay': 'Flat Lay',
                'unboxing': 'Unboxing',
            }
            label = type_labels.get(post_type, post_type.replace('-', ' ').title())
            
            if len(references) > 0:
                self.current_step = 2
                
                # V3: HARDCODED - Always show the selected post type's example image as the FIRST reference
                # Then show the agent's ranking results after it
                # V4: Copy design_guidelines from search results if the post type example exists there
                example_data = self.post_type_examples.get(post_type)
                post_type_image_used = False
                
                if example_data and example_data.get('id'):
                    example_id = example_data.get('id')
                    
                    # V4: Check if this example image exists in search results (which have full design_guidelines)
                    # If so, use its complete data including design_guidelines
                    existing_ref = next((r for r in references if r.get('id') == example_id), None)
                    
                    if existing_ref:
                        # Use the full data from search results (has design_guidelines)
                        post_type_ref = {
                            'id': existing_ref.get('id'),
                            'url': existing_ref.get('url'),
                            'description': f'Ejemplo de {label}',
                            'design_guidelines': existing_ref.get('design_guidelines', {}),
                            'text_analysis': existing_ref.get('text_analysis', {}),
                            'text_in_image': existing_ref.get('text_in_image'),
                            'tags': existing_ref.get('tags', []),
                            'industry': existing_ref.get('industry'),
                            'aesthetic': existing_ref.get('aesthetic'),
                            'mood': existing_ref.get('mood')
                        }
                    else:
                        # Fallback: use example_data (may not have design_guidelines)
                        post_type_ref = {
                            'id': example_data.get('id'),
                            'url': example_data.get('url'),
                            'description': f'Ejemplo de {label}',
                            'designGuidelines': example_data.get('designGuidelines', {})
                        }
                    
                    # Remove duplicate if the same image is already in results
                    references = [r for r in references if r.get('id') != post_type_ref['id']]
                    # Insert post type image as first element
                    references = [post_type_ref] + references
                    post_type_image_used = True
                
                # Store references for later selection
                self.available_references = references
                
                debug_tracker.log_step("2.2 REFERENCES_RETRIEVED_FROM_S3", {
                    "count": len(references),
                    "reference_ids": [ref.get('id', 'unknown')[:8] for ref in references[:5]],
                    "post_type_image_used": post_type_image_used,
                    "post_type_image_first": post_type_image_used
                })
                
                return {
                    "type": "reference_options",
                    "text": f"¡Buena elección! Estos son algunos templates que tengo para crear tu post de **{label}**. Necesito que elijas uno para que trabajemos sobre el mismo o puedes también subir uno de tu preferencia.",
                    "references": references
                }
            else:
                # FALLBACK: No references found, use the post type example image as the only reference
                example_data = self.post_type_examples.get(post_type)
                if example_data and example_data.get('id'):
                    self.current_step = 2
                    
                    # Create fallback reference from post type example
                    fallback_ref = {
                        'id': example_data.get('id'),
                        'url': example_data.get('url'),
                        'designGuidelines': example_data.get('designGuidelines', {})
                    }
                    references = [fallback_ref]
                    
                    # Store for later selection
                    self.available_references = references
                    
                    debug_tracker.log_step("2.2 REFERENCES_FALLBACK_TO_POST_TYPE_IMAGE", {
                        "example_id": example_data.get('id')[:8] if example_data.get('id') else "none",
                        "post_type_image_used": True,
                        "reason": "No references found in search"
                    })
                    
                    return {
                        "type": "reference_options",
                        "text": f"¡Buena elección! Para **{label}** tengo esta referencia. Elegila para trabajar sobre ella o puedes subir una de tu preferencia.",
                        "references": references
                    }
                else:
                    # No references AND no post type example - return error message
                    debug_tracker.log_step("2.2 REFERENCES_RETRIEVED_FROM_S3", success=False, error="No references found and no fallback available")
                    return {
                        "type": "text",
                        "text": f"No encontré referencias para este tipo de post. ¿Querés que genere la imagen directamente según tu descripción?"
                    }
                
        except Exception as e:
            debug_tracker.log_step("2.0 STEP2_SEARCH_REFERENCES", success=False, error=str(e))
            return {
                "type": "text",
                "text": "Tuve un problema buscando referencias. ¿Querés continuar sin referencia?"
            }
    
    def _handle_reference_selected(self, reference: Dict[str, Any]) -> Dict[str, Any]:
        """
        Step 3: Analyze selected reference and ask about changes
        """
        debug_tracker.log_step("3.0 STEP3_REFERENCE_SELECTED", {
            "reference_id": reference.get('id', 'unknown'),
            "has_design_guidelines": bool(reference.get('design_guidelines')),
            "has_text_analysis": bool(reference.get('text_analysis')),
            "text_in_image": reference.get('text_in_image')
        })
        
        self.selected_reference = reference
        self.design_guidelines = reference.get('design_guidelines', {})
        self.text_analysis = reference.get('text_analysis', {})
        self.current_step = 3
        
        debug_tracker.log_step("3.1 DESIGN_GUIDELINES_LOADED", {
            "typography": bool(self.design_guidelines.get('typography') if self.design_guidelines else False),
            "background": self.design_guidelines.get('background', {}).get('type') if self.design_guidelines else None,
            "text_elements_count": len(self.text_analysis.get('text_elements', [])) if self.text_analysis else 0
        })
        
        # Build description of what we see in the reference based on design_guidelines
        # Using simple, non-technical language that anyone can understand
        elements = []
        modifiable_suggestions = []
        
        # Helper function to convert hex colors to simple names
        def hex_to_simple_color(hex_color):
            if not hex_color:
                return None
            hex_color = hex_color.upper().replace('#', '')
            color_map = {
                'FFFFFF': 'blanco', 'FFF': 'blanco',
                '000000': 'negro', '000': 'negro',
                'FF0000': 'rojo', 'F00': 'rojo',
                '00FF00': 'verde', '0F0': 'verde',
                '0000FF': 'azul', '00F': 'azul',
                'FFFF00': 'amarillo', 'FF0': 'amarillo',
                'FFA500': 'naranja',
                'FFC0CB': 'rosa', 'FFB6C1': 'rosa claro',
                '808080': 'gris', 'C0C0C0': 'gris claro',
                'F5F5DC': 'beige', 'FFFDD0': 'crema',
                'E6F7FF': 'celeste', 'ADD8E6': 'celeste',
                '87CEEB': 'celeste', '77B5FE': 'azul claro',
            }
            if hex_color in color_map:
                return color_map[hex_color]
            # Try to detect general color family
            if hex_color.startswith('FF') or hex_color.startswith('F'):
                if 'FF' in hex_color[2:4]:
                    return 'amarillo/naranja'
            return None  # Return None if we can't simplify
        
        # Helper to translate English terms to simple Spanish
        def simplify_term(term):
            translations = {
                'female': 'una mujer', 'male': 'un hombre',
                'posing': 'posando', 'applying product': 'aplicándose el producto',
                'holding product': 'sosteniendo el producto',
                'soft-diffused': 'suave y difusa', 'soft diffused': 'suave y difusa',
                'natural': 'natural', 'dramatic': 'dramática',
                'calm': 'tranquilo', 'energetic': 'energético',
                'luxurious': 'lujosa', 'minimal': 'minimalista',
                'clinical': 'clínico/profesional', 'playful': 'divertido',
                'elegant': 'elegante', 'modern': 'moderno',
            }
            term_lower = term.lower() if term else ''
            return translations.get(term_lower, term)
        
        # Check for people
        content_elements = self.design_guidelines.get('content_elements', {}) if self.design_guidelines else {}
        people = content_elements.get('people', {})
        has_people = people.get('present', False)
        if has_people:
            gender_raw = people.get('gender_presentation', ['persona'])[0] if people.get('gender_presentation') else 'persona'
            activity_raw = people.get('activity', ['usando el producto'])[0] if people.get('activity') else 'usando el producto'
            gender = simplify_term(gender_raw)
            activity = simplify_term(activity_raw)
            elements.append(f"{gender} {activity}")
            modifiable_suggestions.append("el modelo o persona")
        
        # Check for background
        background = self.design_guidelines.get('background', {}) if self.design_guidelines else {}
        bg_type = background.get('type', '')
        bg_colors = background.get('colors', [])
        if bg_type:
            if bg_type == 'solid':
                # Try to get simple color name
                color_name = hex_to_simple_color(bg_colors[0]) if bg_colors else None
                if color_name:
                    elements.append(f"fondo {color_name}")
                else:
                    elements.append("fondo de color sólido")
            elif bg_type == 'gradient':
                elements.append("fondo degradado")
            elif bg_type == 'environmental':
                elements.append("ambiente natural")
                modifiable_suggestions.append("el ambiente")
            else:
                elements.append(f"fondo {bg_type}")
            modifiable_suggestions.append("el color del fondo")
        
        # Check for decorative elements - simplify
        decorative = self.design_guidelines.get('decorative_elements', {}) if self.design_guidelines else {}
        if decorative.get('present', False):
            dec_types = decorative.get('type', [])
            if dec_types:
                # Translate common decorative elements
                dec_translations = {
                    'bubbles': 'burbujas', 'flowers': 'flores', 'leaves': 'hojas',
                    'water': 'agua', 'ice': 'hielo', 'droplets': 'gotas'
                }
                simple_dec = [dec_translations.get(d.lower(), d) for d in dec_types[:3]]
                elements.append(f"elementos decorativos ({', '.join(simple_dec)})")
                modifiable_suggestions.append("los elementos decorativos")
        
        # Check for lighting - simplified
        lighting = self.design_guidelines.get('lighting', {}) if self.design_guidelines else {}
        light_type = lighting.get('type', '')
        if light_type:
            simple_light = simplify_term(light_type)
            elements.append(f"iluminación {simple_light}")
            modifiable_suggestions.append("la iluminación")
        
        # Check for mood/aesthetic - simplified
        overall_style = self.design_guidelines.get('overall_style', {}) if self.design_guidelines else {}
        mood = overall_style.get('mood', '')
        aesthetic = overall_style.get('aesthetic', '')
        if mood:
            simple_mood = simplify_term(mood)
            elements.append(f"estilo {simple_mood}")
        if aesthetic:
            simple_aesthetic = simplify_term(aesthetic)
            elements.append(f"estética {simple_aesthetic}")
        
        # Check for text in image - must verify actual text elements exist
        text_in_image_flag = reference.get('text_in_image') == 'yes'
        text_elements = self.text_analysis.get('text_elements', []) if self.text_analysis else []
        has_actual_text = text_in_image_flag and len(text_elements) > 0
        
        if has_actual_text:
            text_count = len(text_elements)
            elements.append(f"texto ({text_count} elementos)")
            modifiable_suggestions.append("el contenido del texto")
        
        elements_text = ", ".join(elements) if elements else "un diseño profesional"
        
        # Build contextual suggestions based on what's actually in the reference
        if modifiable_suggestions:
            suggestions_text = ", ".join(modifiable_suggestions[:3])
            modification_hint = f"\n\nPor ejemplo, podemos cambiar {suggestions_text}."
        else:
            modification_hint = ""
        
        debug_tracker.log_step("3.2 REFERENCE_ANALYSIS_COMPLETE", {
            "detected_elements": elements,
            "has_people": has_people,
            "text_in_image_flag": text_in_image_flag,
            "has_actual_text": has_actual_text,
            "text_elements_count": len(text_elements) if text_elements else 0,
            "modifiable_suggestions": modifiable_suggestions
        })
        
        text = f"¡Buena elección! Veo que tu referencia contiene {elements_text}.\n\n**¿Te gustaría mantener el diseño actual o modificar algún elemento?**{modification_hint}"
        
        return {
            "type": "text",
            "text": text,
            "readyToGenerate": False
        }
    
    def _summarize_user_changes(self, user_message: str) -> str:
        """
        =======================================================================
        SUMMARIZE USER CHANGES - VERSION 2 (STABLE)
        =======================================================================
        DO NOT EDIT without explicit permission from the user.
        
        Use Gemini to understand and summarize the user's design change request
        Returns a natural language summary that completes "vamos a..."
        
        Features:
        - V1: Basic summarization with Gemini
        - V2: Cleans "THOUGHTS:" and similar prefixes from LLM response
        
        Last verified: 2026-01-31
        =======================================================================
        """
        try:
            # Use Gemini to interpret the user's changes contextually
            prompt = f"""El usuario pidió cambios para un diseño de post. Tu tarea es RESUMIR su pedido en UNA FRASE CORTA que complete "vamos a..."

Mensaje del usuario: "{user_message}"

REGLAS:
1. Resume en máximo 15 palabras
2. DEBE empezar con verbo en infinitivo: "cambiar", "agregar", "ajustar", "mantener", etc.
3. NO empieces con "El usuario quiere" ni frases similares
4. Si quiere mantener todo igual, di "mantener el diseño actual"
5. Enfocate solo en LO QUE QUIERE, ignora quejas o frases de relleno

EJEMPLOS:
- "solo cambiar la arena a agua y cambiar los colores" → "cambiar la arena por agua y ajustar los colores"
- "me gusta pero quisiera más luz" → "agregar más iluminación"
- "todo igual" → "mantener el diseño actual"
- "el fondo debería ser azul" → "cambiar el fondo a azul"

Tu respuesta (SOLO la acción, sin comillas ni explicaciones):"""

            response = self.client.models.generate_content(
                model=self.config.text_model,
                contents=[{"role": "user", "parts": [{"text": prompt}]}],
                config={"temperature": 0.3, "max_output_tokens": 150}
            )
            
            summary = response.text.strip() if response.text else ""
            
            # Clean up any "THOUGHTS:" or similar prefixes that LLM might add
            if "THOUGHTS:" in summary.upper():
                # Find the actual action after THOUGHTS section
                parts = summary.split(".")
                for part in reversed(parts):
                    part = part.strip()
                    if part and "THOUGHTS" not in part.upper():
                        summary = part
                        break
            
            # Clean up any quotes or extra formatting
            summary = summary.strip('"\'').strip()
            
            # Ensure it starts with lowercase verb (unless acronym)
            if summary and summary[0].isupper() and len(summary) > 1:
                # Check if not an acronym (like CTA, URL)
                if not (len(summary) >= 2 and summary[1].isupper()):
                    summary = summary[0].lower() + summary[1:]
            
            return summary if summary else user_message[:100]
        except Exception as e:
            print(f"[DEBUG] Error summarizing changes: {e}", file=sys.stderr)
            # Fallback: return a portion of the original message
            return user_message[:100] if len(user_message) > 100 else user_message
    
    def _handle_design_changes(self, user_message: str) -> Dict[str, Any]:
        """
        Step 3 continued: Process user's design changes, then ask about text if applicable
        """
        debug_tracker.log_step("4.0 STEP4_DESIGN_CHANGES_RECEIVED", {
            "user_changes": user_message[:100]
        })
        
        self.design_changes = user_message
        
        # Summarize what the user wants to change using Gemini
        self.changes_summary = self._summarize_user_changes(user_message)
        
        debug_tracker.log_step("4.0.1 CHANGES_SUMMARIZED", {
            "original": user_message[:100],
            "summary": self.changes_summary
        })
        
        # Check if reference has text - must have BOTH text_in_image == 'yes' AND actual text_elements
        text_in_image_flag = self.selected_reference and self.selected_reference.get('text_in_image') == 'yes'
        has_actual_text_elements = (
            self.text_analysis and 
            self.text_analysis.get('text_elements') and 
            len(self.text_analysis.get('text_elements', [])) > 0
        )
        
        # Only consider it has text if both conditions are met
        has_text = text_in_image_flag and has_actual_text_elements
        
        debug_tracker.log_step("4.1 CHECK_TEXT_IN_REFERENCE", {
            "text_in_image_flag": text_in_image_flag,
            "has_actual_text_elements": has_actual_text_elements,
            "has_text": has_text,
            "text_in_image_value": self.selected_reference.get('text_in_image') if self.selected_reference else None,
            "text_analysis": self.text_analysis
        })
        
        # Build confirmation message
        confirmation_prefix = f"Entendido, vamos a {self.changes_summary}."
        
        if has_text:
            self.current_step = 4
            # Build contextual text suggestions based on ACTUAL text_elements from the reference
            text_elements_info = []
            text_suggestions = []
            
            # Type name mapping for user-friendly display
            type_display_names = {
                'headline': 'Título principal',
                'product-name': 'Nombre del producto',
                'brand-name': 'Nombre de marca',
                'subheadline': 'Subtítulo',
                'benefits': 'Beneficios',
                'description': 'Descripción',
                'footer': 'Footer',
                'cta': 'Llamada a la acción (CTA)',
                'promotion': 'Promoción',
                'price': 'Precio',
                'tagline': 'Tagline/Slogan'
            }
            
            if self.text_analysis and self.text_analysis.get('text_elements'):
                debug_tracker.log_step("4.2 TEXT_ANALYSIS_AVAILABLE", {
                    "text_elements": self.text_analysis.get('text_elements', [])
                })
                
                product_name = self.product_name or 'Tu producto'
                
                # VERSION 2: Try smart suggestions first (web search + LLM)
                # V2: Generate and STORE smart suggestions for later use
                smart_suggestions = self._generate_smart_text_suggestions(self.text_analysis['text_elements'])
                self.last_smart_suggestions = smart_suggestions  # Store for when user accepts
                using_smart = smart_suggestions is not None
                
                debug_tracker.log_step("4.2.1 SMART_SUGGESTIONS_ATTEMPT", {
                    "using_smart": using_smart,
                    "smart_suggestions": smart_suggestions
                })
                
                # V3: Track instance counts for indexed suggestions
                type_instance_counts = {}
                
                for elem in self.text_analysis['text_elements']:
                    elem_type = elem.get('type', 'texto')
                    detected_text = elem.get('detected_text', '')
                    position = elem.get('position', '')
                    purpose = elem.get('estimated_purpose', '')
                    
                    # V3: Increment instance counter for this type
                    type_instance_counts[elem_type] = type_instance_counts.get(elem_type, 0) + 1
                    instance_num = type_instance_counts[elem_type]
                    
                    # Get friendly type name
                    friendly_type = type_display_names.get(elem_type, elem_type.replace('-', ' ').title())
                    
                    # Store info about what was detected (only show detected, not suggested)
                    text_elements_info.append(f"- **{friendly_type}**: \"{detected_text}\"")
                    
                    # V3: Generate suggestion using indexed keys
                    if using_smart:
                        # V3: Try indexed key first (e.g., headline_1, headline_2)
                        indexed_key = f"{elem_type}_{instance_num}"
                        suggestion = smart_suggestions.get(indexed_key)
                        
                        # V3: If no indexed key, try without index for backward compatibility
                        if not suggestion:
                            if elem_type in ['headline', 'product-name']:
                                suggestion = smart_suggestions.get('headline', product_name)
                            elif elem_type in ['benefits', 'subheadline', 'description']:
                                suggestion = smart_suggestions.get('subheadline') or smart_suggestions.get('benefits')
                        
                        # V3: Only show if we have a real suggestion (no placeholders)
                        if suggestion and '[' not in suggestion and ']' not in suggestion:
                            text_suggestions.append(f"**{friendly_type}:** {suggestion}")
                        elif elem_type in ['headline', 'product-name']:
                            text_suggestions.append(f"**{friendly_type}:** {product_name}")
                        elif elem_type == 'cta':
                            text_suggestions.append(f"**{friendly_type}:** Descubrí más")
                        # V3: Skip types that would show placeholders (brand-name, promotion, price, footer)
                        # These will be handled by the user providing custom text
                    else:
                        # Fallback to generic suggestions when no smart suggestions available
                        if elem_type in ['headline', 'product-name']:
                            text_suggestions.append(f"**{friendly_type}:** {product_name}")
                        elif elem_type == 'benefits':
                            text_suggestions.append(f"**{friendly_type}:** Beneficios de {product_name}")
                        elif elem_type == 'description':
                            text_suggestions.append(f"**{friendly_type}:** Descripción de tu producto")
                        elif elem_type == 'subheadline':
                            text_suggestions.append(f"**{friendly_type}:** Tu subtítulo")
                        elif elem_type == 'cta':
                            text_suggestions.append(f"**{friendly_type}:** Descubrí más")
                        # V3: Skip types that would show placeholders in fallback too
            
            debug_tracker.log_step("4.3 TEXT_SUGGESTIONS_GENERATED", {
                "suggestions_count": len(text_suggestions),
                "text_elements_info": text_elements_info,
                "using_smart_suggestions": using_smart
            })
            
            # Build the response - VERSION 2: Only show suggestions, not original text
            suggestions_str = "\n".join(text_suggestions) if text_suggestions else "Sin sugerencias específicas"
            
            # Different message based on whether we have smart suggestions
            if using_smart:
                text = f"{confirmation_prefix}\n\nBasándome en tu referencia y en información de **{product_name}**, te sugiero estos textos:\n\n{suggestions_str}\n\n¿Te gustan estas sugerencias o preferís usar otros textos?"
            else:
                text = f"{confirmation_prefix}\n\nTu referencia tiene texto. Te sugiero:\n\n{suggestions_str}\n\n¿Qué textos te gustaría usar? Puedes decirme exactamente qué quieres."
            
            self.awaiting_text_input = True
            return {
                "type": "text",
                "text": text,
                "readyToGenerate": False
            }
        else:
            debug_tracker.log_step("4.2 NO_TEXT_IN_REFERENCE", {"skipping_to": "confirm_ready"})
            # No text, go directly to confirm - include changes confirmation
            return self._handle_confirm_ready(include_changes_confirmation=True)
    
    def _handle_text_confirmed(self, user_message: str) -> Dict[str, Any]:
        """
        Step 4 continued: Process user's text preferences
        """
        debug_tracker.log_step("5.0 STEP5_TEXT_CONFIRMED", {
            "user_text_input": user_message[:100]
        })
        
        self.awaiting_text_input = False
        
        # Check if user wants no changes to suggested text
        accept_keywords = ['perfecto', 'me gusta', 'vamos con eso', 'dale', 'ok', 'si', 'sí', 'acepto']
        if any(kw in user_message.lower() for kw in accept_keywords):
            debug_tracker.log_step("5.1 USER_ACCEPTED_SUGGESTIONS", {})
            # V2: Use stored smart suggestions when user accepts
            if self.last_smart_suggestions:
                self.text_content = self.last_smart_suggestions.copy()
                debug_tracker.log_step("5.1.1 USING_STORED_SUGGESTIONS", {
                    "text_content": self.text_content
                })
        else:
            # Parse custom text
            self.text_content = self._parse_text_content(user_message)
            debug_tracker.log_step("5.1 USER_CUSTOM_TEXT_PARSED", {
                "headline": self.text_content.get('headline'),
                "subheadline": self.text_content.get('subheadline'),
                "cta": self.text_content.get('cta')
            })
        
        return self._handle_confirm_ready()
    
    def _handle_confirm_ready(self, include_changes_confirmation: bool = False) -> Dict[str, Any]:
        """
        Step 5: Confirm everything is ready and signal frontend to show Generate button
        """
        self.current_step = 5
        
        debug_tracker.log_step("5.2 READY_TO_GENERATE", {
            "product_name": self.product_name,
            "post_type": self.selected_post_type,
            "reference_id": self.selected_reference.get('id') if self.selected_reference else None,
            "has_design_changes": bool(self.design_changes),
            "has_text_content": bool(self.text_content),
            "changes_summary": self.changes_summary
        })
        
        # Build response with optional changes confirmation
        if include_changes_confirmation and self.changes_summary:
            response_text = f"Entendido, vamos a {self.changes_summary}.\n\nCuando estés listo, haz click en el botón **Generar** para crear tu post!"
        else:
            response_text = "Genial! Cuando estés listo por favor haz click en el botón **Generar** para que te ayude a crear tu post!"
        
        return {
            "type": "text",
            "text": response_text,
            "readyToGenerate": True
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
            internal_token = os.environ.get("POSTTY_INTERNAL_TOKEN", "").strip()
            headers = {}
            if internal_token:
                headers["X-Postty-Internal-Token"] = internal_token

            # IMPORTANT (cloud): /search-references is protected.
            # We authenticate internal agent calls using X-Postty-Internal-Token + userId.
            uid = getattr(self, "user_id", None)
            if isinstance(uid, str):
                uid = uid.strip()
            else:
                uid = ""

            response = requests.post(
                f'{self.backend_url}/search-references',
                json={'query': query, 'limit': limit, 'userId': uid},
                headers=headers,
                timeout=15
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
            # Make the failure actionable (common in cloud/local env misconfig).
            if "DATABASE_URL" in str(e) or "Neon" in str(e):
                fallback = (
                    "La librería de referencias no está configurada (falta DATABASE_URL/Neon). "
                    "¿Seguimos sin referencias visuales?"
                )
            else:
                fallback = "Tuve un problema buscando referencias. ¿Seguimos sin referencias visuales?"
            self.history.append({"role": "assistant", "content": fallback})
            return {"type": "text", "text": fallback}
    
    def _handle_generate_pipeline(self, response_text: str) -> Dict[str, Any]:
        """
        Generate image using /pipeline endpoint with product + reference + prompt
        """
        # #region agent log - DEBUG: Capture full state before pipeline
        import json as _json_debug; import time as _time_debug
        _debug_log_path = "/Users/juanmartinbeinesfurcada/Desktop/Code/Juan test/Postty/.cursor/debug.log"
        _debug_state = {"hypothesisId": "A-D", "location": "agent.py:_handle_generate_pipeline:entry", "message": "Full state before pipeline", "data": {"product_name": self.product_name, "post_type": self.selected_post_type, "selected_reference": str(self.selected_reference)[:500] if self.selected_reference else None, "text_content": self.text_content, "design_changes": self.design_changes[:200] if self.design_changes else None, "product_image_path": self.product_image_path}, "timestamp": int(_time_debug.time()*1000), "sessionId": "debug-session"}
        with open(_debug_log_path, "a") as _f: _f.write(_json_debug.dumps(_debug_state) + "\n")
        # #endregion
        
        debug_tracker.log_step("6.0 STEP6_GENERATE_PIPELINE_START", {
            "product_name": self.product_name,
            "post_type": self.selected_post_type,
            "has_reference": bool(self.selected_reference),
            "has_text_content": bool(self.text_content),
            "has_design_changes": bool(self.design_changes)
        })
        
        # Extract parameters - use stored product image path
        product_image = self.product_image_path
        reference_image = ""  # legacy local filename (only if available)
        reference_image_url = ""  # preferred: DB/S3 signed URL
        
        # Use selected reference if available
        if self.selected_reference:
            # DB-backed references provide a signed S3 URL (`url`) and an `id`.
            reference_image_url = str(self.selected_reference.get('url') or '').strip()
            reference_image = str(self.selected_reference.get('filename') or '').strip()
            debug_tracker.log_step("6.1 REFERENCE_PREPARED", {
                "reference_id": self.selected_reference.get('id'),
                "has_url": bool(reference_image_url)
            })
        
        # BUILD PROMPT using fixed template with user's confirmed inputs
        # This replaces the old LLM-dependent prompt extraction
        prompt = self._build_nanobanana_prompt()
        
        if not product_image:
            error_msg = "No product image available for generation"
            print(f"[DEBUG] No product image path stored")
            self.history.append({"role": "assistant", "content": error_msg})
            return {"type": "text", "text": error_msg}
        
        print(f"[DEBUG] Using product image: {product_image}")
        print(f"[DEBUG] Using reference url: {reference_image_url[:80]}..." if reference_image_url else "[DEBUG] Using reference url: (none)")
        print(f"[DEBUG] Using reference filename: {reference_image}" if reference_image else "[DEBUG] Using reference filename: (none)")
        print(f"[DEBUG] Built NanoBanana prompt ({len(prompt)} chars)")
        
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
                    # Prefer DB/S3 reference URL if available; backend will download to temp.
                    'referenceImageUrl': reference_image_url if reference_image_url else '',
                    # Back-compat: still allow local filename references when present.
                    'referenceImage': reference_image if reference_image else '',
                    'skipText': 'false',  # Let Gemini generate text
                    'language': 'es',
                    'aspectRatio': '4:5',  # Always use 4:5 for Instagram posts
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
                
                debug_tracker.log_step("6.2 CALLING_NANOBANANA_PIPELINE", {
                    "product_image": product_image,
                    "reference_url": reference_image_url[:50] if reference_image_url else None,
                    "prompt_length": len(prompt),
                    "has_user_text": has_text,
                    "aspect_ratio": "4:5"
                })
                print(f"[DEBUG] No text content, generating base image only")
                
                # #region agent log - DEBUG: Capture data sent to pipeline
                _debug_data_sent = {"hypothesisId": "B-C-E", "location": "agent.py:_handle_generate_pipeline:before_request", "message": "Data sent to pipeline", "data": {"textPrompt_length": len(data.get('textPrompt', '')), "textPrompt_preview": data.get('textPrompt', '')[:500], "referenceImageUrl": data.get('referenceImageUrl', '')[:200], "skipText": data.get('skipText'), "userText": data.get('userText'), "has_text": has_text, "backend_url": self.backend_url}, "timestamp": int(_time_debug.time()*1000), "sessionId": "debug-session"}
                with open(_debug_log_path, "a") as _f: _f.write(_json_debug.dumps(_debug_data_sent) + "\n")
                # #endregion
                
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
            
            # #region agent log - DEBUG: Capture pipeline response
            _debug_response = {"hypothesisId": "E", "location": "agent.py:_handle_generate_pipeline:after_request", "message": "Pipeline response", "data": {"status_code": response.status_code, "success": result.get('success'), "has_finalImagePath": bool(result.get('finalImagePath')), "error": result.get('error'), "result_keys": list(result.keys())}, "timestamp": int(_time_debug.time()*1000), "sessionId": "debug-session"}
            with open(_debug_log_path, "a") as _f: _f.write(_json_debug.dumps(_debug_response) + "\n")
            # #endregion
            
            if not result.get('success') or not result.get('finalImagePath'):
                error_msg = "La generación de imagen falló. ¿Intentamos de nuevo?"
                self.history.append({"role": "assistant", "content": error_msg})
                return {"type": "text", "text": error_msg}
            
            final_image_path = result['finalImagePath']
            print(f"[DEBUG] Complete image generated: {final_image_path}")
            
            # Store for edit mode - user can provide feedback to modify this image
            self.last_generated_image = final_image_path
            self.generation_count += 1  # Increment so next "Generar" uses edit pipeline
            self.current_step = 7  # Step 7: Edit mode (waiting for feedback)
            
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
            
            # Extract text before trigger and sanitize (remove any JSON the LLM might have included)
            text_before_trigger = response_text.split("[TRIGGER_GENERATE_PIPELINE]")[0].strip()
            
            # Sanitize: Remove JSON blocks that LLM might have included
            if not text_before_trigger or text_before_trigger.startswith('{') or '```json' in text_before_trigger or '"type":' in text_before_trigger:
                text_before_trigger = "¡Listo! Acá está tu post"
            
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
            # #region agent log - DEBUG: Capture exception
            import traceback as _tb_debug
            _debug_exception = {"hypothesisId": "ALL", "location": "agent.py:_handle_generate_pipeline:exception", "message": "Pipeline exception", "data": {"error_type": type(e).__name__, "error_message": str(e), "traceback": _tb_debug.format_exc()[:1000]}, "timestamp": int(_time_debug.time()*1000), "sessionId": "debug-session"}
            with open(_debug_log_path, "a") as _f: _f.write(_json_debug.dumps(_debug_exception) + "\n")
            # #endregion
            
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
