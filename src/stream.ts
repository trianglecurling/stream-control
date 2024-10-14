import {
	DisplayedTextData,
	OBSSceneName,
	SkipNamesData,
	StreamNamesData,
} from "./types.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { OBSService } from "./obs.js";
import {
	delay,
	defer,
	parseScenes,
	findFileAbove,
	srcRoot,
	isDebugMode,
} from "./util.js";
import { getStreamStatus } from "./youtube.js";

let TEST_MODE = false;

function getWarnTime() {
	return getTestMode()
		? 2000
		: parseInt(process.env.OBS_ABORT_TIME ?? "10000") || 10000;
}

export const allScenes: ReadonlyMap<string, string> = await parseScenes(
	await findFileAbove("SCENES.txt")
);

export function validateScenes(
	scenes: string[],
	invalidScenes: string[] = []
): scenes is OBSSceneName[] {
	const startingLength = invalidScenes.length;
	for (const scene of scenes) {
		if (!allScenes.has(scene as OBSSceneName)) {
			invalidScenes.push(scene);
		}
	}
	return startingLength === invalidScenes.length;
}

export class StreamManager {
	constructor(
		private monitorManagerRoot: string,
		private obsService: OBSService
	) {}

	public async getMonitorNames(): Promise<DisplayedTextData> {
		const displayedTextEndpoint = `${this.monitorManagerRoot}displayedText`;
		console.log(`Fetching ${displayedTextEndpoint}`);
		const result = await fetch(displayedTextEndpoint);
		const displayedText: any = await result.json();
		if (displayedText.data) {
			return displayedText.data;
		}
		return displayedText;
	}

	private static mutex = false;
	public async startStreams(scenes: OBSSceneName[]) {
		// Check that this function is not currently executing.
		if (StreamManager.mutex) {
			return {
				success: false,
				error: "Streams are already in the process of starting.",
				code: 409,
			};
		}

		StreamManager.mutex = true;
		try {
			// Check that we are not currently streaming
			const streamStatus = await this.obsService.getStatus();

			if (
				streamStatus &&
				streamStatus.length > 0 &&
				streamStatus.some((s) => s?.outputActive)
			) {
				return {
					success: false,
					code: 409,
					error:
						"Streaming is currently in progress. Please close all streams before taking this action.",
				};
			}

			const streamData = await this.getStreamNames();
			if (streamData) {
				await this.setStreamNamesFromMonitorData(streamData.colors);
			}
			const obsAutomationExe = await findFileAbove(
				process.env.OBS_AUTOMATION_EXE
			);
			if (!obsAutomationExe) {
				console.error(
					"Could not find OBS automation exe (check env:OBS_AUTOMATION_EXE)."
				);
				process.exit();
			}

			if (isDebugMode()) {
				console.log(`OBS Automation EXE: ${obsAutomationExe}`);
			}

			const startAutomationProcess = spawn(
				obsAutomationExe,
				[
					String(getWarnTime()),
					"123456", // doesn't matter
					"1", // doesn't matter
					"Title", // doesn't matter
					"Description", // doesn't matter
					TEST_MODE ? "1" : "0", // doesn't matter
				],
				{
					detached: false,
					stdio: "ignore",
					cwd: srcRoot,
				}
			);
			const deferred = defer<void>();
			startAutomationProcess.addListener("exit", (ec) => {
				deferred.resolve();
			});

			// Give the warning time to run, then see if the process exited with NZEC.
			await Promise.race([deferred.promise, delay(getWarnTime() + 1000)]);

			if (
				startAutomationProcess.exitCode !== 0 &&
				startAutomationProcess.exitCode != null
			) {
				console.log(
					"Stream automation canceled. EC: " + startAutomationProcess.exitCode
				);
				return {
					success: false,
					code: 409,
					error:
						"Stream automation ended early. It's likely someone canceled it.",
				};
			}

			for (let i = 0; i < scenes.length; ++i) {
				const scene = scenes[i];
				const title = await this.getStreamTitle(scene);
				const description = await this.getStreamDescription(scene);
				const pid = await this.obsService.launch(scene);
				await delay(6000); // allow 3 seconds for OBS to start
				spawn(
					obsAutomationExe,
					[
						"0",
						String(pid), // PID for OBS instance for this scene
						i === scenes.length - 1 ? "1" : "0", // Clean up when done?
						title,
						description,
						TEST_MODE ? "1" : "0",
					],
					{
						detached: false,
						stdio: "ignore",
						cwd: srcRoot,
					}
				);
				await delay(5000); // allow 5 seconds for automation to run
			}
			return { success: true, code: 200 };
		} finally {
			StreamManager.mutex = false;
		}
	}

