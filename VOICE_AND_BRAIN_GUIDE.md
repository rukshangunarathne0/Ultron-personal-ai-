# RUK-AI // ULTRON PERSONAL AI — Voice & Brain Setup Guide

RUK-AI comes with **two built-in systems already active out of the box**:
1. **Built-in Ultron Vocal Synthesizer** (deep pitch-shifted browser TTS + Web Audio Vibranium Sub-Bass & Metallic Chamber Resonance + 60fps real-time mouth/cheek furnace lip-sync).
2. **Built-in Autonomous Local Neural Core** (zero-key offline memory extraction, `<profile>` / `<memories>` / `<memory_update>` protocol, safety guard, and directive queue).

---

## How to Give Ultron a Realistic Movie Voice (3 Upgrade Options)

Click the **SETUP (Radio)** button on the right-side dock of the HUD to configure any of these live:

### Option A — ElevenLabs (Best Movie-Grade James Spader / Ultron Voice)
1. Go to [elevenlabs.io](https://elevenlabs.io) and create a free account.
2. Click your profile icon (bottom-left) → **API Keys** → create & copy your key.
3. Choose a deep voice:
   - Built-in deep voices: **Brian** (`nPczCjzI2devNBz1zQrb`) or **Adam** (`pNInz6obpgDQGcFmaJgB`).
   - Or open **Voices → Voice Design** and enter prompt:
     > *"Deep, calm, menacing metallic AI overlord with resonant bass and slow deliberate cadence"*
     Save that voice and copy its **Voice ID**.
4. In RUK-AI's right-side **SETUP** modal → select **ELEVENLABS** → paste your API Key & Voice ID → leave **Vibranium Sub-Bass & Metallic Chamber Resonance (DSP)** checked → click **TEST ULTRON VOICE NOW**.

### Option B — OpenAI Neural TTS (`onyx` Voice)
1. Open **SETUP** on the right dock → select **OPENAI ONYX**.
2. Paste your OpenAI `sk-...` API key and select **`onyx`** (deepest commanding voice) or **`ash`**.
3. Keep **Vibranium Sub-Bass & Metallic Chamber Resonance** enabled for the metallic Ultron chest effect.

### Option C — 100% Free Offline Local AI Voice on Your PC (Piper TTS)
Run a local neural TTS server on your machine with zero cloud cost:
```bash
pip install piper-tts flask flask-cors
```
Create `tts_server.py`:
```python
import io, wave
from flask import Flask, request, send_file
from flask_cors import CORS
from piper.voice import PiperVoice

app = Flask(__name__)
CORS(app)
# Download en_US-ryan-high.onnx + .json from rhasspy/piper-voices
voice = PiperVoice.load("en_US-ryan-high.onnx")

@app.post("/api/tts")
def tts():
    text = request.json.get("text", "")
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        voice.synthesize(text, wav_file)
    buf.seek(0)
    return send_file(buf, mimetype="audio/wav")

app.run(port=5002)
```
Then open **SETUP → LOCAL PIPER** and set `http://localhost:5002/api/tts`.

---

## How to Connect a Full Cloud / Local AI Brain (LLM)
Open **SETUP → 2. CONNECT AI BRAIN (LLM KEY)**:
- **Google Gemini (Free API Key)**: Get a free key at `aistudio.google.com` → select **GOOGLE GEMINI** (`gemini-2.5-flash`).
- **Groq (Free & Ultra-Fast)**: Get a free key at `console.groq.com` → select **GROQ LLAMA-3.3** (`llama-3.3-70b-versatile`).
- **OpenAI / OpenRouter / Local Ollama**: Supported directly with the exact RUK-AI `<profile>`, `<memories>`, `<recent_chat>`, `<request>`, and `<memory_update>` specification.
