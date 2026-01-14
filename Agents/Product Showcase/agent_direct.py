"""
Direct stdin/stdout wrapper for NanoBananaAgent
Communicates via JSON messages instead of HTTP
"""

import json
import sys
import os
import time
import threading
from agent import NanoBananaAgent, load_config

# Ensure output is flushed immediately
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

# Session management for multi-user support
agents: dict[str, NanoBananaAgent] = {}
MAX_AGENTS = 100
SESSION_TIMEOUT = 3600  # 1 hour in seconds
session_last_used: dict[str, float] = {}

def get_or_create_agent(session_id: str, project_id: str, config) -> NanoBananaAgent:
    """Get existing agent for session or create new one"""
    if len(agents) >= MAX_AGENTS:
        cleanup_old_sessions()
    
    if session_id not in agents:
        print(f"[DEBUG] Creating new agent for session: {session_id[:8]}...", 
              file=sys.stderr, flush=True)
        agents[session_id] = NanoBananaAgent(project_id=project_id, config=config)
    
    session_last_used[session_id] = time.time()
    return agents[session_id]

def cleanup_old_sessions():
    """Remove sessions inactive for more than SESSION_TIMEOUT"""
    current_time = time.time()
    sessions_to_remove = [
        sid for sid, last_used in session_last_used.items()
        if current_time - last_used > SESSION_TIMEOUT
    ]
    for sid in sessions_to_remove:
        print(f"[DEBUG] Removing inactive session: {sid[:8]}...", 
              file=sys.stderr, flush=True)
        agents.pop(sid, None)
        session_last_used.pop(sid, None)

def periodic_cleanup():
    """Background thread for session cleanup"""
    while True:
        time.sleep(300)  # Every 5 minutes
        try:
            cleanup_old_sessions()
            if len(agents) > 0:
                print(f"[DEBUG] Active sessions: {len(agents)}", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"[ERROR] Cleanup failed: {e}", file=sys.stderr, flush=True)

def main():
    # Initialize configuration
    PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'postty-482019')
    
    try:
        config = load_config()
        
        # Send ready signal (don't create agent yet, will create per session)
        print(json.dumps({"status": "ready", "agent_id": config.agent_id}), flush=True)
        
    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}), flush=True)
        sys.exit(1)
    
    # Start background cleanup thread
    cleanup_thread = threading.Thread(target=periodic_cleanup, daemon=True)
    cleanup_thread.start()
    print("[DEBUG] Started session cleanup thread", file=sys.stderr, flush=True)
    
    # Process messages from stdin with session isolation
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
            session_id = request.get('session_id', 'default')  # Session ID for multi-user support
            user_id = request.get('user_id')  # Optional Firebase uid (used for post attribution)
            
            print(f"[DEBUG] Session: {session_id[:12]}..., Message: {message[:50] if message else 'None'}, Image: {image_path}", 
                  file=sys.stderr, flush=True)
            
            # Get or create agent for this specific session
            agent = get_or_create_agent(session_id, PROJECT_ID, config)
            # Persist Firebase uid on the agent instance so tool handlers can attribute work to the real user.
            try:
                if isinstance(user_id, str) and user_id.strip():
                    setattr(agent, "user_id", user_id.strip())
                else:
                    setattr(agent, "user_id", session_id)
            except Exception:
                pass
            
            # Allow empty message if image is provided
            if not message and not image_path:
                response = {"status": "error", "message": "No message or image provided"}
            else:
                # If only image provided, use a placeholder message
                if not message and image_path:
                    message = "[User uploaded product image]"
                    print(f"[DEBUG] Using placeholder message for image", file=sys.stderr, flush=True)
                
                # Call session-specific agent with optional image path
                print(f"[DEBUG] Calling agent.chat() for session {session_id[:8]}...", file=sys.stderr, flush=True)
                result = agent.chat(message, image_path=image_path)
                print(f"[DEBUG] Agent returned type: {result.get('type', 'unknown')}", file=sys.stderr, flush=True)
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