	public async getStreamNamesFromMonitorData() {
		const monitorNames = await this.getMonitorNames();
		const streamData: SkipNamesData = {
			a: {
				yellow: {
					name: getNamesFromMonitorData("a", "yellow", monitorNames) ?? "",
					size: 56,
				},
				red: {
					name: getNamesFromMonitorData("a", "red", monitorNames) ?? "",
					size: 56,
				},
			},
			b: {
				yellow: {
					name: getNamesFromMonitorData("b", "yellow", monitorNames) ?? "",
					size: 56,
				},
				red: {
					name: getNamesFromMonitorData("b", "red", monitorNames) ?? "",
					size: 56,
				},
			},
			c: {
				yellow: {
					name: getNamesFromMonitorData("c", "yellow", monitorNames) ?? "",
					size: 56,
				},
				red: {
					name: getNamesFromMonitorData("c", "red", monitorNames) ?? "",
					size: 56,
				},
			},
			d: {
				yellow: {
					name: getNamesFromMonitorData("d", "yellow", monitorNames) ?? "",
					size: 56,
				},
				red: {
					name: getNamesFromMonitorData("d", "red", monitorNames) ?? "",
					size: 56,
				},
			},
		};
		return streamData;
	}

	public async setStreamNamesFromMonitorData(colors: "rock" | "other") {
		const data: StreamNamesData = {
			...(await this.getStreamNamesFromMonitorData()),
			colors,
		};
		await this.setStreamNames(data);
	}

	public async getStreamNames() {
		const getNamesEndpoint = `${this.monitorManagerRoot}streamsetup`;
		try {
			const data: StreamNamesData = (await (
				await fetch(getNamesEndpoint, {
					headers: { Accept: "application/json" },
				})
			).json()) as StreamNamesData;
			return data;
		} catch (e) {
			console.log(`Error getting stream names: ${e}`);
		}
	}

