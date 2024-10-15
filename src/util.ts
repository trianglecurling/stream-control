import crypto from "node:crypto";
import os from "node:os";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const srcRoot = __dirname;

// Function to check if the OS is Windows
export function isWindows() {
	return os.platform() === "win32";
}

// Function to check if the app is running with administrator privileges
export async function isAdmin() {
	try {
		// Try accessing a restricted folder (System32) to check if the process has admin rights
		await fs.access("C:\\Windows\\System32", fs.constants.R_OK);
		return true;
	} catch (err) {
		return false; // Not running as an administrator
	}
}

export function isDebugMode() {
	return (process.env.DEBUG_MODE ?? "false").toLowerCase() === "true";
}

export function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Replaces all environment variables with their actual value.
 * Keeps intact non-environment variables using '%'
 * @param  {string} filePath The input file path with percents
 * @return {string}          The resolved file path
 */
export function resolveWindowsEnvironmentVariables(filePath: string) {
	if (!filePath || typeof filePath !== "string") {
		return "";
	}

	/**
	 * @param  {string} withPercents    '%USERNAME%'
	 * @param  {string} withoutPercents 'USERNAME'
	 * @return {string}
	 */
	function replaceEnvironmentVariable(
		withPercents: string,
		withoutPercents: string
	) {
		let found = process.env[withoutPercents];
		// 'C:\Users\%USERNAME%\Desktop\%asdf%' => 'C:\Users\bob\Desktop\%asdf%'
		return found || withPercents;
	}

	// 'C:\Users\%USERNAME%\Desktop\%PROCESSOR_ARCHITECTURE%' => 'C:\Users\bob\Desktop\AMD64'
	filePath = filePath.replace(/%([^%]+)%/g, replaceEnvironmentVariable);

	return filePath;
}

export function createObsWsPassword() {
	const length = 16;
	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	const charactersLength = characters.length;
	let result = "";

	const randomBytes = crypto.randomBytes(length);
	for (let i = 0; i < length; i++) {
		result += characters[randomBytes[i] % charactersLength];
	}

	return result;
}

export function defer<T>() {
	let resolve: (param: T | PromiseLike<T>) => void = () => undefined;
	let reject: (reason?: any) => void = () => undefined;
	const promise = new Promise<T>((resolver, rejecter) => {
		resolve = resolver;
		reject = rejecter;
	});

	return { resolve, reject, promise };
}

const execAsync = promisify(exec);

export async function countProcessInstances(
	executable: string
): Promise<number> {
	try {
		const exeName = executable.split("\\").at(-1) ?? "obs64.exe";
		const { stdout } = await execAsync(`tasklist`, { windowsHide: true });
		const processList = stdout.split("\n");
		const count = processList.filter((line) =>
			line.toLowerCase().includes(exeName.toLowerCase())
		).length;
		return count;
	} catch (error) {
		throw new Error(`Error executing tasklist: ${error}`);
	}
}

export async function findFileAbove(
	fileName: string | null | undefined,
	startDir = srcRoot
): Promise<string | undefined> {
	if (!fileName) {
		return undefined;
	}
	let currentDir = startDir;

	while (currentDir !== path.parse(currentDir).root) {
		const envPath = path.join(currentDir, fileName);
		try {
			await fs.access(envPath);
			return envPath;
		} catch {
			currentDir = path.resolve(currentDir, "..");
		}
	}

	return undefined;
}

export async function canRead(
	filePath: string | undefined | null
): Promise<boolean> {
	if (!filePath) {
		return false;
	}
	try {
		await fs.access(filePath, fs.constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

export async function parseScenes(
	scenesPath: string | null | undefined
): Promise<Map<string, string>> {
	if (!scenesPath || !(await canRead(scenesPath))) {
		console.error("Invalid format of SCENES.txt.");
		process.exit(1);
	}
	const fileContent = await fs.readFile(scenesPath, "utf-8");
	const lines = fileContent.split(/\r?\n/);
	const cleanLines = lines.map((l) => l.split("#")[0].trim());

	const result = new Map<string, string>();
	let currentName: string | undefined = undefined;
	for (let i = 0; i < cleanLines.length; ++i) {
		const line = cleanLines[i];
		if (!line) {
			continue;
		}
		if (currentName === undefined) {
			currentName = line;
		} else {
			result.set(currentName, line);
			currentName = undefined;
		}
	}
	if (currentName !== undefined) {
		console.error("Invalid format of SCENES.txt.");
		process.exit(1);
	}
	return result;
}
