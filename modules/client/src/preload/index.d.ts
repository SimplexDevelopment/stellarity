import { ElectronAPI } from '@electron-toolkit/preload';

interface WindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
}

interface AudioAPI {
  getDevices: () => Promise<any[]>;
}

interface API {
  window: WindowAPI;
  platform: NodeJS.Platform;
  audio: AudioAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: API;
  }
}
