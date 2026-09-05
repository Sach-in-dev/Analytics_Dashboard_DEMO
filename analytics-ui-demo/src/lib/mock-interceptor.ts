/**
 * Mock Interceptor — intercepts all axios requests and returns dummy data.
 *
 * Works with both:
 *  - `api` instance (baseURL="/api") → request URLs like "/orders", "/growth"
 *  - direct `axios` calls → request URLs like "/api/orders", "/api/growth"
 *
 * Matches the URL against the mock registry and returns { success, data, meta }.
 */

import { AxiosInstance } from "axios";
import { getMockResponse } from "@/data/mock-responses";

export function installMockInterceptor(instance: AxiosInstance) {
  instance.interceptors.request.use((config) => {
    // Mark the request so the response interceptor knows to return mock data
    (config as any).__mock = true;
    return config;
  });

  instance.interceptors.response.use(
    // If a real response somehow comes back, pass it through
    (response) => response,
    // On network errors (no backend running), return mock data
    (error) => {
      const config = error?.config;
      if (!config) return Promise.reject(error);

      // Normalise the URL: strip leading "/api" if present
      let url = config.url || "";
      if (url.startsWith("/api")) {
        url = url.slice(4); // "/api/orders" → "/orders"
      }
      // Strip trailing slashes
      url = url.replace(/\/+$/, "") || "/";

      const params = config.params || {};

      const mock = getMockResponse(url, params);
      if (mock) {
        // Build a fake AxiosResponse
        return Promise.resolve({
          data: mock,
          status: 200,
          statusText: "OK",
          headers: {},
          config,
        });
      }

      // Unknown endpoint — return an empty success so the page doesn't crash
      console.warn(`[MockInterceptor] No mock for ${url}`, params);
      return Promise.resolve({
        data: { success: true, data: [], meta: {}, message: "Mock fallback" },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });
    }
  );
}
