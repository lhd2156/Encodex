"use client"

import { useState } from "react"
import { VaultContext } from "./vault-context"
import type { VaultContextValue } from "./vault.types"
import { deriveMasterKey, getUserSalt, storePasswordHash, verifyPassword } from "../crypto"
import { getSession } from "../session"

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null)
  const [salt, setSalt] = useState<Uint8Array | null>(null)

  async function unlock(password: string) {
    try {
      const session = getSession()
      if (!session) {
        throw new Error('No active session')
      }

      const userSalt = getUserSalt(session.userEmail)

      const isValid = await verifyPassword(session.userEmail, password)
      if (!isValid) {
        throw new Error('Invalid password')
      }

      const key = await deriveMasterKey(password, userSalt as unknown as BufferSource)

      await storePasswordHash(session.userEmail, password)

      setSalt(userSalt)
      setMasterKey(key)
    } catch (error) {
      throw error
    }
  }

  function lock() {
    setMasterKey(null)
    setSalt(null)
  }

  const value: VaultContextValue = {
    unlocked: !!masterKey,
    masterKey,
    salt,
    unlock,
    lock,
  }

  return (
    <VaultContext.Provider value={value}>
      {children}
    </VaultContext.Provider>
  )
}