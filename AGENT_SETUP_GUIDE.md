# Agent Flow Setup Guide

## Overview

This guide explains how to set up and run the new Agent Flow feature that allows users to interact with specialized AI agents.

## Architecture

The system consists of three main components:

1. **Frontend (Next.js)**: Agent selection UI and chat interface
2. **Backend (Node.js/Fastify)**: API endpoint that manages agent communication
3. **Python Agent (Flask)**: Standalone Flask server running the Product Showcase agent

## Setup Steps

### 1. Install Python Dependencies

Navigate to the Product Showcase agent directory and install dependencies:

```bash
cd "Agents/Product Showcase"

# Install base requirements
pip3 install -r requirements.txt

# Install Flask server requirements
pip3 install -r requirements-server.txt
```

### 2. Verify Google Cloud Setup

The Product Showcase agent requires:
- Google Cloud Project with Vertex AI enabled
- Service account key at `Agents/Product Showcase/secrets/sa.json`
- Project ID configured in `agent_server.py` (defaults to `postty-482019`)

Verify setup:
```bash
cd "Agents/Product Showcase"
python3 verify_setup.py
```

### 3. Install Node.js Dependencies

If you haven't already, install the backend dependencies:

```bash
npm install
```

Make sure `axios` is installed (needed for Python agent communication):
```bash
npm install axios
```

### 4. Start the Backend Server

From the project root:

```bash
npm run dev
# or
npm start
```

The backend will automatically start the Python Flask server on port 5001 when a user first interacts with the Product Showcase agent.

### 5. Start the Frontend

In a separate terminal:

```bash
cd frontend
npm run dev
```

## How It Works

### User Flow

1. User authenticates (Google or email/password)
2. User sees Agent Selection screen with 4 agent cards
3. User clicks "Product Showcase"
4. User enters Agent Chat interface
5. User can:
   - Type messages
   - Use voice input (hold microphone button)
   - Upload images when requested
6. Agent generates professional product imagery
7. User can download generated images

### Technical Flow

```
Frontend (Next.js)
    ↓ POST /api/agent-chat
Backend (Node.js)
    ↓ Starts Flask server if needed
    ↓ POST http://localhost:5001/chat
Python Flask Server
    ↓ Calls NanoBananaAgent
Gemini AI (Vertex AI)
    ↓ Returns response
Flask Server
    ↓ Returns JSON response
Backend
    ↓ Moves generated images
    ↓ Returns to frontend
Frontend
    ↓ Displays in chat
```

### API Endpoints

**Backend (Node.js)**
- `POST /api/agent-chat` - Main agent communication endpoint
  - Accepts: `agentType`, `message`, `conversationHistory`, `image` (file)
  - Returns: `{ type: "text"|"image", text: string, imageUrl?: string }`

**Flask Server (Python)**
- `GET /health` - Health check
- `POST /chat` - Send message to agent
  - Accepts: `{ message: string, image_path?: string }`
  - Returns: `{ type: "text"|"image", text: string, file?: string }`
- `POST /reset` - Reset conversation history

## Generated Images

Images are stored in:
- **Temporary**: `Agents/Product Showcase/` (during generation)
- **Final**: `generated-images/` (moved after generation)

Format: `yyyyMMdd_hhmmss.png` (e.g., `20231226_143025.png`)

## Troubleshooting

### Flask Server Won't Start

**Problem**: Backend logs show "Failed to start agent server"

**Solutions**:
1. Check Python is installed: `python3 --version`
2. Verify dependencies: `cd "Agents/Product Showcase" && pip3 list`
3. Check port 5001 is available: `lsof -i :5001`
4. Manually test Flask server:
   ```bash
   cd "Agents/Product Showcase"
   python3 agent_server.py
   ```

### Agent Returns Errors

**Problem**: Agent chat shows "Error communicating with agent"

**Solutions**:
1. Check Flask logs in backend console
2. Verify Google Cloud credentials:
   ```bash
   ls -la "Agents/Product Showcase/secrets/sa.json"
   ```
3. Test agent directly:
   ```bash
   cd "Agents/Product Showcase"
   python3 agent.py
   ```

### Images Not Displaying

**Problem**: Generated images don't show in chat

**Solutions**:
1. Check `generated-images/` folder exists
2. Verify Next.js can serve static files from that location
3. Check browser console for 404 errors

### Microphone Not Working

**Problem**: Voice input doesn't work

**Solutions**:
1. Grant microphone permissions in browser
2. Use HTTPS (required for microphone on mobile)
3. Check browser console for getUserMedia errors

## Testing

### Manual Test Checklist

- [ ] Backend starts without errors
- [ ] Flask server starts automatically on first agent request
- [ ] Frontend loads Agent Selection screen after auth
- [ ] "Product Showcase" button opens chat
- [ ] Other agent buttons show "Próximamente"
- [ ] Can type and send messages
- [ ] Microphone button works (desktop)
- [ ] Microphone button works (mobile)
- [ ] Agent responds to messages
- [ ] Can upload images when requested
- [ ] Agent generates images
- [ ] Generated images display in chat
- [ ] Download button works
- [ ] "Crear otra" button returns to agent selection

### Quick Test

1. Start backend: `npm start` (from root)
2. Start frontend: `cd frontend && npm run dev`
3. Open browser: http://localhost:3000/v2
4. Login with Google
5. Click "Product Showcase"
6. Type: "Quiero promocionar mi producto"
7. Verify agent responds

## Environment Variables

Optional environment variables:

```bash
# Backend
AGENT_PORT=5001  # Port for Flask server

# Google Cloud (for Python agent)
GOOGLE_CLOUD_PROJECT=postty-482019
GOOGLE_APPLICATION_CREDENTIALS=./Agents/Product\ Showcase/secrets/sa.json
```

## Future Agents

To add new agents:

1. Create folder: `Agents/Agent-Name/`
2. Implement agent with `chat(message)` method
3. Create Flask wrapper: `agent_server.py`
4. Update `AgentSelectionScreen.tsx` with new button
5. Update `agent-chat.ts` to route to new agent
6. Update `productShowcaseAgent.ts` for new agent type

## Support

For issues:
- Check backend logs for Flask server errors
- Check browser console for frontend errors
- Verify Google Cloud setup with `verify_setup.py`
- Test agent standalone: `python3 agent.py`

