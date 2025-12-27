import { useState, useEffect, useCallback } from 'react';
import { 
  sharePointService
} from '../services/sharePointService';
import type {
  SharePointFile, 
  SharePointDrive, 
  SharePointSite 
} from '../services/sharePointService';

interface UseSharePointResult {
  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // User info
  userInfo: { displayName: string; mail: string; userPrincipalName: string } | null;
  
  // Data
  sites: SharePointSite[];
  drives: SharePointDrive[];
  files: SharePointFile[];
  currentDriveId: string | null;
  currentFolderId: string | null;
  
  // Actions
  checkConnection: () => Promise<void>;
  authenticateSharePoint: () => Promise<void>;
  disconnectSharePoint: () => Promise<void>;
  fetchSites: () => Promise<void>;
  fetchDrives: (siteId: string) => Promise<void>;
  fetchFiles: (driveId: string, folderId?: string) => Promise<void>;
  searchFiles: (query: string) => Promise<void>;
  uploadFile: (file: File, folderPath?: string) => Promise<SharePointFile>;
  downloadFile: (file: SharePointFile) => Promise<Blob>;
  navigateToFolder: (folderId: string) => Promise<void>;
  goToOneDrive: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  clearError: () => void;
}

export const useSharePoint = (): UseSharePointResult => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ displayName: string; mail: string; userPrincipalName: string } | null>(null);
  const [sites, setSites] = useState<SharePointSite[]>([]);
  const [drives, setDrives] = useState<SharePointDrive[]>([]);
  const [files, setFiles] = useState<SharePointFile[]>([]);
  const [currentDriveId, setCurrentDriveId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const checkConnection = useCallback(async () => {
    try {
      setError(null);
      
      // This only checks existing auth state, doesn't trigger popup
      const connected = await sharePointService.checkConnection();
      setIsConnected(connected);
      
      if (connected) {
        try {
          const user = await sharePointService.getCurrentUser();
          setUserInfo(user);
        } catch (userError) {
          // If we can't get user info, connection might not be fully established
          setIsConnected(false);
        }
      } else {
        // Clear user info if not connected
        setUserInfo(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check SharePoint connection';
      setError(errorMessage);
      setIsConnected(false);
      setUserInfo(null);
    }
  }, []);

  const authenticateSharePoint = useCallback(async () => {
    // Prevent multiple concurrent authentication attempts
    if (isLoading) {
      console.log('Authentication already in progress, ignoring duplicate request');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // This will trigger authentication popup
      const success = await sharePointService.authenticateForSharePoint();
      
      if (success) {
        setIsConnected(true);
        const user = await sharePointService.getCurrentUser();
        setUserInfo(user);
      }
    } catch (err: any) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to authenticate with SharePoint';
      
      // Add helpful guidance for different error types
      if (errorMessage.includes('popup') || errorMessage.includes('blocked')) {
        setError('Please allow popups for this site to connect to SharePoint. Check your browser settings and try again.');
      } else if (errorMessage.includes('progress') || errorMessage.includes('interaction')) {
        setError('Please wait for the current authentication to complete, then try again.');
      } else if (errorMessage.includes('cancelled')) {
        setError('Authentication was cancelled. Click "Connect SharePoint" to try again.');
      } else {
        setError(errorMessage);
      }
      
      setIsConnected(false);
      setUserInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  const disconnectSharePoint = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      await sharePointService.disconnect();
      
      // Clear all state
      setIsConnected(false);
      setUserInfo(null);
      setSites([]);
      setDrives([]);
      setFiles([]);
      setCurrentDriveId(null);
      setCurrentFolderId(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect from SharePoint';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchSites = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const fetchedSites = await sharePointService.getSites();
      setSites(fetchedSites);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch SharePoint sites');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchDrives = useCallback(async (siteId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const fetchedDrives = await sharePointService.getSiteDrives(siteId);
      setDrives(fetchedDrives);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch SharePoint drives');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchFiles = useCallback(async (driveId: string, folderId?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const fetchedFiles = await sharePointService.getDriveItems(driveId, folderId);
      setFiles(fetchedFiles);
      setCurrentDriveId(driveId);
      setCurrentFolderId(folderId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchFiles = useCallback(async (query: string) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const searchResults = await sharePointService.searchFiles(query);
      setFiles(searchResults);
      setCurrentFolderId(null); // Clear folder context when searching
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search files');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const uploadFile = useCallback(async (file: File, folderPath?: string): Promise<SharePointFile> => {
    if (!currentDriveId) {
      throw new Error('No drive selected');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const uploadedFile = await sharePointService.uploadFile(currentDriveId, file, folderPath);
      
      // Refresh the current folder to show the new file
      if (currentDriveId) {
        const updatedFiles = await sharePointService.getDriveItems(currentDriveId, currentFolderId || undefined);
        setFiles(updatedFiles);
      }
      
      return uploadedFile;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload file';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [currentDriveId, currentFolderId]);

  const downloadFile = useCallback(async (file: SharePointFile): Promise<Blob> => {
    if (!currentDriveId) {
      throw new Error('No drive selected');
    }

    try {
      setError(null);
      return await sharePointService.getFileContent(currentDriveId, file.id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to download file';
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [currentDriveId]);

  const navigateToFolder = useCallback(async (folderId: string) => {
    if (!currentDriveId) {
      return;
    }
    
    await fetchFiles(currentDriveId, folderId);
  }, [currentDriveId, fetchFiles]);

  const goToOneDrive = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const oneDrive = await sharePointService.getOneDrive();
      await fetchFiles(oneDrive.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to access OneDrive');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFiles]);

  const refreshFiles = useCallback(async () => {
    if (!currentDriveId) {
      return;
    }
    
    try {
      setError(null);
      await fetchFiles(currentDriveId, currentFolderId || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh files');
    }
  }, [currentDriveId, currentFolderId, fetchFiles]);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return {
    isConnected,
    isLoading,
    error,
    userInfo,
    sites,
    drives,
    files,
    currentDriveId,
    currentFolderId,
    checkConnection,
    authenticateSharePoint,
    disconnectSharePoint,
    fetchSites,
    fetchDrives,
    fetchFiles,
    searchFiles,
    uploadFile,
    downloadFile,
    navigateToFolder,
    goToOneDrive,
    refreshFiles,
    clearError
  };
};