import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploaded documents are sent as base64 through the API route, so allow a
  // generous body size for Server Actions / route handlers.
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
