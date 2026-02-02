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
      // Get current user's email from session
      const session = getSession()
      if (!session) {
        throw new Error('No active session')
      }

      // Get or create persistent salt for this user
      const userSalt = getUserSalt(session.userEmail)
      console.log('🔑 Using salt for user:', session.userEmail)

      // Verify password if hash exists
      const isValid = await verifyPassword(session.userEmail, password)
      if (!isValid) {
        throw new Error('Invalid password')
      }

      // Derive master key from password and salt
      const key = await deriveMasterKey(password, userSalt as unknown as BufferSource)

      // Store password hash if not already stored
      await storePasswordHash(session.userEmail, password)

      setSalt(userSalt)
      setMasterKey(key)
      
      console.log('✅ Vault unlocked successfully')
    } catch (error) {
      console.error('❌ Failed to unlock vault:', error)
      throw error
    }
  }

  function lock() {
    setMasterKey(null)
    setSalt(null)
    console.log('🔒 Vault locked')
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