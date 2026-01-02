"""
Flask HTTP wrapper for the Product Showcase Agent
Provides REST API endpoints to communicate with the NanoBananaAgent
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from agent import NanoBananaAgent, load_config
import os
import sys
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Initialize the agent
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'postty-482019')
logger.info(f"Initializing agent with project: {PROJECT_ID}")

try:
    config = load_config()
    agent = NanoBananaAgent(project_id=PROJECT_ID, config=config)
    logger.info(f"Agent loaded successfully: {config.agent_id}")
except Exception as e:
    logger.error(f"Failed to initialize agent: {e}")
    sys.exit(1)


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'agent_id': config.agent_id,
        'timestamp': str(os.times())
    })


@app.route('/chat', methods=['POST'])
def chat():
    """
    Main chat endpoint
    Accepts a message and optional image path, returns agent response
    """
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No JSON data provided'}), 400
        
        message = data.get('message', '')
        image_path = data.get('image_path')
        
        if not message and not image_path:
            return jsonify({'error': 'Message or image_path required'}), 400
        
        # Build full message with image path if provided
        full_message = message
        if image_path:
            # Check if image exists
            if os.path.exists(image_path):
                full_message = f"{message} {image_path}".strip()
                logger.info(f"Processing message with image: {image_path}")
            else:
                logger.warning(f"Image path does not exist: {image_path}")
        
        logger.info(f"Sending message to agent: {full_message[:100]}...")
        
        # Call the agent
        result = agent.chat(full_message)
        
        logger.info(f"Agent response type: {result['type']}")
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        return jsonify({
            'error': 'Internal server error',
            'details': str(e)
        }), 500


@app.route('/reset', methods=['POST'])
def reset():
    """Reset the agent conversation history"""
    try:
        global agent
        # Reinitialize the agent to clear history
        agent = NanoBananaAgent(project_id=PROJECT_ID, config=config)
        logger.info("Agent conversation history reset")
        return jsonify({'status': 'ok', 'message': 'Conversation history cleared'})
    except Exception as e:
        logger.error(f"Error resetting agent: {e}")
        return jsonify({
            'error': 'Failed to reset agent',
            'details': str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('AGENT_PORT', 5001))
    logger.info(f"Starting Flask server on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)

