import { createClient } from "@supabase/supabase-js";
import axios from "axios";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const HF_MODEL = process.env.HF_MODEL;
const HF_KEY = process.env.HF_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId, messages } = req.body;
  if (!userId || !messages) return res.status(400).json({ error: "Missing parameters" });

  const lastMessage = messages[messages.length - 1];

  try {
    await supabase.from("messages").insert({
      user_id: userId,
      role: lastMessage.role,
      content: lastMessage.content,
    });

    const hfResponse = await axios.post(
      `https://api-inference.huggingface.co/models/${HF_MODEL}`,
      { inputs: lastMessage.content, parameters: { max_new_tokens: 1024 } },
      { headers: { Authorization: `Bearer ${HF_KEY}` } }
    );

    const reply = hfResponse.data[0]?.generated_text || "🤖 Error generating text";

    await supabase.from("messages").insert({
      user_id: userId,
      role: "assistant",
      content: reply,
    });

    res.json({ reply });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ reply: "🤖 Model API error" });
  }
}
