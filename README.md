# RAGnarock

RAGnarock is a local-first personal knowledge assistant. It indexes files from
`data/knowledge`, retrieves the most relevant passages, and answers questions
with source citations. The app works without a model by returning an extractive
answer; when Ollama is available it uses a local chat model for synthesis.

## Quick start

Requirements: Node.js 20 or newer. The optional model integration requires
[Ollama](https://ollama.com/) and a pulled chat model.

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>, add documents to `data/knowledge`, and click
**Reindex**. Supported first-version inputs are Markdown, text, HTML, JSON,
CSV, common chat exports, and PDF/DOCX when the optional extraction packages
are installed.

The HTTP API is intentionally small:

- `POST /api/index` indexes the knowledge folder.
- `POST /api/ask` accepts `{ "question": "..." }` and returns an answer plus
  cited passages.
- `GET /api/documents` lists indexed documents.

## Design

The ingestion, retrieval, and answer-generation boundaries are separate. This
keeps personal data local and makes it possible to add another local model,
embedding strategy, or source connector without changing the web UI.