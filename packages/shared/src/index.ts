export type AgentState = "OFFLINE" | "IDLE" | "RESERVED" | "STARTING" | "RUNNING" | "STOPPING" | "ERROR" | "DRAINING";

export type JobStatus =
	| "CREATED"
	| "PENDING"
	| "ASSIGNED"
	| "ACCEPTED"
	| "STARTING"
	| "RUNNING"
	| "STOPPING"
	| "STOPPED"
	| "FAILED"
	| "CANCELED"
	| "UNKNOWN";

export interface AgentInfo {
	id: string;
	name: string;
	version: string;
	state: AgentState;
	currentJobId?: string | null;
	lastSeenAt: string;
	drain: boolean;
	capabilities: { slots: number; maxResolution?: string };
	meta?: Record<string, unknown>;
	error?: { code: string; message: string } | null;
}

export interface StreamMetadata {
	title?: string;
	description?: string;
	viewers?: number;
	publicUrl?: string;
	adminUrl?: string;
	isMuted?: boolean;
	streamId?: string;
	platform?: string; // e.g., "youtube", "twitch", etc.
}

export interface Job {
	id: string;
	templateId?: string | null;
	inlineConfig?: Record<string, unknown> | null;
	status: JobStatus;
	agentId?: string | null;
	createdAt: string;
	updatedAt: string;
	startedAt?: string | null;
	endedAt?: string | null;
	error?: { code: string; message: string; detail?: unknown } | null;
	requestedBy: string;
	idempotencyKey?: string;
	restartPolicy?: "never" | "onFailure";
	streamMetadata?: StreamMetadata;
}

export interface WSMessage<T = unknown> {
	type: string;
	msgId: string;
	correlationId?: string | null;
	ts: string;
	agentId?: string | null;
	payload: T;
}

export const Msg = {
	AgentHello: "agent.hello",
	AgentHeartbeat: "agent.heartbeat",
	AgentAssignAck: "agent.assign.ack",
	AgentJobUpdate: "agent.job.update",
	AgentJobLog: "agent.job.log",
	AgentJobStopped: "agent.job.stopped",
	AgentError: "agent.error",
	AgentJobMute: "agent.job.mute",
	AgentJobUnmute: "agent.job.unmute",

	OrchestratorHelloOk: "orchestrator.hello.ok",
	OrchestratorAssignStart: "orchestrator.assign.start",
	OrchestratorJobStop: "orchestrator.job.stop",
	OrchestratorJobKill: "orchestrator.job.kill",
	OrchestratorJobMute: "orchestrator.job.mute",
	OrchestratorJobUnmute: "orchestrator.job.unmute",

	UIAgentUpdate: "ui.agent.update",
	UIJobUpdate: "ui.job.update",
	UIJobEvent: "ui.job.event",
} as const;