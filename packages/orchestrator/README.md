# Stream Control Orchestrator

A job orchestration system that manages distributed agents and coordinates job execution across a network of worker nodes.

## Overview

The Orchestrator is the central coordination service in the Stream Control system. It manages:

- **Agent Lifecycle**: Registration, health monitoring, and state management of worker agents
- **Job Scheduling**: Assignment of jobs to available agents based on capabilities and availability
- **Real-time Communication**: WebSocket-based messaging for agents and UI clients
- **REST API**: HTTP endpoints for job and agent management
- **Fault Tolerance**: Heartbeat monitoring, job recovery, and graceful shutdown handling

## Architecture

```
┌─────────────────┐    ┌─────────────────┐
│   UI Clients    │◄──►│   Orchestrator  │◄──┐
│  (WebSockets)   │    │                 │   │
└─────────────────┘    │                 │   │
                       │   ┌─────────┐   │   │
                       │   │ REST    │   │   │
                       │   │ API     │   │   │
                       │   └─────────┘   │   │
                       └─────────────────┘   │
                              ▲              │
                              │              │
                       ┌──────┴──────────────┴────┐
                       │                         │
            ┌─────────────────┐       ┌─────────────────┐
            │     Agent 1     │       │     Agent N     │
            │  (WebSocket)    │       │  (WebSocket)    │
            └─────────────────┘       └─────────────────┘
```

## Quick Start

### Installation

```bash
npm install @stream-control/orchestrator
```

### Basic Usage

```typescript
import { Orchestrator } from '@stream-control/orchestrator';

// Start the orchestrator server
const orchestrator = new Orchestrator({
  port: 8080,
  agentToken: 'your-secret-token'
});

orchestrator.start();
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `AGENT_TOKEN` | `dev-shared-token` | Authentication token for agents |
| `HEARTBEAT_INTERVAL_MS` | `3000` | Agent heartbeat interval |
| `HEARTBEAT_TIMEOUT_MS` | `10000` | Agent timeout after missed heartbeats |
| `STOP_GRACE_MS` | `10000` | Grace period before force-stopping jobs |
| `KILL_AFTER_MS` | `5000` | Force kill timeout after grace period |

## API Reference

### REST Endpoints

#### Health Check
```http
GET /healthz
```

Returns service health status.

#### Agent Management

**List Agents**
```http
GET /v1/agents
```

Returns array of all registered agents.

**Set Agent Drain Mode**
```http
POST /v1/agents/:id/drain
Content-Type: application/json

{
  "drain": true
}
```

Sets an agent's drain mode to prevent new job assignments.

#### Job Management

**List Jobs**
```http
GET /v1/jobs
```

Returns array of all jobs, sorted by creation time.

**Get Job Details**
```http
GET /v1/jobs/:id
```

Returns detailed information about a specific job.

**Submit Job**
```http
POST /v1/jobs
Content-Type: application/json

{
  "templateId": "stream-template-1",
  "idempotencyKey": "unique-job-key",
  "restartPolicy": "never"
}
```

OR

```http
POST /v1/jobs
Content-Type: application/json

{
  "inlineConfig": {
    "streamUrl": "rtmp://example.com/live",
    "outputPath": "/tmp/output.mp4"
  },
  "idempotencyKey": "unique-job-key",
  "restartPolicy": "onFailure"
}
```

**Stop Job**
```http
POST /v1/jobs/:id/stop
```

Initiates graceful shutdown of a running job.

**Mute Job**
```http
POST /v1/jobs/:id/mute
```

Mutes audio for a running job. Sends mute command to the responsible agent.

**Unmute Job**
```http
POST /v1/jobs/:id/unmute
```

Unmutes audio for a running job. Sends unmute command to the responsible agent.

**Get Stream Metadata**
```http
GET /v1/jobs/:id/metadata
```

Retrieves current stream metadata for a job (title, description, viewers, URLs, etc.).

**Update Stream Metadata**
```http
PUT /v1/jobs/:id/metadata
Content-Type: application/json

