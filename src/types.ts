import { OBSRequestTypes } from "obs-websocket-js";

export interface YouTubeSearchListResponse {
	kind: string;
	etag: string;
	regionCode: string;
	pageInfo: PageInfo;
	items: SearchResult[];
}

export interface PageInfo {
	totalResults: number;
	resultsPerPage: number;
}

export interface SearchResult {
	kind: string;
	etag: string;
	id: ResourceId;
	snippet: Snippet;
}

export interface ResourceId {
	kind: string;
	videoId?: string;
	channelId?: string;
	playlistId?: string;
}

export interface Snippet {
	publishedAt: string;
	channelId: string;
	title: string;
	description: string;
	thumbnails: Thumbnails;
	channelTitle: string;
	liveBroadcastContent: string;
	publishTime: string;
}

export interface Thumbnails {
	default?: Thumbnail;
	medium?: Thumbnail;
	high?: Thumbnail;
	standard?: Thumbnail;
	maxres?: Thumbnail;
}

export interface Thumbnail {
	url: string;
	width?: number;
	height?: number;
}

export interface SkipNamesData {
	a: SheetInfoText;
	b: SheetInfoText;
	c: SheetInfoText;
	d: SheetInfoText;
}

export interface StreamNamesData extends SkipNamesData {
	colors: "rock" | "other";
}

export interface SheetInfoText {
	yellow: SheetTeamInfoText;
	red: SheetTeamInfoText;
}

export interface SheetTeamInfoText {
	name: string;
	size: number;
}

export interface DisplayedTextData {
	all: string;
	aur: string;
	bll: string;
	bur: string;
	cll: string;
	cur: string;
	dll: string;
	dur: string;
}

export type OBSSceneName =
	| "IceShedVibes"
	| "SheetA"
	| "SheetB"
	| "SheetC"
	| "SheetD"
	| "SheetsAB"
	| "SheetsCD"
	| "Megacast";
