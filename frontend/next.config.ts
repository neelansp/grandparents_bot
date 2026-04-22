import type { NextConfig } from "next";


// In Docker we set NEXT_PUBLIC_API_URL=/api so the browser never hits the
// backend directly — Next.js proxies `/api/*` to the backend container, which
// stays private on the Docker network.
const nextConfig: NextConfig = {
  async rewrites() {
    const publicApiUrl = process.env.NEXT_PUBLIC_API_URL;
    const backendInternalUrl = process.env.BACKEND_INTERNAL_URL;

    if (publicApiUrl !== "/api" || !backendInternalUrl) {
      return [];
    }

    return [
      {
        source: "/api/:path*",
        destination: `${backendInternalUrl}/:path*`,
      },
    ];
  },
};


export default nextConfig;