{
  "title": "My Live Stream",
  "description": "Streaming awesome content!",
  "viewers": 1234,
  "publicUrl": "https://youtube.com/watch?v=abc123",
  "adminUrl": "https://studio.youtube.com/video/abc123",
  "platform": "youtube",
  "streamId": "abc123"
}
```

Updates stream metadata for a job. All fields are optional and will be merged with existing metadata.

### WebSocket Connections

#### Agent Connection
```
ws://localhost:8080/agent
```

Agents must authenticate and register using the agent protocol.

#### UI Connection
```
ws://localhost:8080/ui
```

UI clients receive real-time updates about agents and jobs.

## Message Protocols

### Agent Protocol

**Agent Hello**
```json
{
  "type": "agent.hello",
  "msgId": "uuid",
  "ts": "2024-01-01T00:00:00.000Z",
  "payload": {
    "agentId": "agent-123",
    "name": "Streaming Agent v1.0",
    "version": "1.0.0",
    "capabilities": {
      "slots": 2,
      "maxResolution": "1080p"
    },
    "drain": false,
    "activeJob": null,
    "auth": {
      "token": "your-agent-token"
    }
  }
}
```

**Job Assignment Acknowledgment**
```json
{
  "type": "agent.assign.ack",
  "correlationId": "original-msg-id",
  "payload": {
    "jobId": "job-456",
    "accepted": true
  }
}
```

**Job Status Updates**
```json
{
  "type": "agent.job.update",
  "payload": {
    "jobId": "job-456",
    "status": "RUNNING"
  }
}
```

**Mute/Unmute Acknowledgment**
```json
{
  "type": "agent.job.mute",
  "payload": {
    "jobId": "job-456",
    "success": true
  }
}
```

```json
{
  "type": "agent.job.unmute",
  "payload": {
    "jobId": "job-456",
    "success": true
  }
}
```

### UI Protocol

**Agent Updates**
```json
{
  "type": "ui.agent.update",
  "payload": {
    "id": "agent-123",
    "name": "Streaming Agent v1.0",
    "state": "IDLE",
    "currentJobId": null,
    "lastSeenAt": "2024-01-01T00:00:00.000Z",
    "drain": false,
    "capabilities": {
      "slots": 2
    }
  }
}
```

**Job Updates**
```json
{
  "type": "ui.job.update",
  "payload": {
    "id": "job-456",
    "templateId": "stream-template-1",
    "status": "RUNNING",
    "agentId": "agent-123",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "startedAt": "2024-01-01T00:00:05.000Z"
  }
}
```

## Data Types

### Agent States
- `OFFLINE` - Agent disconnected or unreachable
- `IDLE` - Agent available for job assignment
- `RESERVED` - Agent reserved for a pending job
- `STARTING` - Agent initializing job execution
- `RUNNING` - Agent actively executing a job
- `STOPPING` - Agent stopping job execution
- `ERROR` - Agent encountered an error
- `DRAINING` - Agent in drain mode, finishing current jobs

### Job Statuses
- `CREATED` - Job created but not yet scheduled
- `PENDING` - Job waiting for agent assignment
- `ASSIGNED` - Job assigned to an agent
- `ACCEPTED` - Agent accepted job assignment
- `STARTING` - Job starting execution
- `RUNNING` - Job actively running
- `STOPPING` - Job stopping (graceful shutdown)
- `STOPPED` - Job stopped successfully
- `FAILED` - Job failed with error
- `CANCELED` - Job canceled by user
- `UNKNOWN` - Job status unknown (agent offline)

### Stream Metadata

Jobs can include stream metadata for enhanced monitoring and control:

```typescript
interface StreamMetadata {
  title?: string;
  description?: string;
  viewers?: number;
  publicUrl?: string;
  adminUrl?: string;
  isMuted?: boolean;
  streamId?: string;
  platform?: string; // e.g., "youtube", "twitch", etc.
}
```

### Job Configuration

Jobs can be submitted with either:
- **Template ID**: Reference to a predefined job template
- **Inline Config**: Direct configuration object

## Integration Examples

### Node.js Client

```typescript
import WebSocket from 'ws';

// Connect to UI WebSocket for real-time updates
const ws = new WebSocket('ws://localhost:8080/ui');

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Update:', message);
});

// Submit a job via REST API
const response = await fetch('http://localhost:8080/v1/jobs', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    inlineConfig: {
      streamUrl: 'rtmp://example.com/live',
      outputFormat: 'mp4'
    },
    idempotencyKey: 'my-job-123'
  })
});

const job = await response.json();
console.log('Job created:', job.id);

// Update stream metadata
await fetch(`http://localhost:8080/v1/jobs/${job.id}/metadata`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'My Awesome Stream',
    description: 'Live streaming amazing content!',
    platform: 'youtube'
  })
});

// Control audio
await fetch(`http://localhost:8080/v1/jobs/${job.id}/mute`, {
  method: 'POST'
});

// Later unmute
await fetch(`http://localhost:8080/v1/jobs/${job.id}/unmute`, {
  method: 'POST'
});
```

### Python Client

```python
import websocket
import json
import requests
import time

# Submit job
job_data = {
    "inlineConfig": {
        "streamUrl": "rtmp://example.com/live",
        "quality": "1080p"
    },
    "idempotencyKey": "python-job-123"
}

response = requests.post('http://localhost:8080/v1/jobs', json=job_data)
job = response.json()
print(f"Job created: {job['id']}")

# Update stream metadata
metadata = {
    "title": "Python Stream",
    "description": "Streaming from Python client",
    "platform": "custom"
}
requests.put(f"http://localhost:8080/v1/jobs/{job['id']}/metadata", json=metadata)

# Control audio
requests.post(f"http://localhost:8080/v1/jobs/{job['id']}/mute")
time.sleep(5)  # Wait a bit
requests.post(f"http://localhost:8080/v1/jobs/{job['id']}/unmute")

# Connect to WebSocket for updates
def on_message(ws, message):
    data = json.loads(message)
    print(f"Update: {data}")

ws = websocket.WebSocketApp("ws://localhost:8080/ui", on_message=on_message)
ws.run_forever()
```

## Best Practices

### Job Submission
- Use idempotency keys for safe retries
- Choose appropriate restart policies
- Validate job configurations before submission

### Stream Metadata Management
- Update metadata regularly during streaming for accurate viewer counts
- Use platform-specific metadata fields (YouTube, Twitch, etc.)
- Store stream URLs for easy access and monitoring
- Keep metadata synchronized with external platform APIs

### Audio Control
- Use mute/unmute commands for real-time audio control
- Handle agent unavailability gracefully (commands will fail if agent is offline)
- Track mute state in stream metadata for UI consistency

### Agent Management
- Monitor agent health via heartbeat
- Use drain mode for graceful agent shutdown
- Handle agent offline scenarios gracefully

### Error Handling
- Implement retry logic for transient failures
- Monitor job status changes
- Handle WebSocket reconnection scenarios

## Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Testing
```bash
npm test
```

## License

MIT License - see LICENSE file for details.
