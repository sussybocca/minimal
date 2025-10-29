// mega-gpt-clone.js
// All-in-one ChatGPT clone with code/project generation, streaming, Supabase, Hugging Face, and download ZIP

import express from "express";
import React, { useState, useEffect, useRef } from "react";
import ReactDOMServer from "react-dom/server";
import axios from "axios";
import JSZip from "jszip";
import { createClient } from "@supabase/supabase-js";

// ----------------------------
// Supabase setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ----------------------------
// Hugging Face setup
const HF_MODEL = process.env.HF_MODEL || "mistralai/Mixtral-8x7B-Instruct-v0.1";
const HF_KEY = process.env.HF_API_KEY;

// ----------------------------
// Express server
const app = express();
app.use(express.json());

// ----------------------------
// Chat streaming endpoint (SSE)
app.post("/api/chat", async (req, res) => {
  const { userId, messages } = req.body;
  if (!userId || !messages) return res.status(400).json({ error: "Missing parameters" });

  const lastMessage = messages[messages.length - 1];

  // Save user message
  await supabase.from("messages").insert({
    user_id: userId,
    role: lastMessage.role,
    content: lastMessage.content,
  });

  // SSE setup
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  try {
    const hfResponse = await axios.post(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      { inputs: lastMessage.content, parameters: { max_new_tokens: 1024 } },
      { headers: { Authorization: `Bearer ${HF_KEY}` } }
    );

    let reply = hfResponse.data[0]?.generated_text || "🤖 Error generating text";

    // Simulate streaming token-by-token
    const tokens = reply.match(/.{1,30}/g) || [];
    for (let t of tokens) {
      res.write(`data: ${JSON.stringify({ token: t })}\n\n`);
      await new Promise(r => setTimeout(r, 40));
    }

    // Save assistant reply
    await supabase.from("messages").insert({
      user_id: userId,
      role: "assistant",
      content: reply,
    });

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.write(`data: ${JSON.stringify({ token: "🤖 Model API error", done: true })}\n\n`);
    res.end();
  }
});

// ----------------------------
// Project download endpoint
app.post("/api/download", async (req, res) => {
  const { aiText } = req.body;
  if (!aiText) return res.status(400).send("Missing AI output");

  // Parse files using markers === file: filename ===
  const regex = /=== file: (.*?) ===\n([\s\S]*?)(?=(\n=== file:)|$)/g;
  const zip = new JSZip();

  let match;
  while ((match = regex.exec(aiText)) !== null) {
    const filename = match[1].trim();
    const content = match[2].trim();
    zip.file(filename, content);
  }

  const zipContent = await zip.generateAsync({ type: "nodebuffer" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="project.zip"');
  res.send(zipContent);
});

// ----------------------------
// React frontend
function MegaChatApp({ userId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [aiBuffer, setAiBuffer] = useState("");
  const chatRef = useRef(null);

  async function sendMessage() {
    if (!input.trim()) return;
    const newMessages = [...messages, { role: "user", content: input }];
    setMessages(newMessages);
    setInput("");
    setThinking(true);
    setAiBuffer("");

    const eventSource = new EventSourcePolyfill("/api/chat-sse-proxy", {
      method: "POST",
      body: JSON.stringify({ userId, messages: newMessages }),
      headers: { "Content-Type": "application/json" },
    });

    eventSource.onmessage = e => {
      const data = JSON.parse(e.data);
      if (data.token) {
        setAiBuffer(prev => prev + data.token);
      }
      if (data.done) {
        setMessages(prev => [...newMessages, { role: "assistant", content: aiBuffer + data.token || "" }]);
        setThinking(false);
        eventSource.close();
        chatRef.current.scrollTop = chatRef.current.scrollHeight;
      }
    };
  }

  async function downloadProject() {
    const res = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiText: aiBuffer }),
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project.zip";
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <div style={{ fontFamily: "sans-serif", background: "#1a1a1a", color: "#f0f0f0", height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: 20 }}>
      <h1>💻 Mega GPT Clone</h1>
      <div ref={chatRef} style={{ flex: 1, width: "100%", maxWidth: 900, overflowY: "auto", border: "1px solid #333", borderRadius: 8, padding: 10, marginBottom: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ background: m.role === "user" ? "#0b5fff" : "#333", padding: 8, borderRadius: 6, marginBottom: 5, whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
            {m.content}
          </div>
        ))}
        {thinking && <div style={{ color: "#aaa", fontStyle: "italic" }}>🤔 Thinking...</div>}
      </div>
      <div style={{ display: "flex", width: "100%", maxWidth: 900 }}>
        <input value={input} onChange={e => setInput(e.target.value)} style={{ flex: 1, padding: 8, borderRadius: "6px 0 0 6px", border: "1px solid #555", background: "#222", color: "#f0f0f0" }} placeholder="Ask anything or generate a project..." />
        <button onClick={sendMessage} style={{ padding: 8, background: "#0b5fff", color: "#fff", borderRadius: "0 6px 6px 0", border: "none" }}>Send</button>
      </div>
      {aiBuffer && <button onClick={downloadProject} style={{ marginTop: 10, padding: 8, borderRadius: 6, background: "#0bff87", border: "none" }}>Download Project ZIP</button>}
    </div>
  );
}

// ----------------------------
// Render frontend
app.get("/", (req, res) => {
  const userId = "anonymous"; // replace with Supabase auth logic if needed
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Mega GPT Clone</title>
        <script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
        <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
        <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/event-source-polyfill/src/eventsource.min.js"></script>
      </head>
      <body style="margin:0;">
        <div id="root"></div>
        <script type="text/javascript">
          const e = React.createElement;
          const MegaChatApp = ${MegaChatApp.toString()};
          ReactDOM.createRoot(document.getElementById("root")).render(e(MegaChatApp, { userId: "${userId}" }));
        </script>
      </body>
    </html>
  `;
  res.send(html);
});

// ----------------------------
// Export server for Vercel
export default app;
