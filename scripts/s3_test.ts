import { S3Client, ListBucketsCommand, ListObjectsCommand, PutObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { awsS3, s3 } from "./s3_client";

while (true) {
	const list = await s3.list({
		// prefix: "tiles/world-2025-08-09T20-01-14.231Z/1350",
		maxKeys: 1000,
	});
	console.log("List fetched, items:", list.contents?.length);
	// break

	// await awsS3.send(
	// 	new DeleteObjectsCommand({
	// 		Bucket: process.env.S3_BUCKET_NAME!,
	// 		Delete: {
	// 			Objects: list.contents?.map((obj) => ({ Key: obj.key! })) || [],
	// 		},
	// 	})
	// );
}
