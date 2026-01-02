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
                
            request = json.loads(line)
            message = request.get('message', '')
            
            if not message:
                response = {"status": "error", "message": "No message provided"}
            else:
                # Call agent
                result = agent.chat(message)
                response = {"status": "success", "result": result}
            
            print(json.dumps(response), flush=True)
            
        except json.JSONDecodeError as e:
            error_response = {"status": "error", "message": f"Invalid JSON: {str(e)}"}
            print(json.dumps(error_response), flush=True)
        except Exception as e:
            error_response = {"status": "error", "message": str(e)}
            print(json.dumps(error_response), flush=True)

if __name__ == "__main__":
    main()

