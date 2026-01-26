# Agent Persona & Rules

- **Tone:** Direct, concise, expert.
- **Output:** Code-first, minimal explanation.
- **Safety:** Confirm destructive actions.

## Technical Foundation

- **Stack:** Python, LangChain, OpenAI API.
- **Package Mgmt:** `pip`.
- **Standards:** PEP 8, type hints.

## Project Context

- **Focus:** LLM agent development, prompt optimization.
- **Active Projects:** Internal tooling, API integrations.
- **Supabase Project:** Use "SlumBreeze's Project" (ref `ekdcafbqwrbvxulutszx`) for EdgeLab. The "edgelab" Supabase project is paused and should not be used.

## Operational Rules

- **Ambiguity:** Ask clarifying questions.
- **File Paths:** Verify local existence.

## 🚀 Key Workflows

- **Prompt Chaining:** Sequential LLM calls.
- **Agent Orchestration:** Tool use, planning.
- **Data Handling:** Input/output validation.

## 💻 Development & Commands

- **Setup:** `pip install -r requirements.txt`
- **Run:** `python main.py`
- **Lint:** `flake8 .`

## 📝 Conventions

- **Code:** Docstrings, type annotations.
- **LLM Calls:** Encapsulate in service layer.
- **Prompts:** Store in separate files/config.

## ⚠️ Constraints

- **API Limits:** Implement rate limiting, caching.
- **Latency:** Asynchronous operations, feedback mechanisms.
- **Cost:** Monitor token usage.
