// mega-gpt-clone.js
import express from "express";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import JSZip from "jszip";

const app = express();
app.use(express.json());

// ----------------------------
// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Supabase environment variables missing!");
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ----------------------------
// Hugging Face
const HF_MODEL = process.env.HF_MODEL;
const HF_KEY = process.env.HF_API_KEY;
if (!HF_MODEL || !HF_KEY) {
  console.error("Hugging Face environment variables missing!");
}

// ----------------------------
// POST chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { userId, messages } = req.body;
    if (!userId || !messages) return res.status(400).json({ error: "Missing parameters" });

    const lastMessage = messages[messages.length - 1];

    // Save user message
    await supabase.from("messages").insert({
      user_id: userId,
      role: lastMessage.role,
      content: lastMessage.content,
    });

    // Call Hugging Face
    const hfResponse = await axios.post(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      { inputs: lastMessage.content, parameters: { max_new_tokens: 1024 } },
      { headers: { Authorization: `Bearer ${HF_KEY}` } }
    );

    const reply = hfResponse.data[0]?.generated_text || "🤖 Error generating text";

    // Save assistant reply
    await supabase.from("messages").insert({
      user_id: userId,
      role: "assistant",
      content: reply,
    });

    res.json({ reply });
  } catch (err) {
    console.error("Chat endpoint error:", err.response?.data || err.message);
    res.status(500).json({ reply: "🤖 Model API error" });
  }
});

// ----------------------------
// Project download endpoint
app.post("/api/download", async (req, res) => {
  try {
    const { aiText } = req.body;
    if (!aiText) return res.status(400).send("Missing AI output");

    const regex = /=== file: (.*?) ===\n([\s\S]*?)(?=(\n=== file:)|$)/g;
    const zip = new JSZip();
    let match;
    while ((match = regex.exec(aiText)) !== null) {
      zip.file(match[1].trim(), match[2].trim());
    }

    const zipContent = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="project.zip"');
    res.send(zipContent);
  } catch (err) {
    console.error("Download endpoint error:", err.message);
    res.status(500).send("Error generating ZIP");
  }
});

// ----------------------------
// Serve simple frontend
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Mega GPT Clone</title>
  <style>
    body { margin:0; font-family:sans-serif; background:#1a1a1a; color:#f0f0f0; }
    #chat { max-width:900px; margin:auto; padding:20px; }
    .message { padding:8px; border-radius:6px; margin-bottom:5px; white-space:pre-wrap; font-family:monospace; }
    .user { background:#0b5fff; }
    .assistant { background:#333; }
    button { margin-left:5px; padding:6px 10px; border-radius:6px; border:none; cursor:pointer; }
  </style>
</head>
<body>
  <div id="chat">
    <h1>💻 Mega GPT Clone</h1>
    <div id="messages"></div>
    <input id="input" style="width:70%; padding:8px; border-radius:6px;"/>
    <button id="send">Send</button>
    <button id="download">Download ZIP</button>
  </div>
<script>
  const messagesDiv = document.getElementById('messages');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('send');
  const downloadBtn = document.getElementById('download');
  let aiBuffer = '';

  function addMessage(text, role) {
    const div = document.createElement('div');
    div.className = 'message ' + role;
    div.textContent = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  sendBtn.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    input.value = '';
    addMessage('🤔 Thinking...', 'assistant');

    try {
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ userId:'anonymous', messages:[{role:'user', content:text}] })
      });
      const data = await res.json();
      aiBuffer = data.reply;
      messagesDiv.lastChild.textContent = aiBuffer;
    } catch (err) {
      messagesDiv.lastChild.textContent = '🤖 Error connecting to server';
      console.error(err);
    }
  };

  downloadBtn.onclick = async () => {
    if (!aiBuffer) return;
    try {
      const res = await fetch('/api/download', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ aiText: aiBuffer })
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'project.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
    }
  };
</script>
</body>
</html>`);
});

// ----------------------------
// Export for Vercel
export default app;
