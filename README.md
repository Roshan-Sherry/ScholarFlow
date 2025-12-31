# ScholarFlow

**ScholarFlow** is a unified operating system for academic research. It bridges the gap between literature discovery, deep reading, and manuscript co-authoring, utilizing Google Gemini as an intelligent cognitive layer.

## 🏗 System Architecture

The application is designed around two distinct **Modes** that adapt the interface to the user's cognitive state:

### 1. Research Mode (Light Theme)
*   **Focus:** Information Gathering, Synthesis, and Reading.
*   **Views:**
    *   **Discovery:** A chat-first workspace for finding papers and generating literature reviews.
    *   **Reading:** A focused PDF reading environment with active note-taking.
*   **Context Manager:** The left sidebar acts as a "Library". Users check/uncheck papers to define the **Global Context** (RAG scope) for the AI agent.

### 2. Studio Mode (Dark Theme)
*   **Focus:** Content Creation and Production.
*   **Views:**
    *   **Studio:** A split-screen LaTeX editor with real-time preview.
*   **Co-Author:** The left sidebar transforms into a file tree, while the AI agent becomes a "Co-Author" capable of drafting sections of text.

---

## 🧩 Key Components

### The Agent (SidebarRight)
A persistent AI companion that maintains state across the application.
*   **Visual Avatar:** An animated orb indicating state (`IDLE`, `THINKING`, `SPEAKING`).
*   **Context Awareness:** Automatically switches context based on the active view (e.g., specific paper in Reading mode vs. selected library in Discovery mode).

### Workspace Discovery
*   **Intent Detection:** Routes user inputs to either a QA engine (for specific answers) or a Search engine (for finding papers).
*   **Synthesis:** Generates structured answers citing sources from the project library.

### Workspace Studio
*   **Latex Editor:** Custom text area with syntax highlighting simulation.
*   **Live Preview:** Regex-based rendering engine to preview LaTeX as HTML.
*   **AI Drafting:** Streams text directly into the editor cursor position, integrating citations (`\cite{...}`) from the project's bibliography.

---

## 🤖 AI Services

Powered by the **Google Gemini API** (`@google/genai`).

*   **`generateAgentResponse`**: Handles conversational RAG queries.
*   **`generateResearchOutline`**: Analyzes a set of papers to propose a manuscript structure.
*   **`streamSectionDraft`**: Generates academic prose for specific sections, utilizing context papers for ground truth.

---

## 🛠 Tech Stack

*   **Frontend:** React 19
*   **Styling:** Tailwind CSS (with custom `academic` color palette)
*   **Icons:** Lucide React
*   **Markdown:** react-markdown
