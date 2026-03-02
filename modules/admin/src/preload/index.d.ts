import { ElectronAPI } from '@electron-toolkit/preload';

interface WindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
}

interface API {
  window: WindowAPI;
  platform: NodeJS.Platform;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: API;
  }
}
