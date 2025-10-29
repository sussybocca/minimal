import JSZip from "jszip";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

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
}
