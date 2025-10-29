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
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ----------------------------
// Hugging Face
const HF_MODEL = process.env.HF_MODEL;
const HF_KEY = process.env.HF_API_KEY;

// ----------------------------
// POST chat endpoint
app.post("/api/chat", async (req, res) => {
  const { userId, messages } = req.body;
  if (!userId || !messages) return res.status(400).json({ error: "Missing parameters" });

  const lastMessage = messages[messages.length - 1];

  // Save user message
  try {
    await supabase.from("messages").insert({
      user_id: userId,
      role: lastMessage.role,
      content: lastMessage.content,
    });
  } catch (err) {
    console.error("Supabase insert error:", err.message);
  }

  // Call HF API
  try {
    const hfResponse = await axios.post(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      { inputs: lastMessage.content, parameters: { max_new_tokens: 1024 } },
      { headers: { Authorization: `Bearer ${HF_KEY}` } }
    );
    const reply = hfResponse.data[0]?.generated_text || "🤖 Error generating text";

    // Save assistant reply
    try {
      await supabase.from("messages").insert({
        user_id: userId,
        role: "assistant",
        content: reply,
      });
    } catch (err) {
      console.error("Supabase insert error:", err.message);
    }

    // Return reply
    res.json({ reply });
  } catch (err) {
    console.error("HF API error:", err.response?.data || err.message);
    res.status(500).json({ reply: "🤖 Model API error" });
  }
});

// ----------------------------
// Project download endpoint
app.post("/api/download", async (req, res) => {
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
});

// ----------------------------
// Serve simple frontend
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Mega GPT Clone</title>
  <style>
    body { margin:0; font-family:sans-serif; background:#1a1a1a; color:#f0f0f0; }
    #chat { max-width:900px; margin:auto; padding:20px; }
    .message { padding:8px; border-radius:6px; margin-bottom:5px; white-space:pre-wrap; font-family:monospace; }
    .user { background:#0b5fff; }
    .assistant { background:#333; }
  </style>
</head>
<body>
  <div id="chat">
    <h1>💻 Mega GPT Clone</h1>
    <div id="messages"></div>
    <input id="input" style="width:80%; padding:8px; border-radius:6px;"/>
    <button id="send">Send</button>
    <button id="download">Download Project ZIP</button>
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

    const res = await fetch('/api/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ userId:'anonymous', messages:[{role:'user', content:text}] })
    });
    const data = await res.json();
    aiBuffer = data.reply;
    messagesDiv.lastChild.textContent = aiBuffer;
  };

  downloadBtn.onclick = async () => {
    if (!aiBuffer) return;
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
  };
</script>
</body>
</html>
  `);
});

export default app;
