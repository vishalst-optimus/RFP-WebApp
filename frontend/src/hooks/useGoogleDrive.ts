import { useState, useEffect, useCallback } from 'react';
import { 
  googleDriveService
} from '../services/googleDriveService';
import type {
  GoogleDriveFile, 
  GoogleDriveFolder 
} from '../services/googleDriveService';

interface UseGoogleDriveResult {
  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // User info
  userInfo: { name: string; email: string } | null;
  
  // Data
  files: GoogleDriveFile[];
  currentFolderId: string | null;
  folderPath: GoogleDriveFolder[];
  
  // Actions
  checkConnection: () => Promise<void>;
  authenticateGoogleDrive: () => Promise<void>;
  handleAuthCallback: (code: string) => Promise<void>;
  disconnectGoogleDrive: () => Promise<void>;
  fetchFiles: (folderId?: string) => Promise<void>;
  searchFiles: (query: string) => Promise<void>;
  downloadFile: (file: GoogleDriveFile) => Promise<Blob>;
  navigateToFolder: (folderId: string) => Promise<void>;
  goToRoot: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  clearError: () => void;
  getAccessToken: () => string | null;
  getDownloadUrl: (fileId: string) => string;
}

export const useGoogleDrive = (): UseGoogleDriveResult => {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ name: string; email: string } | null>(null);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<GoogleDriveFolder[]>([]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Check if already connected to Google Drive
   */
  const checkConnection = useCallback(async () => {
    try {
      setIsLoading(true);
      // Don't clear error here - let successful operations clear it

      const isAuthenticated = await googleDriveService.checkStoredAuth();
      
      if (isAuthenticated) {
        setIsConnected(true);
        setError(null); // Clear errors when connection is confirmed
        // Fetch user info
        try {
          const user = await googleDriveService.getUserInfo();
          setUserInfo(user);
        } catch (userError) {
          console.warn('Could not fetch user info:', userError);
          // Don't set error as the connection itself is valid
        }
      } else {
        setIsConnected(false);
        setUserInfo(null);
        // Don't set connection error here - user just needs to authenticate
      }
    } catch (err) {
      console.error('Connection check failed:', err);
      // Only set error if this is a real failure, not just "not connected"
      if (err instanceof Error && !err.message.includes('Not authenticated')) {
        setError(err.message);
      }
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Authenticate with Google Drive
   */
  const authenticateGoogleDrive = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Use the new authentication method
      await googleDriveService.authenticate();
      setIsConnected(true);
      setError(null); // Clear any previous errors after successful auth

      // Fetch user info
      try {
        const user = await googleDriveService.getUserInfo();
        setUserInfo(user);
      } catch (userError) {
        console.warn('Could not fetch user info:', userError);
        // Don't set error here as authentication was successful
      }

      // Don't automatically fetch files to avoid potential errors
      // Let the user navigate manually or handle this separately
    } catch (err) {
      console.error('Authentication failed:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Handle authentication callback with authorization code
   * (No longer needed with the new implementation, but kept for compatibility)
   */
  const handleAuthCallback = useCallback(async (code: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // This method is no longer used with the new implementation
      console.warn('handleAuthCallback is deprecated with the new Google Drive implementation');
      
    } catch (err) {
      console.error('Auth callback failed:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Disconnect from Google Drive
   */
  const disconnectGoogleDrive = useCallback(async () => {
    try {
      await googleDriveService.disconnect();
      setIsConnected(false);
      setUserInfo(null);
      setFiles([]);
      setCurrentFolderId(null);
      setFolderPath([]);
      setError(null);
    } catch (err) {
      console.error('Disconnect failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    }
  }, []);

  /**
   * Fetch files from Google Drive
   */
  const fetchFiles = useCallback(async (folderId?: string, silent?: boolean) => {
    if (!isConnected) {
      if (!silent) {
        setError('Not connected to Google Drive');
      }
      return;
    }

    try {
      setIsLoading(true);
      if (!silent) {
        setError(null);
      }

      const targetFolderId = folderId || currentFolderId || 'root';
      const fetchedFiles = await googleDriveService.listFiles(targetFolderId === 'root' ? undefined : targetFolderId);
      
      setFiles(fetchedFiles);
      setCurrentFolderId(targetFolderId);

      // Update folder path
      if (targetFolderId && targetFolderId !== 'root') {
        const path = await googleDriveService.getFolderPath(targetFolderId);
        setFolderPath(path);
      } else {
        setFolderPath([{ id: 'root', name: 'My Drive' }]);
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to fetch files');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, currentFolderId]);

  /**
   * Search files in Google Drive
   */
  const searchFiles = useCallback(async (query: string) => {
    if (!isConnected) {
      setError('Not connected to Google Drive');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const searchResults = await googleDriveService.searchFiles(query);
      setFiles(searchResults);
      setCurrentFolderId(null); // Clear current folder when searching
      setFolderPath([]);
    } catch (err) {
      console.error('Search failed:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsLoading(false);
    }
  }, [isConnected]);

  /**
   * Download a file
   */
  const downloadFile = useCallback(async (file: GoogleDriveFile): Promise<Blob> => {
    if (!isConnected) {
      throw new Error('Not connected to Google Drive');
    }

    try {
      return await googleDriveService.downloadFile(file.id);
    } catch (err) {
      console.error('Download failed:', err);
      throw new Error(err instanceof Error ? err.message : 'Download failed');
    }
  }, [isConnected]);

  /**
   * Navigate to a specific folder
   */
  const navigateToFolder = useCallback(async (folderId: string) => {
    await fetchFiles(folderId);
  }, [fetchFiles]);

  /**
   * Go to root directory
   */
  const goToRoot = useCallback(async () => {
    await fetchFiles('root');
  }, [fetchFiles]);

  /**
   * Refresh current folder files
   */
  const refreshFiles = useCallback(async () => {
    await fetchFiles(currentFolderId || 'root');
  }, [fetchFiles, currentFolderId]);

  /**
   * Get current access token
   */
  const getAccessToken = useCallback(() => {
    return googleDriveService.getAccessToken();
  }, []);

  /**
   * Get downloadable URL for a file
   */
  const getDownloadUrl = useCallback((fileId: string) => {
    return googleDriveService.getDownloadUrl(fileId);
  }, []);

  // Check connection on mount
  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  return {
    // State
    isConnected,
    isLoading,
    error,
    userInfo,
    files,
    currentFolderId,
    folderPath,
    
    // Actions
    checkConnection,
    authenticateGoogleDrive,
    handleAuthCallback,
    disconnectGoogleDrive,
    fetchFiles,
    searchFiles,
    downloadFile,
    navigateToFolder,
    goToRoot,
    refreshFiles,
    clearError,
    getAccessToken,
    getDownloadUrl
  };
};