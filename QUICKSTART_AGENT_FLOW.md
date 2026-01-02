# Quick Start: Agent Flow

## ✅ Implementation Complete!

All features have been implemented. Follow these steps to run and test.

## 🚀 Quick Start (2 Minutes)

### Step 1: Install Python Dependencies

```bash
cd "Agents/Product Showcase"
pip3 install -r requirements.txt
pip3 install -r requirements-server.txt
cd ../..
```

### Step 2: Verify Google Cloud Setup

Your Google Cloud credentials should already be set up. Quick check:

```bash
cd "Agents/Product Showcase"
python3 verify_setup.py
cd ../..
```

If this fails, see the full README in that folder.

### Step 3: Start Backend

```bash
npm start
```

The backend will:
- Start on port 8080
- Auto-start Flask server (port 5001) when needed

### Step 4: Start Frontend (New Terminal)

```bash
cd frontend
npm run dev
```

Frontend runs on port 3000.

### Step 5: Test It!

1. Open: http://localhost:3000/v2
2. Sign in with Google (or email/password)
3. See the new Agent Selection screen
4. Click "Product Showcase"
5. Start chatting!

## 🎯 What Changed

### User Experience
- **Before**: After login → Instagram linking
- **Now**: After login → Agent Selection → Product Showcase Agent

### New Features
1. **Agent Selection Screen** - Choose from 4 agents (only Product Showcase active)
2. **Agent Chat** - Full conversational interface
3. **Microphone** - Hold button to record voice (works on all platforms)
4. **Image Upload** - Agent can request product images
5. **Image Generation** - Agent creates professional imagery

## 📱 Testing the Microphone

### Desktop
- Click and **hold** microphone button
- Speak while holding
- Release to transcribe
- Text appears in input field
- Click send

### Mobile
- Tap and **hold** microphone button
- Grant permission if asked
- Speak while holding
- Release to transcribe
- Tap send

## 🖼️ Testing Image Generation

Example conversation:

```
You: "Quiero promocionar mi remera polo"
Agent: "¡Hola! Vi que querés promocionar tu remera polo. ¿Qué estilo te gustaría?"
You: "Estilo old money"
Agent: "Perfecto. ¿Tenés una foto del producto?"
(Upload button appears)
You: (Upload image)
Agent: (Generates professional image)
(Download button appears)
```

## 🔍 Troubleshooting

### "Flask server not starting"
```bash
cd "Agents/Product Showcase"
python3 agent_server.py
# Should show "Starting Flask server on port 5001"
```

### "Port already in use"
```bash
# Kill process on port
lsof -ti:8080 | xargs kill -9  # Backend
lsof -ti:5001 | xargs kill -9  # Flask
lsof -ti:3000 | xargs kill -9  # Frontend
```

### "Microphone not working"
- Grant browser permissions
- Use HTTPS in production (HTTP works on localhost)
- Check browser console for errors

### "Agent not responding"
- Check backend logs for Flask server status
- Verify Google Cloud credentials
- Test Flask health: `curl http://localhost:5001/health`

## 📚 Documentation

- **Full Setup**: See `AGENT_SETUP_GUIDE.md`
- **Implementation Details**: See `AGENT_IMPLEMENTATION_SUMMARY.md`
- **Agent Docs**: See `Agents/Product Showcase/README.md`

## ✨ Key Features

| Feature | Location | Status |
|---------|----------|--------|
| Agent Selection | Step 2 after auth | ✅ |
| Product Showcase | Agent type 1 | ✅ |
| Other Agents | Coming soon | ⏳ |
| Text Chat | AgentChat UI | ✅ |
| Voice Input | Microphone button | ✅ |
| Image Upload | Inline in chat | ✅ |
| Image Generation | Via Gemini AI | ✅ |
| Cross-Platform | All devices | ✅ |

## 🎉 You're Ready!

The system is fully functional. All existing functionality remains intact - we only changed the V2 flow to skip Instagram linking and go straight to agents.

**Happy testing! 🚀**

