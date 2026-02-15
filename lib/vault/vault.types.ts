export type VaultState = {
  unlocked: boolean
  masterKey: CryptoKey | null
  salt: Uint8Array | null
}

export type VaultContextValue = VaultState & {
  unlock: (password: string) => Promise<void>
  lock: () => void
}
