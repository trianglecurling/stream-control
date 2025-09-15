import "dotenv/config";
import { WebSocket } from "ws";
import { hostname } from "os";
import { randomUUID } from "crypto";
import { WSMessage, Msg, JobStatus, AgentState } from "@stream-control/shared";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "ws://localhost:8080/agent";
const AGENT_TOKEN = process.env.AGENT_TOKEN ?? "dev-shared-token";
const AGENT_ID = process.env.AGENT_ID || `agent-${hostname()}-${randomUUID().slice(0, 8)}`;
const AGENT_NAME = process.env.AGENT_NAME || hostname();
const VERSION = "0.1.0";

let ws: WebSocket | null = null;
let state: AgentState = "OFFLINE";
let currentJobId: string | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let heartbeatIntervalMs = 3000;

function connect() {
	console.log(`Agent ${AGENT_NAME} connecting to ${ORCHESTRATOR_URL}...`);
	ws = new WebSocket(ORCHESTRATOR_URL);

	ws.on("open", () => {
		state = "IDLE";
		const hello: WSMessage = {
			type: Msg.AgentHello,
			msgId: randomUUID(),
			ts: new Date().toISOString(),
			agentId: AGENT_ID,
			payload: {
				agentId: AGENT_ID,
				name: AGENT_NAME,
				version: VERSION,
				capabilities: { slots: 1 },
				drain: false,
				activeJob: currentJobId ? { jobId: currentJobId, status: "RUNNING" as JobStatus } : null,
				auth: { token: AGENT_TOKEN },
			},
		};
		ws?.send(JSON.stringify(hello));
	});

	ws.on("message", (raw) => {
		let msg: WSMessage<any>;
		try {
			msg = JSON.parse(String(raw));
		} catch {
			return;
		}

		switch (msg.type) {
			case Msg.OrchestratorHelloOk: {
				const p = msg.payload as {
					heartbeatIntervalMs: number;
					heartbeatTimeoutMs: number;
					stopGraceMs: number;
					killAfterMs: number;
				};
				heartbeatIntervalMs = p.heartbeatIntervalMs;
				startHeartbeat();
				break;
			}
			case Msg.OrchestratorAssignStart: {
				onAssignStart(msg);
				break;
			}
			case Msg.OrchestratorJobStop: {
				onJobStop(msg);
				break;
			}
			case Msg.OrchestratorJobMute: {
				onJobMute(msg);
				break;
			}
			case Msg.OrchestratorJobUnmute: {
				onJobUnmute(msg);
				break;
			}
			default:
				break;
		}
	});

	ws.on("close", () => {
		console.log("Connection closed. Reconnecting in 3s...");
		stopHeartbeat();
		state = "OFFLINE";
		setTimeout(connect, 3000);
	});

	ws.on("error", (err) => {
		console.error("WS error:", err);
	});
}

function send<T = unknown>(type: string, payload: T, correlationId?: string) {
	if (!ws || ws.readyState !== WebSocket.OPEN) return;
	const msg: WSMessage<T> = {
		type,
		msgId: randomUUID(),
		correlationId: correlationId ?? null,
		ts: new Date().toISOString(),
		agentId: AGENT_ID,
		payload,
	};
	ws.send(JSON.stringify(msg));
}

function startHeartbeat() {
	stopHeartbeat();
	heartbeatTimer = setInterval(() => {
		send(Msg.AgentHeartbeat, {
			metrics: {},
		});
	}, heartbeatIntervalMs);
}

function stopHeartbeat() {
	if (heartbeatTimer) clearInterval(heartbeatTimer);
	heartbeatTimer = null;
}

// Simulated runner (replace with real OBS/ffmpeg)
function fakeStartRun(jobId: string, cfg: unknown) {
	console.log(`Starting job ${jobId} with config:`, cfg);
	state = "STARTING";
	setTimeout(() => {
		state = "RUNNING";
		send(Msg.AgentJobUpdate, { jobId, status: "RUNNING" as JobStatus });
	}, 1000);
}

function fakeStop(jobId: string, reason?: string) {
	console.log(`Stopping job ${jobId}. Reason: ${reason ?? "n/a"}`);
	state = "STOPPING";
	setTimeout(() => {
		state = "IDLE";
		currentJobId = null;
		send(Msg.AgentJobStopped, { jobId, status: "STOPPED" as const });
	}, 1500);
}

function onAssignStart(
	msg: WSMessage<{
		jobId: string;
		idempotencyKey: string;
		config: unknown;
		expiresAt: string;
		metadata?: Record<string, unknown>;
	}>
) {
	const { jobId, config } = msg.payload;

	if (state !== "IDLE" || currentJobId) {
		send(Msg.AgentAssignAck, { jobId, accepted: false, reason: "busy" }, msg.msgId);
		return;
	}

	currentJobId = jobId;
	state = "STARTING";
	send(Msg.AgentAssignAck, { jobId, accepted: true }, msg.msgId);

	fakeStartRun(jobId, config);
}

function onJobStop(msg: WSMessage<{ jobId: string; reason?: string; deadlineMs?: number }>) {
	const { jobId, reason } = msg.payload;
	if (!currentJobId || currentJobId !== jobId) return;
	fakeStop(jobId, reason);
}

function onJobMute(msg: WSMessage<{ jobId: string }>) {
	const { jobId } = msg.payload;
	if (!currentJobId || currentJobId !== jobId) return;

	console.log(`Muting audio for job ${jobId}`);
	// TODO: Replace with real mute functionality (e.g., OBS WebSocket, ffmpeg commands)

	// Send acknowledgment back to orchestrator
	send(Msg.AgentJobMute, { jobId, success: true });
}

function onJobUnmute(msg: WSMessage<{ jobId: string }>) {
	const { jobId } = msg.payload;
	if (!currentJobId || currentJobId !== jobId) return;

	console.log(`Unmuting audio for job ${jobId}`);
	// TODO: Replace with real unmute functionality (e.g., OBS WebSocket, ffmpeg commands)

	// Send acknowledgment back to orchestrator
	send(Msg.AgentJobUnmute, { jobId, success: true });
}

connect();
