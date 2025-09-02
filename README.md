# T3 Streaming Starter

Monorepo with an Orchestrator, Agent, and shared types.

- Orchestrator:
  - REST: /v1/agents, /v1/jobs
  - WS: /agent (agents), /ui (UI clients)
  - Simple in-memory scheduler, heartbeats, job lifecycle

- Agent:
  - Connects to orchestrator, heartbeats, runs one job
  - Simulated runner (replace with real OBS/ffmpeg control)

## Quick start

1. Install deps (Node 20+):

   npm install

2. Configure env:

   cp packages/orchestrator/.env.example packages/orchestrator/.env
   cp packages/agent/.env.example packages/agent/.env

   Ensure the AGENT_TOKEN matches in both.

3. Dev run (orchestrator + one agent):

   npm run dev

4. Create a job:

   curl -X POST http://localhost:8080/v1/jobs \
   -H "Content-Type: application/json" \
   -d '{ "inlineConfig": { "title": "Test A" }, "idempotencyKey": "idem-1" }'

5. Watch logs in your terminal. Stop a job:

   curl -X POST http://localhost:8080/v1/jobs/<jobId>/stop

## Notes

- Replace FakeRunner in agent with real OBS/ffmpeg control.
- Persist to SQLite later; this starter uses in-memory stores.
- UI WS available at wss://<host>:8080/ui (no auth here; add JWT later).