	public async setStreamNames(namesData: StreamNamesData) {
		const setNamesEndpoint = `${this.monitorManagerRoot}streamsetup`;
		try {
			await fetch(setNamesEndpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(namesData),
			});
		} catch (e) {
			console.log(`Error setting stream names: ${e}`);
		}
	}

	public async getStreamTitle(scene: OBSSceneName, d = new Date()) {
		const day = d.getDay();
		const h = d.getHours();
		let title = "";
		if (day === 1) {
			if (h >= 17 && h <= 19) {
				title += "I Hate Mondays (Monday early league)";
			} else if (h >= 20 && h <= 22) {
				title += "Monday Late League";
			}
		} else if (day === 2) {
			if (h >= 9 && h <= 11) {
				title += "Tuesday Daytime League";
			}
			if (h >= 17 && h <= 19) {
				title += "Tuesday Evening League (early draw)";
			} else if (h >= 20 && h <= 22) {
				title += "Tuesday Evening League (late draw)";
			}
		} else if (day === 3) {
			if (h >= 9 && h <= 11) {
				title += "Wednesday Daytime League";
			}
			if (h >= 17 && h <= 19) {
				title += "Mad Hatter (Wednesday early league)";
			} else if (h >= 20 && h <= 22) {
				title += "Hump Day (Wednesday late league)";
			}
		} else if (day === 4) {
			if (h >= 17 && h <= 19) {
				title += "Diva League (Thursday early)";
			} else if (h >= 20 && h <= 22) {
				title += "Leaguey McLeagueface (Thursday late)";
			}
		} else if (day === 5) {
			if (h >= 17 && h <= 19) {
				title += "Friday Evening League (early draw)";
			} else if (h >= 20 && h <= 22) {
				title += "Friday Evening League (late draw)";
			}
		} else if (day === 0) {
			if (h >= 7 && h <= 9) {
				title += "Sunday morning league (first draw)";
			} else if (h >= 10 && h <= 12) {
				title += "Sunday morning league (second draw)";
			} else if (h >= 15 && h <= 16) {
				title += "Sunday Doubles League (early)";
			} else if (h >= 17 && h <= 18) {
				title += "Sunday Doubles League (late)";
			} else if (h >= 19 && h <= 21) {
				title += "Sunday Night League";
			}
		}
		if (title === "") {
			title += "Triangle Curling Live Stream";
		}
		if (scene === "IceShedVibes") {
			title += " - Vibe Stream";
		} else if (scene === "Megacast") {
			title += " - All Sheets";
		} else {
			const skipData = await this.getStreamNames();
			if (scene === "SheetsAB") {
				if (
					skipData &&
					skipData.a.red.name &&
					skipData.a.yellow.name &&
					skipData.b.red.name &&
					skipData.b.yellow.name
				) {
					title += ` - ${skipData.a.red.name} v. ${skipData.a.yellow.name} & ${skipData.b.red.name} v. ${skipData.b.yellow.name}`;
				} else {
					title += " - Sheets A & B";
				}
			} else if (scene === "SheetsCD") {
				if (
					skipData &&
					skipData.c.red.name &&
					skipData.c.yellow.name &&
					skipData.d.red.name &&
					skipData.d.yellow.name
				) {
					title += ` - ${skipData.c.red.name} v. ${skipData.c.yellow.name} & ${skipData.d.red.name} v. ${skipData.d.yellow.name}`;
				} else {
					title += " - Sheets C & D";
				}
			} else if (scene === "SheetA") {
				if (skipData && skipData.a.red.name && skipData.a.yellow.name) {
					title += ` - ${skipData.a.red.name} v. ${skipData.a.yellow.name}`;
				} else {
					title += " - Sheet A";
				}
			} else if (scene === "SheetB") {
				if (skipData && skipData.b.red.name && skipData.b.yellow.name) {
					title += ` - ${skipData.b.red.name} v. ${skipData.b.yellow.name}`;
				} else {
					title += " - Sheet B";
				}
			} else if (scene === "SheetC") {
				if (skipData && skipData.c.red.name && skipData.c.yellow.name) {
					title += ` - ${skipData.c.red.name} v. ${skipData.c.yellow.name}`;
				} else {
					title += " - Sheet C";
				}
			} else if (scene === "SheetD") {
				if (skipData && skipData.d.red.name && skipData.d.yellow.name) {
					title += ` - ${skipData.d.red.name} v. ${skipData.d.yellow.name}`;
				} else {
					title += " - Sheet D";
				}
			}
		}
		const [yr, mo, dy] = d.toJSON().split("T")[0].split("-");
		title += ` - ${mo}/${dy}/${yr}`;
		return title;
	}
	public async getStreamDescription(scene: OBSSceneName) {
		return `See our other streams for more sheets and camera angles: ${process.env.YOUTUBE_CHANNEL_URI}/streams.`;
	}
}

function getNamesFromMonitorData(
	sheet: string,
	color: string,
	displayedTextData: DisplayedTextData
) {
	let pos = color === "red" ? "ll" : "ur";
	const id = `${sheet}${pos}` as keyof DisplayedTextData;
	const teamData = displayedTextData[id].split("\n").map((x) => x.trim());

	if (teamData.length > 1 && isAllDashes(teamData[1])) {
		const p1LastName = teamData[2].split(" ");
		p1LastName.shift();
		const p2LastName = teamData[3].split(" ");
		p2LastName.shift();
		return `${p1LastName.join(" ")}/${p2LastName.join(" ")}`;
	} else if (teamData.length === 2) {
		const p1LastName = teamData[0].split(" ");
		p1LastName.shift();
		const p2LastName = teamData[1].split(" ");
		p2LastName.shift();
		return `${p1LastName.join(" ")}/${p2LastName.join(" ")}`;
	} else {
		let topLine = teamData[0];
		if (teamData.length === 5) {
			topLine = teamData[1];
		}
		if (topLine === "WELCOME") {
			topLine = "";
		}
		if (topLine.toLowerCase() === "open sheet") {
			topLine = "";
		}

		if (topLine.includes("(") && topLine.includes(")")) {
			return teamData[1].split(" ").slice(1).join(" ");
		}
		if (topLine.includes(" ")) {
			return topLine.split(" ").pop();
		}
		return topLine;
	}
}

function isAllDashes(line: string) {
	for (const char of line.trim().split("")) {
		if (char !== "=" && char !== "-") {
			return false;
		}
	}
	return true;
}

export function setTestMode(newMode: boolean) {
	TEST_MODE = newMode;
}

export function getTestMode() {
	return TEST_MODE || isDebugMode();
}
