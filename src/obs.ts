import { OBSRequestTypes, OBSWebSocket } from "obs-websocket-js";
import psList from "ps-list";
import { spawn, exec, ChildProcess } from "node:child_process";
import path from "node:path";
import {
	countProcessInstances,
	createObsWsPassword,
	delay,
	isDebugMode,
	resolveWindowsEnvironmentVariables,
} from "./util.js";

// "Side effect" type declarations happen here.
import "./types.js";
import { OBSSceneName } from "./types.js";

interface ExtendedConnectionData {
	portAssignment: number;
	childProcess?: ChildProcess;
}

function getManualInstancePassword() {
	return process.env.OBS_MANUAL_INSTANCE_PASSWORD;
}

function getManualInstancePort() {
	return parseInt(process.env.OBS_MANUAL_INSTANCE_PORT ?? "4454", 10) || 4454;
}

function getStartingPort() {
	return (
		parseInt(process.env.OBS_CONNECTION_STARTING_PORT ?? "4455", 10) || 4455
	);
}

function getObsStartTime() {
	return parseInt(process.env.OBS_START_TIME ?? "5000", 10) || 5000;
}

function getObsExeName() {
	return process.env.OBS_EXE_NAME || "obs64.exe";
}

function getObsExePath() {
	return (
		process.env.OBS_EXE_PATH || "C:\\Program Files\\obs-studio\\bin\\64bit"
	);
}

function getPsexecPath() {
	return process.env.PSEXEC_PATH;
}

function getDefaultObsExePath() {
	return path.join(getObsExePath(), getObsExeName());
}

export class OBSService {
	private inUsePorts = new Set<number>();
	private extendedConnectionData = new WeakMap<
		OBSWebSocket,
		ExtendedConnectionData
	>();
	private obsConnections: Set<OBSWebSocket> = new Set();
	#pw: string;
	private async wsConnect(
		port: number,
		childProcess?: ChildProcess,
		password = this.#pw
	): Promise<OBSWebSocket | undefined> {
		const obs = new OBSWebSocket();
		try {
			await obs.connect(`ws://127.0.0.1:${port}`, password);
		} catch {
			return undefined;
		}
		console.log("OBS WebSocket connected!");
		this.inUsePorts.add(port);
		this.obsConnections.add(obs);
		this.extendedConnectionData.set(obs, {
			childProcess,
			portAssignment: port,
		});
		obs.addListener("ConnectionClosed", () => {
			this.inUsePorts.delete(port);
			this.obsConnections.delete(obs);
			console.log("OBS closed and resources freed.");
		});
		return obs;
	}

	private getNextPort() {
		let nextPort = getStartingPort();
		while (true) {
			if (this.inUsePorts.has(nextPort)) {
				nextPort++;
			} else {
				break;
			}
		}
		return nextPort;
	}

	constructor(password: string = createObsWsPassword()) {
		this.#pw = password;
	}

	// Temporally cache instance count for 1 second so successive calls in the same request don't get slow.
	private static obsInstanceCountCache = -1;
	public static async countObsInstances(exePath = getDefaultObsExePath()) {
		if (this.obsInstanceCountCache === -1) {
			this.obsInstanceCountCache = await countProcessInstances(exePath);
			setTimeout(() => {
				OBSService.obsInstanceCountCache = -1;
			}, 1000);
		}
		return this.obsInstanceCountCache;
	}

	public async obsCall<T extends keyof OBSRequestTypes>(
		connection: OBSWebSocket,
		message: T
	) {
		try {
			const result = await connection.call<T>(message);
			return result;
		} catch (e) {
			this.obsConnections.delete(connection);
		}
	}

	public async getStatus() {
		await this.tryConnectManualOBS();
		return Promise.all(
			[...this.obsConnections].map((c) => this.obsCall(c, "GetStreamStatus"))
		);
	}

	public getConnection(pid: number) {
		for (const conn of this.obsConnections) {
			const childProcess = this.extendedConnectionData.get(conn)?.childProcess;
			if (childProcess?.pid === pid) {
				return conn;
			}
		}
		return undefined;
	}

	/**
	 * Launch OBS and connect to the websocket server.
	 * @param obsPath
	 */
	public async launch(
		scene: OBSSceneName = "IceShedVibes",
		obsPath = getDefaultObsExePath()
	) {
		const port = this.getNextPort();
		const resolvedObsPath = resolveWindowsEnvironmentVariables(obsPath);

		// The below commented code was an attempt at using PsExec to launch under
		// a different user account, but I never could get it working.

		// const password = this.#pw;

		// const obsCommand = `"${resolvedObsPath}" --websocket_port=${port} --websocket_password=${password} --collection Automated --scene ${scene} --multi --disable-shutdown-check --disable-updater`;

		// if (isDebugMode()) {
		// 	console.log("Running the following OBS command:");
		// 	console.log(obsCommand);
		// }

		// console.log("Starting obs using psexec with scene " + scene);

		// // Use runas to execute the command as the interactive user
		// const obsProcess = exec(
		// 	`${getPsexecPath()} -accepteula -nobanner -i -d -u ${
		// 		process.env.INTERACTIVE_USER_ID
		// 	} -p ${
		// 		process.env.INTERACTIVE_USER_PASSWORD
		// 	} -w "${getObsExePath()}" ${obsCommand}`,
		// 	{ cwd: path.dirname(resolvedObsPath) },
		// 	(error, stdout, stderr) => {
		// 		if (error) {
		// 			console.error(`Error: ${error.message}`);
		// 			console.log(error);
		// 			return;
		// 		}
		// 		if (stderr) {
		// 			console.error(`Stderr: ${stderr}`);
		// 			return;
		// 		}
		// 		console.log(`Output: ${stdout}`);
		// 	}
		// );

		const obsProcess = spawn(
			resolvedObsPath,
			[
				`--websocket_port=${port}`,
				`--websocket_password=${this.#pw}`,
				`--collection`,
				`Automated`,
				`--scene`,
				`${scene}`,
				"--multi", // don't warn when launching multiple instances
				"--disable-shutdown-check",
				"--disable-updater",
			],
			{
				detached: false,
				stdio: "ignore",
				cwd: path.dirname(resolvedObsPath),
			}
		);

		// Ensure the parent doesn't wait for the child process to exit
		obsProcess.unref();

		// Store the PID
		console.log(`OBS launched with PID: ${obsProcess.pid}`);

		// Wait for OBS to launch
		await delay(getObsStartTime());

		// Connect to web socket
		const connection = await this.wsConnect(port, obsProcess);
		return obsProcess.pid;
	}

