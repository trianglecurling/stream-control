import path from "node:path";
import { fileURLToPath } from "node:url";
import Koa, { Context, Next } from "koa";
import Router from "@koa/router";
import send from "koa-send";
import DotEnvX from "@dotenvx/dotenvx";
import { getStreamStatus } from "./youtube.js";
import { OBSService } from "./obs.js";
import {
	allScenes,
	setTestMode,
	StreamManager,
	getTestMode,
	validateScenes,
} from "./stream.js";
import { isAdmin, isWindows, findFileAbove, srcRoot, isDebugMode, getBonspielName } from "./util.js";

const envPath = await findFileAbove(".env.local");

if (envPath) {
	DotEnvX.config({ path: envPath });
	if (isDebugMode()) {
		console.dir(process.env);
	}
} else {
	console.log(
		"No env file found. Create a .env.local file in the project root. See README.md for details."
	);
	process.exit(1);
}

if (!isWindows()) {
	console.error("This service only supports running on Windows.");
	process.exit(1);
}

if (!(await isAdmin())) {
	console.error("This service must run as administrator.");
	process.exit(1);
}

async function acceptJsonMiddleware(ctx: Context, next: Next) {
	const acceptHeader = ctx.request.headers.accept;
	const allowDefaultAcceptCookie = ctx.cookies.get("ALLOW_DEFAULT_ACCEPT");

	if (!allowDefaultAcceptCookie && acceptHeader !== "application/json") {
		ctx.status = 406;
		ctx.body = {
			message: "Accept header must be set to application/json",
		};
	} else {
		await next();
	}
}

async function jsonContentTypeMiddleware(ctx: Context, next: Next) {
	await next();

	// Do not set Content-Type for responses with no content
	if (
		!ctx.response.headers["content-type"] &&
		![204, 304].includes(ctx.status)
	) {
		ctx.type = "application/json";
	}
}

