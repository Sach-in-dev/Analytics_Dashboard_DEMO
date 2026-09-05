import axios from "axios";
import { installMockInterceptor } from "@/lib/mock-interceptor";

export const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Install mock interceptor on the custom api instance (used by modules
// that import { api } from "@/lib/axios") and on the global axios default
// (used by modules that import axios directly with full /api/... paths).
installMockInterceptor(api);
installMockInterceptor(axios);
