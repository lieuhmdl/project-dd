import mammoth from "mammoth";
import path from "path";
import fs from "fs";

export async function GET() {
  const filePath = path.join(process.cwd(), "rulebook", "rulebook.docx");
  if (!fs.existsSync(filePath)) {
    return Response.json({ error: "Rulebook not found" }, { status: 404 });
  }
  const { value: html } = await mammoth.convertToHtml({ path: filePath });

  // Parse sections from headings
  const sections = [];
  const headingRe = /<h([1-3])[^>]*>(.*?)<\/h\1>/gi;
  let match;
  while ((match = headingRe.exec(html)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]+>/g, "").trim();
    if (text) sections.push({ level, text });
  }

  return Response.json({ html, sections }, {
    headers: { "Cache-Control": "no-store" },
  });
}
