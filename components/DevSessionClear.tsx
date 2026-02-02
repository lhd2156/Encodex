"use client";

import { useEffect } from "react";
import { clearSession } from "@/lib/session";

export default function DevSessionClear() {
  useEffect(() => {
    try {
      // Only clear sessions automatically in development to avoid surprising production users
      if (process.env.NODE_ENV === "development") {
        clearSession();
      }
    } catch (e) {
      // ignore
    }
  }, []);

  return null;
}
