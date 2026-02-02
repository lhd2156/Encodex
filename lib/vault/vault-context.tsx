"use client"

import { createContext, useContext } from "react"
import type { VaultContextValue } from "./vault.types"

export const VaultContext = createContext<VaultContextValue | null>(null)

export function useVault() {
  const ctx = useContext(VaultContext)
  if (!ctx) {
    throw new Error("useVault must be used inside VaultProvider")
  }
  return ctx
}
