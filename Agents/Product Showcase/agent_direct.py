"""
Direct stdin/stdout wrapper for NanoBananaAgent
Communicates via JSON messages instead of HTTP
"""

import json
import sys
import os
from agent import NanoBananaAgent, load_config

# Ensure output is flushed immediately
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

def main():
    # Initialize agent
    PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'postty-482019')
    
    try:
        config = load_config()
        agent = NanoBananaAgent(project_id=PROJECT_ID, config=config)
        
        # Send ready signal
        print(json.dumps({"status": "ready", "agent_id": config.agent_id}), flush=True)
        
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
        sys.exit(1)
    
    # Process messages from stdin
    for line in sys.stdin:
        try:
            line = line.strip()
            if not line:
                continue
            
            # Log incoming request to stderr (won't interfere with JSON output)
            print(f"[DEBUG] Received: {line}", file=sys.stderr, flush=True)
                
            request = json.loads(line)
            message = request.get('message', '')
            image_path = request.get('image_path')  # Optional product image path
            
            print(f"[DEBUG] Message: {message}, Image: {image_path}", file=sys.stderr, flush=True)
            
            # Allow empty message if image is provided
            if not message and not image_path:
                response = {"status": "error", "message": "No message or image provided"}
            else:
                # If only image provided, use a placeholder message
                if not message and image_path:
                    message = "[User uploaded product image]"
                    print(f"[DEBUG] Using placeholder message for image", file=sys.stderr, flush=True)
                
                # Call agent with optional image path
                print(f"[DEBUG] Calling agent.chat()", file=sys.stderr, flush=True)
                result = agent.chat(message, image_path=image_path)
                print(f"[DEBUG] Agent returned: {result}", file=sys.stderr, flush=True)
                response = {"status": "success", "result": result}
            
            print(json.dumps(response), flush=True)
            
        except json.JSONDecodeError as e:
            error_msg = f"Invalid JSON: {str(e)}"
            print(f"[ERROR] {error_msg}", file=sys.stderr, flush=True)
            error_response = {"status": "error", "message": error_msg}
            print(json.dumps(error_response), flush=True)
        except Exception as e:
            error_msg = f"Exception: {str(e)}"
            print(f"[ERROR] {error_msg}", file=sys.stderr, flush=True)
            import traceback
            print(f"[ERROR] Traceback: {traceback.format_exc()}", file=sys.stderr, flush=True)
            error_response = {"status": "error", "message": str(e)}
            print(json.dumps(error_response), flush=True)

if __name__ == "__main__":
    main()

