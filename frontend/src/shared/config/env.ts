import { z } from "zod";

const configSchema = z.object({
  NEXT_PUBLIC_API_ENDPOINT: z.string(),
  NEXT_PUBLIC_URL: z.string(),
  NEXT_PUBLIC_SOCKET_ENDPOINT: z.string(),
});

const configProject = configSchema.safeParse({
  NEXT_PUBLIC_API_ENDPOINT: process.env.NEXT_PUBLIC_API_ENDPOINT,
  NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
  NEXT_PUBLIC_SOCKET_ENDPOINT: process.env.NEXT_PUBLIC_SOCKET_ENDPOINT,
});

if (!configProject.success) {
  console.error(configProject.error.issues);
  throw new Error("cac khai bao bien moi truong khong hop le");
}

const envConfig = configProject.data;

export default envConfig;