async function init() {
	const router = new Router();
	const obs = new OBSService();
	const streamManager = new StreamManager("http://127.0.0.1:3000/", obs);
	router.get("/", async (ctx) => {
		await send(ctx, "src/docs.html");
	});

	router.get("/status/youtube", async (ctx) => {
		try {
			const status = await getStreamStatus();
			ctx.response.status = 200; // Make sure to set status code
			ctx.response.body = JSON.stringify(status, null, 4);
		} catch (err) {
			console.error(err);
			ctx.response.status = 500;
			ctx.response.body = { error: err };
		}
	});

	router.get("/status/obs", async (ctx) => {
		try {
			const status = await obs.getStatus();
			ctx.response.status = 200; // Make sure to set status code
			ctx.response.body = JSON.stringify(
				{
					runningObsProcesses: await OBSService.countObsInstances(),
					obsReportedStatuses: status,
				},
				null,
				4
			);
		} catch (err) {
			console.error(err);
			ctx.response.status = 500;
			ctx.response.body = { error: err };
		}
	});

	router.get("/names/current", async (ctx) => {
		ctx.response.status = 200;
		ctx.response.body = JSON.stringify(
			await streamManager.getMonitorNames(),
			null,
			4
		);
	});

	router.get("/names/syncMonitorNamesToStream", async (ctx) => {
		const colors = ctx.query.colors === "rock" ? "rock" : "other";
		await streamManager.setStreamNamesFromMonitorData(colors);
		ctx.response.status = 200;
		ctx.response.body = JSON.stringify({ success: true }, null, 4);
	});

	router.get("/bonspiel", async (ctx) => {
		const bonspielName = getBonspielName();
		if (bonspielName) {
			ctx.response.status = 200;
			ctx.response.body = JSON.stringify(bonspielName || "false");
		}
	});

	router.get("/stream/title", async (ctx) => {
		const scene = [
			typeof ctx.query.scene === "string"
				? ctx.query.scene
				: ctx.query.scene?.[0] ?? "",
		];
		if (validateScenes(scene)) {
			const title = await streamManager.getStreamTitle(scene[0]); // test date: new Date(2024, 8, 30, 18)
			ctx.response.status = 200;
			ctx.response.body = title;
		} else if (!scene) {
			ctx.response.status = 400;
			ctx.response.body = JSON.stringify({
				success: false,
				error: `No scene specified. Please specify scene name to get its title.`,
			});
		} else {
			ctx.response.status = 400;
			ctx.response.body = JSON.stringify({
				success: false,
				error: `Scene name ${scene[0]} not valid. Supported scenes are: ${[
					...allScenes.keys(),
				]
					.map((s) => `"${s}"`)
					.join(", ")}`,
			});
		}
	});

	router.get("/stream/description", async (ctx) => {
		const scene = [
			typeof ctx.query.scene === "string"
				? ctx.query.scene
				: ctx.query.scene?.[0] ?? "",
		];
		if (validateScenes(scene)) {
			const title = await streamManager.getStreamDescription(scene[0]); // test date: new Date(2024, 8, 30, 18)
			ctx.response.status = 200;
			ctx.response.body = title;
		} else if (!scene) {
			ctx.response.status = 400;
			ctx.response.body = JSON.stringify({
				success: false,
				error: `No scene specified. Please specify scene name to get its title.`,
			});
		} else {
			ctx.response.status = 400;
			ctx.response.body = JSON.stringify({
				success: false,
				error: `Scene name ${scene[0]} not valid. Supported scenes are: ${[
					...allScenes.keys(),
				]
					.map((s) => `"${s}"`)
					.join(", ")}`,
			});
		}
	});

	router.get("/obs/launch", async (ctx) => {
		const scene = [
			typeof ctx.query.scene === "string"
				? ctx.query.scene
				: ctx.query.scene?.[0] ?? "",
		];
		if (!scene[0]) {
			scene[0] = "IceShedVibes";
		}
		if (validateScenes(scene)) {
			const pid = await obs.launch();
			ctx.response.status = 200;
			ctx.response.body = JSON.stringify({ success: true, pid }, null, 4);
		} else {
			ctx.response.status = 400;
			ctx.response.body = JSON.stringify({
				success: false,
				error: `Scene name ${scene[0]} not valid. Supported scenes are: ${[
					...allScenes.keys(),
				]
					.map((s) => `"${s}"`)
					.join(", ")}`,
			});
		}
	});

	router.get("/obs/close", async (ctx) => {
		const all = "all" in ctx.query;
		const pidStr = ctx.query.pid;
		if (!pidStr) {
			await obs.shutdown();
			if (all) {
				await obs.kill();
			}
		} else {
			const pid = parseInt(typeof pidStr === "string" ? pidStr : pidStr[0], 10);
			const connection = obs.getConnection(pid);
			if (connection) {
				obs.shutdown(connection);
			} else {
				obs.kill(pid);
			}
		}
		ctx.response.status = 200;
		ctx.response.body = JSON.stringify({ success: true }, null, 4);
	});

	router.get("/stream/scenes", (ctx) => {
		ctx.response.status = 200;
		ctx.response.body = JSON.stringify(Object.fromEntries(allScenes));
	});

	router.get("/stream/start", async (ctx) => {
		const scenes =
			typeof ctx.query.scenes === "string"
				? ctx.query.scenes.split(",")
				: ctx.query.scenes ?? [];
		const drawNumber = typeof ctx.query.drawNumber === "string" ? ctx.query.drawNumber : "";
		const invalidScenes: string[] = [];
		if (!validateScenes(scenes, invalidScenes)) {
			ctx.response.status = 400;
			ctx.response.body = JSON.stringify({
				success: false,
				error: `Scene name(s) ${invalidScenes.join(
					","
				)} not valid. Supported scenes are: ${[...allScenes.keys()]
					.map((s) => `"${s}"`)
					.join(", ")}`,
			});
		} else if (scenes.length === 0) {
			ctx.response.status = 400;
			ctx.response.body = JSON.stringify({
				success: false,
				error: `No scenes specified. Please specify scenes to start streaming using the 'scenes' query parameter with comma-separated scene names.`,
			});
		} else {
			const result = await streamManager.startStreams(scenes, drawNumber);
			if (result.success) {
				ctx.response.status = 200;
				ctx.response.body = JSON.stringify({ success: true }, null, 4);
			} else {
				ctx.response.status = result.code;
				ctx.response.body = JSON.stringify({
					success: false,
					error: result.error,
				});
			}
		}
	});

	router.get("/stream/stopAll", async (ctx) => {
		await obs.tryConnectManualOBS();
		await obs.assCall("stop-streaming");
		ctx.response.status = 200;
		ctx.response.body = JSON.stringify({ success: true }, null, 4);
	});

	router.get("/stream/closeAll", async (ctx) => {
		await obs.tryConnectManualOBS();
		obs.shutdown();
		ctx.response.status = 200;
		ctx.response.body = JSON.stringify({ success: true }, null, 4);
	});

	router.get("/testMode", (ctx) => {
		ctx.response.status = 200;
		ctx.response.body = JSON.stringify({ testMode: getTestMode() });
	});
	router.post("/testMode", (ctx) => {
		const value =
			ctx.query.testMode === "false" || ctx.query.testMode === "0"
				? false
				: true;
		setTestMode(value);
		ctx.response.status = 204;
	});

	const app = new Koa();
	app.use(acceptJsonMiddleware);
	app.use(jsonContentTypeMiddleware);
	app.use(router.routes());
	app.use(router.allowedMethods());
	app.listen({ port: parseInt(process.env.PORT || "3000") });
}

init();