	public async tryConnectManualOBS() {
		if (!this.inUsePorts.has(getManualInstancePort())) {
			if ((await OBSService.countObsInstances()) > 0) {
				await this.wsConnect(
					getManualInstancePort(),
					undefined,
					getManualInstancePassword()
				);
			}
		}
	}

	/**
	 * Send a message to Advanced Scene Switcher on the given instance
	 * of OBS. If no connection is passed, send the same message to all
	 * of them.
	 * @param message
	 * @param connection
	 */
	public async assCall(
		message: string,
		connection: OBSWebSocket | undefined = undefined
	) {
		if (!connection) {
			for (const connection of this.obsConnections) {
				await this.assCall(message, connection);
			}
		} else {
			try {
				await connection.call("CallVendorRequest", {
					vendorName: "AdvancedSceneSwitcher",
					requestType: "AdvancedSceneSwitcherMessage",
					requestData: { message },
				});
			} catch (e) {
				console.log(
					`Error sending WS message to Advanced Scene Switcher. Message: ${message}. Error: ${e}`
				);
			}
		}
	}

	/**
	 * Shut down the given instance of OBS, or all of them if no connection is passed.
	 * @param connection
	 */
	public async shutdown(connection: OBSWebSocket | undefined = undefined) {
		if (!connection) {
			console.log("Shutting down all managed OBS instances.");
			await Promise.all([...this.obsConnections].map((c) => this.shutdown(c)));
		} else {
			const obsProcess =
				this.extendedConnectionData.get(connection)?.childProcess;

			console.log(
				"Shutting down managed OBS instance " + (obsProcess?.pid ?? "")
			);
			await this.assCall("graceful-shutdown", connection);

			// Wait 12 seconds for shutdown
			await delay(12000);

			// Check if actually shutdown, and if not, force it to exit.
			if (obsProcess) {
				if (obsProcess.connected && obsProcess.pid) {
					console.log(
						"Websockets graceful-exit did not work, killing manually."
					);
					await this.kill(obsProcess.pid);
				}
			}
		}
	}

	/**
	 * Force-close OBS by a given pid. Start by sending SIGTERM and wait a couple seconds.
	 * If it's still running, send SIGKILL, which may cause a prompt at next
	 * launch indicating that OBS was not gracefully shut down.
	 *
	 * If you do not pass a pid, we will close all OBS processes!
	 *
	 * If possible, use shutdown() instead of kill().
	 */
	public async kill(pid?: number) {
		if (!pid) {
			console.log("Shutting down ALL OBS instances.");
			for (const pd of (await OBSService.getObsProcesses()) ?? []) {
				await this.kill(pd.pid);
			}
			// After we kill all OBS processes, we should have no more connection handles
			// Just to make sure, let's empty them.
			this.obsConnections.clear();
			this.inUsePorts.clear();
		} else {
			console.log("Shutting down OBS instance " + pid);
			process.kill(pid, "SIGTERM");
			await delay(2000);
			if (OBSService.isProcessRunning(pid)) {
				process.kill(pid, "SIGKILL");
				console.log(`OBS process forcefully terminated (pid ${pid}).`);
				await delay(2000);
			}

			// If we were tracking this connection, delete it
			const connection = [...this.obsConnections].find(
				(c) => this.extendedConnectionData.get(c)?.childProcess?.pid === pid
			);
			if (connection) {
				try {
					await connection.disconnect();
				} catch {}
				this.obsConnections.delete(connection);
				// associated extendedConnectionData will be garbage collected
			}
		}
	}

	private static async getObsProcesses() {
		try {
			const processes = await psList();
			const obsProcesses = processes.filter(
				(proc) => proc.name === "obs64.exe"
			);
			return obsProcesses;
		} catch (err: any) {
			console.error(`Error getting OBS processes: ${err.message}`);
		}
	}

	private static isProcessRunning(pid: number) {
		try {
			process.kill(pid, 0); // Check if the process exists and if we can send signals to it
			return true; // Process is running
		} catch (err: any) {
			if (err.code === "ESRCH") {
				return false; // Process does not exist
			} else if (err.code === "EPERM") {
				console.error("No permission to interact with the process");
				return true; // Process exists, but you don’t have permission to interact with it
			} else {
				console.error(`Error checking process: ${err.message}`);
				return false;
			}
		}
	}
}
