# Product Showcase Agent - Setup Guide

A conversational AI agent that acts as a specialized art director for product photography, generating professional Instagram/TikTok content using Google's Gemini AI.

## ✨ Features

- 🎨 **Conversational Workflow** - Natural 3-step process: Acknowledge → Ask → Generate
- 🖼️ **Flexible Image Input** - Share product images via URL or local file path for AI-powered analysis and enhancement
- 💬 **Context-Aware** - Maintains conversation history including image references for follow-up questions
- ⚡ **Smart Defaults** - Minimal questions, maximum efficiency
- 📸 **Professional Output** - Timestamped images optimized for Instagram/TikTok
- 🔄 **Fully Customizable** - Edit `prompt.md` to adjust agent behavior without code changes

## 📋 Prerequisites

- Python 3.10 or higher
- A Google Cloud account
- Basic command line knowledge

## 🚀 Quick Start

### 0. Verify Your Setup (Optional)

After completing the setup steps, you can verify everything is configured correctly:

```bash
python verify_setup.py
```

This will check:
- ✅ Python version
- ✅ Required dependencies
- ✅ Configuration files
- ✅ Service account credentials
- ✅ Prompt file

### 1. Google Cloud Project Setup

#### Step 1.1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Enter a project name (e.g., `postty-agent`)
5. Click **"Create"**
6. Note your **Project ID** (you'll need this later)

#### Step 1.2: Enable Required APIs

1. In the Google Cloud Console, go to **"APIs & Services"** > **"Library"**
2. Search for and enable the following APIs:
   - **Vertex AI API**
   - **Cloud AI Platform API**
3. Click **"Enable"** for each API

#### Step 1.3: Create a Service Account

1. Go to **"IAM & Admin"** > **"Service Accounts"**
2. Click **"Create Service Account"**
3. Fill in the details:
   - **Service account name:** `postty-agent-sa` (or any name you prefer)
   - **Service account ID:** Will auto-generate
   - **Description:** "Service account for Postty Events Agent"
4. Click **"Create and Continue"**

#### Step 1.4: Grant Permissions

In the "Grant this service account access to project" section, add these roles:
- **Vertex AI User** (`roles/aiplatform.user`)
- **Vertex AI Service Agent** (`roles/aiplatform.serviceAgent`)

Click **"Continue"** then **"Done"**

#### Step 1.5: Create and Download Service Account Key

1. Find your newly created service account in the list
2. Click the **three dots** (⋮) on the right > **"Manage keys"**
3. Click **"Add Key"** > **"Create new key"**
4. Select **JSON** format
5. Click **"Create"**
6. The key file will download automatically
7. **Important:** Rename the downloaded file to `sa.json`

### 2. Local Project Setup

#### Step 2.1: Clone/Download the Project

```bash
cd /path/to/your/projects
# If you have the code, navigate to the project folder
cd postty-Events-agent
```

#### Step 2.2: Create Secrets Folder

```bash
mkdir -p secrets
```

#### Step 2.3: Move Service Account Key

Move the downloaded `sa.json` file to the `secrets` folder:

```bash
mv ~/Downloads/sa.json secrets/sa.json
```

**Security Note:** The `secrets` folder should be in `.gitignore` to prevent committing credentials to version control.

#### Step 2.4: Create Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

#### Step 2.5: Install Dependencies

```bash
pip install google-genai
```

Or if you have a `requirements.txt`:

```bash
pip install -r requirements.txt
```

#### Step 2.6: Configure the Agent

Edit `agent_config.json` and update the `PROJECT_ID` in `agent.py`:

**agent_config.json:**
```json
{
    "agent_id": "nanobanana_v1",
    "region": "us-central1",
    "text_model": "gemini-2.5-flash",
    "image_model": "gemini-2.5-flash-image"
}
```

**agent.py** (line ~171):
```python
PROJECT_ID = "your-project-id-here"  # Replace with your actual project ID
```

### 3. Customize the Prompt

Edit `prompt.md` to customize the agent's behavior, personality, and workflow. The agent will automatically load this file on startup.

### 4. Run the Agent

```bash
python agent.py
```

You should see:

```
Agent loaded: nanobanana_v1
Type a message. Examples:
- 'Quiero promocionar mis galletitas de navidad'
- 'I need a hero shot for my new protein powder jar'
- 'How should I showcase my handmade candles for Instagram?'
Type 'exit' to quit.
```

**💡 Tip:** You can include images in two ways:

**1. Image URLs:**
```
You: I want to promote this product https://example.com/product.jpg
```

**2. Local file paths:**
```
You: Check out my product: ./myproduct.jpg
You: Here's the image: /Users/you/photos/product.png
You: See this: ~/Downloads/product.jpg
```

The agent will automatically detect the image (URL or file), analyze it, and use it as context for the conversation!

## 📁 Project Structure

```
postty-Events-agent/
├── agent.py                 # Main agent implementation
├── agent_config.json        # Model and region configuration
├── prompt.md               # System instructions (customizable)
├── requirements.txt        # Python dependencies
├── verify_setup.py         # Setup verification script
├── README.md              # This file
├── .gitignore             # Git ignore rules (protects secrets/)
├── secrets/
│   └── sa.json            # Service account credentials (DO NOT COMMIT)
├── .venv/                 # Virtual environment (auto-generated)
└── *.png                  # Generated images (timestamped)
```

## 💡 Usage Examples

### Example 1: Product Showcase with Image URL
```
You: I want to promote my cookies https://example.com/cookies.jpg
🖼️  Image URL detected: https://example.com/cookies.jpg
Assistant: I can see your beautiful chocolate chip cookies! They look homemade with 
          a rustic appeal. Would you like me to create a premium hero shot, a lifestyle 
          scene, or perhaps a flat lay arrangement?
You: Create a premium hero shot with studio lighting
Assistant: [Generates professional product image based on your uploaded photo]
📸 Image saved to: 20251226_143025.png
```

### Example 2: Product Showcase with Local File
```
You: Check out my product photo: ./myproduct.jpg
🖼️  Image File detected: ./myproduct.jpg
Assistant: I can see your product! It has great potential. What kind of post 
          would you like me to create?
You: Make it look more premium with dramatic lighting
Assistant: [Generates enhanced version]
📸 Image saved to: 20251226_143026.png
```

### Example 3: Text-Only Product Showcase
```
You: Quiero promocionar mis galletitas de navidad
Assistant: [Brief acknowledgment and 1-2 targeted questions]
You: [Provide details]
Assistant: [Generates professional product image]
📸 Image saved to: 20251226_143027.png
```

### Example 4: Follow-up with Image Context
```
You: Here's my product https://example.com/product.jpg What do you think?
🖼️  Image URL detected: https://example.com/product.jpg
Assistant: [Analyzes your product image and provides feedback]
You: Make it look more premium
Assistant: [Uses previous image context to generate enhanced version]
📸 Image saved to: 20251226_143028.png
```

### Example 5: Conversational Flow
The agent follows a 3-step workflow:
1. **Acknowledge** - Brief recognition of your product (with or without image)
2. **Ask** - Minimal necessary questions (assumes smart defaults)
3. **Generate** - Creates professional imagery when ready

## 🔧 Configuration

### Model Options

You can change models in `agent_config.json`:

**Text Models:**
- `gemini-2.5-flash` (recommended, fast)
- `gemini-2.0-flash-exp` (experimental)
- `gemini-1.5-flash-002` (stable)
- `gemini-1.5-pro-002` (more capable, slower)

**Image Models:**
- `gemini-2.5-flash-image` (recommended)
- `imagen-3.0-generate-001` (Google Imagen 3)

### Region Options

Common regions:
- `us-central1` (default)
- `us-east4`
- `europe-west4`
- `asia-southeast1`

## 🎨 Customizing the Agent

Edit `prompt.md` to change:
- Agent personality and tone
- Conversational workflow
- Image generation guidelines
- Response style (brief/detailed)

Changes take effect immediately on next run (no code changes needed).

## 🔒 Security Best Practices

1. **Never commit `secrets/sa.json`** to version control
2. Add `secrets/` to `.gitignore`
3. Rotate service account keys periodically
4. Use least-privilege IAM roles
5. Don't share your service account key file

## 🐛 Troubleshooting

### Error: "404 NOT_FOUND - Model not found"
- Check that the model names in `agent_config.json` are correct
- Verify that Vertex AI API is enabled in your project
- Ensure your region supports the selected models

### Error: "DefaultCredentialsError"
- Verify `secrets/sa.json` exists and is valid
- Check that the service account has proper permissions
- Ensure the PROJECT_ID in `agent.py` matches your Google Cloud project

### Error: "403 PERMISSION_DENIED"
- Verify your service account has the required roles:
  - Vertex AI User
  - Vertex AI Service Agent
- Check that the APIs are enabled in your project

### Images Not Following Prompt Instructions
- Verify `prompt.md` is in the project root
- Check that the file is being loaded (agent should acknowledge at startup)
- Review conversation history - the agent needs context

## 📊 Generated Images

Images are saved with timestamps in the format: `yyyyMMdd_hhmmss.png`

Example: `20251226_143025.png` = December 26, 2025 at 2:30:25 PM

This prevents overwriting and allows easy tracking of generation history.

## 🆘 Support

For issues related to:
- **Google Cloud Setup:** [Google Cloud Documentation](https://cloud.google.com/docs)
- **Vertex AI:** [Vertex AI Documentation](https://cloud.google.com/vertex-ai/docs)
- **Gemini Models:** [Gemini API Documentation](https://ai.google.dev/docs)

## 📝 License

[Add your license here]

## 🙏 Acknowledgments

Built with:
- Google Gemini AI (text generation)
- Google Vertex AI (image generation)
- Python 3.12+
