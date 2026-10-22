import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pdf from "pdf-parse";
import mammoth from "mammoth";

type Passage = { id: string; source: string; text: string; score?: number };
type Document = { source: string; passages: Passage[]; updatedAt: string };

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const knowledgeDir = join(root, "data", "knowledge");
const publicDir = join(root, "public");
const indexPath = join(root, "data", "index.json");
let documents: Document[] = [];

const supported = new Set([".md", ".markdown", ".txt", ".html", ".htm", ".json", ".csv", ".log"]);
const stopWords = new Set("a an and are as at be by for from has have how i in is it me of on or that the this to was what when where which who why with you your".split(" "));

async function loadIndex() {
  try {
    documents = JSON.parse(await readFile(indexPath, "utf8")) as Document[];
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    documents = [];
  }
}

function splitPassages(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  const paragraphs = normalized.split(/\n{2,}/).filter(Boolean);
  const result: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= 900) result.push(paragraph);
    else for (let i = 0; i < paragraph.length; i += 800) result.push(paragraph.slice(i, i + 900));
  }
  return result;
}

async function extract(filePath: string): Promise<string> {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".pdf") return (await pdf(await readFile(filePath))).text;
  if (extension === ".docx") return (await mammoth.extractRawText({ path: filePath })).value;
  if (extension === ".html" || extension === ".htm") {
    return (await readFile(filePath, "utf8")).replace(/<[^>]*>/g, " ");
  }
  return readFile(filePath, "utf8");
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(path));
    else if (supported.has(extname(entry.name).toLowerCase()) || [".pdf", ".docx"].includes(extname(entry.name).toLowerCase())) files.push(path);
  }
  return files;
}

async function indexKnowledge(): Promise<number> {
  await mkdir(knowledgeDir, { recursive: true });
  const files = await collectFiles(knowledgeDir);
  documents = [];
  for (const filePath of files) {
    const source = relative(knowledgeDir, filePath).replaceAll("\\", "/");
    const passages = splitPassages(await extract(filePath)).map((text, index) => ({ id: `${source}:${index + 1}`, source, text }));
    if (passages.length) documents.push({ source, passages, updatedAt: new Date().toISOString() });
  }
  await writeFile(indexPath, JSON.stringify(documents, null, 2), "utf8");
  return documents.length;
}

function retrieve(question: string, limit = 5): Passage[] {
  const terms = question.toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g)?.filter((term) => !stopWords.has(term)) ?? [];
  return documents.flatMap((document) => document.passages).map((passage) => {
    const haystack = passage.text.toLowerCase();
    const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 + (haystack.split(term).length - 1) / 10 : 0), 0);
    return { ...passage, score };
  }).filter((passage) => (passage.score ?? 0) > 0).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, limit);
}

async function answer(question: string, passages: Passage[]): Promise<string> {
  const context = passages.map((passage) => `[${passage.id}]\n${passage.text}`).join("\n\n");
  const ollamaUrl = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434/api/generate";
  const model = process.env.OLLAMA_MODEL ?? "llama3.2:3b";
  try {
    const response = await fetch(ollamaUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      model, stream: false, prompt: `Answer only from the context. If the context does not contain the answer, say so. Cite sources like [file.md:1].\n\nContext:\n${context}\n\nQuestion: ${question}`,
    }) });
    if (response.ok) return String((await response.json() as { response?: string }).response ?? "").trim();
  } catch { /* Local model is optional; use the extractive fallback below. */ }
  return passages.length
    ? `The most relevant information I found is:\n\n${passages.map((passage) => `- ${passage.text} [${passage.id}]`).join("\n")}`
    : "I could not find relevant information in the indexed knowledge base.";
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw || "{}") as Record<string, unknown>;
}

async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "POST" && url.pathname === "/api/index") return sendJson(response, 200, { documents: await indexKnowledge() });
    if (request.method === "POST" && url.pathname === "/api/ask") {
      const question = String((await body(request)).question ?? "").trim();
      if (!question) return sendJson(response, 400, { error: "A question is required." });
      const passages = retrieve(question);
      return sendJson(response, 200, { answer: await answer(question, passages), sources: passages });
    }
    if (request.method === "GET" && url.pathname === "/api/documents") return sendJson(response, 200, { documents });
    if (request.method === "GET") {
      const requested = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = resolve(publicDir, `.${requested}`);
      if (!filePath.startsWith(publicDir)) return sendJson(response, 403, { error: "Forbidden." });
      const file = await stat(filePath);
      if (!file.isFile()) return sendJson(response, 404, { error: "Not found." });
      response.writeHead(200, { "content-type": requested.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8" });
      return createReadStream(filePath).pipe(response);
    }
    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

await loadIndex();
createServer((request, response) => void handler(request, response)).listen(Number(process.env.PORT ?? 3000), () => {
  console.log(`RAGnarock is running at http://localhost:${process.env.PORT ?? 3000}`);
});
