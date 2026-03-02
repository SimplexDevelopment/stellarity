import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settingsStore';

export const useTheme = () => {
  const theme = useSettingsStore((state) => state.theme);
  
  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
    
    // Also store in localStorage as backup
    localStorage.setItem('stellarity-theme', theme);
  }, [theme]);
  
  return theme;
};
