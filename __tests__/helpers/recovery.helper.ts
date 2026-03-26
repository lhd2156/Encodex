type SharedRecoveryMocks = {
  generateRecoveryKey: jest.Mock<string, []>;
  storeRecoveryKey: jest.Mock<Promise<void>, [string, string]>;
  downloadRecoveryKey: jest.Mock<void, [string, string]>;
  isValidRecoveryKey: jest.Mock<boolean, [string]>;
};

const recoveryGlobal = globalThis as typeof globalThis & {
  __encodexRecoveryMocks?: SharedRecoveryMocks;
};

function createRecoveryMocks(): SharedRecoveryMocks {
  return {
    generateRecoveryKey: jest.fn<string, []>(),
    storeRecoveryKey: jest.fn<Promise<void>, [string, string]>(),
    downloadRecoveryKey: jest.fn<void, [string, string]>(),
    isValidRecoveryKey: jest.fn<boolean, [string]>(),
  };
}

const sharedRecoveryMocks = recoveryGlobal.__encodexRecoveryMocks ??= createRecoveryMocks();

export const generateRecoveryKey = sharedRecoveryMocks.generateRecoveryKey;
export const storeRecoveryKey = sharedRecoveryMocks.storeRecoveryKey;
export const downloadRecoveryKey = sharedRecoveryMocks.downloadRecoveryKey;
export const isValidRecoveryKey = sharedRecoveryMocks.isValidRecoveryKey;

export function resetRecoveryMocks(): void {
  generateRecoveryKey.mockReset();
  storeRecoveryKey.mockReset();
  downloadRecoveryKey.mockReset();
  isValidRecoveryKey.mockReset();
}
