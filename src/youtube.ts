import { YouTubeSearchListResponse } from "./types.js";

const youtubeApiKey = process.env.YOUTUBE_API_KEY;
const channelId = process.env.YOUTUBE_CHANNEL_ID;

export async function getStreamStatus() {
	const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${youtubeApiKey}`;
	const response = await fetch(url);
	const data = (await response.json()) as YouTubeSearchListResponse;

	if (response.status > 300) {
		console.log("Error getting YouTube status.");
		throw new Error(data as any);
	} else {
		if (data.items && data.items.length > 0) {
			console.log(
				`The channel is live streaming! There are ${data.items.length} active streams.`
			);
		} else {
			console.log("The channel is not live streaming.");
		}
		return data;
	}

}

// Example response
/*
{
    "kind": "youtube#searchListResponse",
    "etag": "DvSk1dkTfChL_BEMf3l8PN7rDZ0",
    "regionCode": "US",
    "pageInfo": {
        "totalResults": 1,
        "resultsPerPage": 1
    },
    "items": [
        {
            "kind": "youtube#searchResult",
            "etag": "8cOAPtA-HKrBgEzeN7i89ME_mjY",
            "id": {
                "kind": "youtube#video",
                "videoId": "WaSGBciNFh0"
            },
            "snippet": {
                "publishedAt": "2024-09-25T22:37:11Z",
                "channelId": "UCUNFGkSgO5LOZl6myFbOaPw",
                "title": "Mad Hatters (Wed Early) - 9/25/2024",
                "description": "",
                "thumbnails": {
                    "default": {
                        "url": "https://i.ytimg.com/vi/WaSGBciNFh0/default_live.jpg",
                        "width": 120,
                        "height": 90
                    },
                    "medium": {
                        "url": "https://i.ytimg.com/vi/WaSGBciNFh0/mqdefault_live.jpg",
                        "width": 320,
                        "height": 180
                    },
                    "high": {
                        "url": "https://i.ytimg.com/vi/WaSGBciNFh0/hqdefault_live.jpg",
                        "width": 480,
                        "height": 360
                    }
                },
                "channelTitle": "TriangleCurling",
                "liveBroadcastContent": "live",
                "publishTime": "2024-09-25T22:37:11Z"
            }
        }
    ]
}
	*/
