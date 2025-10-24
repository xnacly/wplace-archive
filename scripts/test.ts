import axios from "axios";

const response = await axios<ReadableStream>(
	"https://github.com/samuelscheit/wplace-archive/releases/download/world-2025-10-18T07-23-59.887Z/tiles.tar.gz.part.000",
	{
		onDownloadProgress(progressEvent) {
			const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total!);
			console.log(
				`Download progress: ${percentCompleted}% | ${Math.floor(progressEvent.loaded / 1024 / 1024)} MB of ${Math.floor(progressEvent.total! / 1024 / 1024)} MB`
			);
		},
		responseType: "stream",
	}
);

const stream = response.data;

for await (const chunk of stream) {
	// console.log(`Received ${chunk.length} bytes`);

	await new Promise((resolve) => setTimeout(resolve, 100));
}
