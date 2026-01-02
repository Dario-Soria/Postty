#!/usr/bin/env python3
"""
Setup Verification Script for Postty Events Agent
Run this to check if your environment is configured correctly.
"""

import os
import sys
import json

def check_python_version():
    """Check if Python version is 3.10 or higher."""
    version = sys.version_info
    if version.major >= 3 and version.minor >= 10:
        print("✅ Python version:", f"{version.major}.{version.minor}.{version.micro}")
        return True
    else:
        print("❌ Python version:", f"{version.major}.{version.minor}.{version.micro}")
        print("   Required: Python 3.10 or higher")
        return False

def check_service_account():
    """Check if service account file exists."""
    sa_path = "secrets/sa.json"
    if os.path.exists(sa_path):
        try:
            with open(sa_path, 'r') as f:
                data = json.load(f)
                if "type" in data and data["type"] == "service_account":
                    print(f"✅ Service account file found: {sa_path}")
                    print(f"   Project ID: {data.get('project_id', 'unknown')}")
                    print(f"   Client Email: {data.get('client_email', 'unknown')}")
                    return True
                else:
                    print(f"❌ Service account file is invalid: {sa_path}")
                    return False
        except json.JSONDecodeError:
            print(f"❌ Service account file is not valid JSON: {sa_path}")
            return False
    else:
        print(f"❌ Service account file not found: {sa_path}")
        print("   Please create secrets/ folder and add your sa.json file")
        return False

def check_config_file():
    """Check if agent_config.json exists and is valid."""
    config_path = "agent_config.json"
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
                required_fields = ["agent_id", "region", "text_model", "image_model"]
                missing_fields = [f for f in required_fields if f not in config]
                
                if not missing_fields:
                    print(f"✅ Configuration file found: {config_path}")
                    print(f"   Agent ID: {config.get('agent_id')}")
                    print(f"   Region: {config.get('region')}")
                    print(f"   Text Model: {config.get('text_model')}")
                    print(f"   Image Model: {config.get('image_model')}")
                    return True
                else:
                    print(f"❌ Configuration file is missing fields: {', '.join(missing_fields)}")
                    return False
        except json.JSONDecodeError:
            print(f"❌ Configuration file is not valid JSON: {config_path}")
            return False
    else:
        print(f"❌ Configuration file not found: {config_path}")
        return False

def check_prompt_file():
    """Check if prompt.md exists."""
    prompt_path = "prompt.md"
    if os.path.exists(prompt_path):
        with open(prompt_path, 'r') as f:
            content = f.read()
            lines = len(content.splitlines())
            print(f"✅ Prompt file found: {prompt_path}")
            print(f"   Lines: {lines}")
            return True
    else:
        print(f"❌ Prompt file not found: {prompt_path}")
        return False

def check_dependencies():
    """Check if required packages are installed."""
    try:
        import google.genai
        print("✅ google-genai package installed")
        return True
    except ImportError:
        print("❌ google-genai package not installed")
        print("   Run: pip install -r requirements.txt")
        return False

def check_agent_file():
    """Check if agent.py exists."""
    agent_path = "agent.py"
    if os.path.exists(agent_path):
        with open(agent_path, 'r') as f:
            content = f.read()
            if 'PROJECT_ID = "postty-482019"' in content:
                print(f"⚠️  Agent file found but using default PROJECT_ID")
                print("   Remember to update PROJECT_ID in agent.py to your project ID")
                return True
            else:
                print(f"✅ Agent file found: {agent_path}")
                return True
    else:
        print(f"❌ Agent file not found: {agent_path}")
        return False

def main():
    print("=" * 60)
    print("Postty Events Agent - Setup Verification")
    print("=" * 60)
    print()
    
    checks = [
        ("Python Version", check_python_version),
        ("Dependencies", check_dependencies),
        ("Agent File", check_agent_file),
        ("Configuration File", check_config_file),
        ("Prompt File", check_prompt_file),
        ("Service Account", check_service_account),
    ]
    
    results = []
    for name, check_func in checks:
        print(f"\nChecking {name}...")
        results.append(check_func())
        print()
    
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    
    if passed == total:
        print(f"🎉 All checks passed! ({passed}/{total})")
        print("\nYou're ready to run the agent:")
        print("   python agent.py")
    else:
        print(f"⚠️  {passed}/{total} checks passed")
        print("\nPlease fix the issues above before running the agent.")
        print("See README.md for detailed setup instructions.")
    
    print("=" * 60)

if __name__ == "__main__":
    main()

