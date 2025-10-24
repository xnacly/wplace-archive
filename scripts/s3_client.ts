// import { S3Client } from "bun";
import { config } from "dotenv";
import { dirname, join } from "path";
import { S3Client as AWSClient } from "@aws-sdk/client-s3";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({
	path: join(__dirname, "..", ".env"),
	quiet: true,
});

// export const s3 = new S3Client({
// 	region: process.env.S3_REGION,
// 	endpoint: process.env.S3_ENDPOINT,
// 	accessKeyId: process.env.S3_ACCESS_KEY_ID,
// 	secretAccessKey: process.env.S3_SECRET_KEY,
// 	bucket: process.env.S3_BUCKET_NAME,
// });

export const awsS3 = new AWSClient({
	region: process.env.S3_REGION,
	endpoint: process.env.S3_ENDPOINT,
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY_ID!,
		secretAccessKey: process.env.S3_SECRET_KEY!,
	},
	forcePathStyle: true,
	expectContinueHeader: false,
	requestHandler: {
		requestTimeout: 1000 * 15,
		httpsAgent: { maxSockets: 1000 },
	},
});
