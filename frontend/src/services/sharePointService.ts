import { PublicClientApplication } from '@azure/msal-browser';

/**
 * SharePoint Service
 * Handles SharePoint integration using Microsoft Graph API
 */

export interface SharePointSite {
  id: string;
  name: string;
  displayName: string;
  webUrl: string;
}

export interface SharePointDrive {
  id: string;
  name: string;
  driveType: string;
  webUrl?: string;
}

export interface SharePointFile {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
  lastModifiedDateTime: string;
  mimeType?: string;
  folder?: boolean;
}

export interface SharePointFolder {
  id: string;
  name: string;
  webUrl: string;
  childCount: number;
}

class SharePointService {
  private msalInstance: PublicClientApplication | null = null;
  private baseUrl = 'https://graph.microsoft.com/v1.0';
  private isAuthenticated = false;
  private authToken: string | null = null;
  private tokenExpiry: number | null = null;
  private readonly requiredScopes = ['Files.Read', 'Files.Read.All', 'Sites.Read.All', 'User.Read'];
  private isAuthenticating = false; // Track if authentication is in progress

  constructor(msalInstance?: PublicClientApplication) {
    if (msalInstance) {
      this.msalInstance = msalInstance;
    }
  }

  /**
   * Initialize the service with MSAL instance
   */
  public initialize(msalInstance: PublicClientApplication) {
    this.msalInstance = msalInstance;
    // Check if user is already authenticated
    this.checkExistingAuthentication();
  }

  /**
   * Check if user already has valid authentication
   */
  private checkExistingAuthentication() {
    if (!this.msalInstance) return;
    
    const account = this.msalInstance.getAllAccounts()[0];
    if (account) {
      // User has an account, they're likely already authenticated for the main app
      this.isAuthenticated = true;
    }
  }

  /**
   * Check if current token is still valid
   */
  private isTokenValid(): boolean {
    if (!this.authToken || !this.tokenExpiry) return false;
    // Add 5 minute buffer before expiry
    return Date.now() < (this.tokenExpiry - 5 * 60 * 1000);
  }

  /**
   * Get access token for Microsoft Graph API
   */
  private async getAccessToken(): Promise<string> {
    if (!this.msalInstance) {
      throw new Error('SharePoint service not initialized with MSAL instance');
    }

    // Return cached token if still valid
    if (this.isTokenValid() && this.authToken) {
      return this.authToken;
    }

    const account = this.msalInstance.getAllAccounts()[0];
    if (!account) {
      throw new Error('No authenticated user found');
    }

    try {
      // Try silent token acquisition first (this should work most of the time)
      const response = await this.msalInstance.acquireTokenSilent({
        scopes: this.requiredScopes,
        account: account
      });
      
      // Cache the token
      this.authToken = response.accessToken;
      this.tokenExpiry = response.expiresOn?.getTime() || null;
      this.isAuthenticated = true;
      
      return response.accessToken;
    } catch (error) {
      console.log('Silent token acquisition failed:', error);
      
      // Only try interactive authentication if we haven't authenticated for SharePoint before
      if (!this.isAuthenticated) {
        try {
          console.log('Attempting interactive authentication for SharePoint...');
          const response = await this.msalInstance.acquireTokenPopup({
            scopes: this.requiredScopes
          });
          
          // Cache the token
          this.authToken = response.accessToken;
          this.tokenExpiry = response.expiresOn?.getTime() || null;
          this.isAuthenticated = true;
          
          return response.accessToken;
        } catch (popupError: any) {
          console.log('Interactive authentication failed:', popupError);
          
          // Check if popup was blocked
          if (popupError.errorCode === 'popup_window_error' || 
              popupError.message?.includes('popup') ||
              popupError.message?.includes('blocked')) {
            
            throw new Error('Popup was blocked by your browser. Please disable popup blocker for this site or try again.');
          }
          
          throw new Error(`Authentication failed: ${popupError.message || 'Unknown error'}`);
        }
      } else {
        // If we were previously authenticated but silent acquisition failed,
        // there might be an issue with permissions or token refresh
        throw new Error('Unable to refresh SharePoint access token. Please try reconnecting.');
      }
    }
  }

  /**
   * Make authenticated request to Microsoft Graph API
   */
  private async makeGraphRequest<T>(endpoint: string): Promise<T> {
    const token = await this.getAccessToken();
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Graph API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get user's SharePoint sites
   */
  async getSites(): Promise<SharePointSite[]> {
    try {
      const response = await this.makeGraphRequest<{ value: any[] }>('/sites?search=*');
      return response.value.map(site => ({
        id: site.id,
        name: site.name,
        displayName: site.displayName,
        webUrl: site.webUrl
      }));
    } catch (error) {
      console.error('Error fetching SharePoint sites:', error);
      throw error;
    }
  }

  /**
   * Get drives for a specific site
   */
  async getSiteDrives(siteId: string): Promise<SharePointDrive[]> {
    try {
      const response = await this.makeGraphRequest<{ value: any[] }>(`/sites/${siteId}/drives`);
      return response.value.map(drive => ({
        id: drive.id,
        name: drive.name,
        driveType: drive.driveType,
        webUrl: drive.webUrl
      }));
    } catch (error) {
      console.error('Error fetching site drives:', error);
      throw error;
    }
  }

  /**
   * Get user's OneDrive (personal drive)
   */
  async getOneDrive(): Promise<SharePointDrive> {
    try {
      const response = await this.makeGraphRequest<any>('/me/drive');
      return {
        id: response.id,
        name: response.name || 'OneDrive',
        driveType: 'personal',
        webUrl: response.webUrl
      };
    } catch (error) {
      console.error('Error fetching OneDrive:', error);
      throw error;
    }
  }

  /**
   * Get files from a drive root or specific folder
   */
  async getDriveItems(driveId: string, folderId?: string): Promise<SharePointFile[]> {
    try {
      const endpoint = folderId 
        ? `/drives/${driveId}/items/${folderId}/children`
        : `/drives/${driveId}/root/children`;
      
      const response = await this.makeGraphRequest<{ value: any[] }>(endpoint);
      
      return response.value.map(item => ({
        id: item.id,
        name: item.name,
        size: item.size,
        webUrl: item.webUrl,
        downloadUrl: !item.folder ? item['@microsoft.graph.downloadUrl'] : undefined,
        thumbnailUrl: item.thumbnails?.[0]?.large?.url,
        lastModifiedDateTime: item.lastModifiedDateTime,
        mimeType: item.file?.mimeType,
        folder: !!item.folder
      }));
    } catch (error) {
      console.error('Error fetching drive items:', error);
      throw error;
    }
  }

  /**
   * Search for files across SharePoint
   */
  async searchFiles(query: string): Promise<SharePointFile[]> {
    try {
      const response = await this.makeGraphRequest<{ value: any[] }>(`/me/drive/search(q='${encodeURIComponent(query)}')`);
      
      return response.value.map(item => ({
        id: item.id,
        name: item.name,
        size: item.size,
        webUrl: item.webUrl,
        downloadUrl: !item.folder ? item['@microsoft.graph.downloadUrl'] : undefined,
        thumbnailUrl: item.thumbnails?.[0]?.large?.url,
        lastModifiedDateTime: item.lastModifiedDateTime,
        mimeType: item.file?.mimeType,
        folder: !!item.folder
      }));
    } catch (error) {
      console.error('Error searching files:', error);
      throw error;
    }
  }

  /**
   * Get file content as blob
   */
  async getFileContent(driveId: string, fileId: string): Promise<Blob> {
    try {
      const token = await this.getAccessToken();
      const response = await fetch(`${this.baseUrl}/drives/${driveId}/items/${fileId}/content`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`);
      }

      return response.blob();
    } catch (error) {
      console.error('Error downloading file:', error);
      throw error;
    }
  }

  /**
   * Upload file to SharePoint
   */
  async uploadFile(driveId: string, file: File, folderPath?: string): Promise<SharePointFile> {
    try {
      const token = await this.getAccessToken();
      const uploadPath = folderPath ? `${folderPath}/${file.name}` : file.name;
      
      const response = await fetch(`${this.baseUrl}/drives/${driveId}/root:/${uploadPath}:/content`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': file.type
        },
        body: file
      });

      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.status}`);
      }

      const result = await response.json();
      return {
        id: result.id,
        name: result.name,
        size: result.size,
        webUrl: result.webUrl,
        downloadUrl: result['@microsoft.graph.downloadUrl'],
        lastModifiedDateTime: result.lastModifiedDateTime,
        mimeType: result.file?.mimeType,
        folder: false
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Check if user is authenticated and has required permissions
   * This should NOT trigger authentication, just check existing state
   */
  async checkConnection(): Promise<boolean> {
    if (!this.msalInstance) {
      return false;
    }

    const account = this.msalInstance.getAllAccounts()[0];
    if (!account) {
      return false;
    }

    // If we have a valid cached token, user is connected
    if (this.isTokenValid() && this.authToken && this.isAuthenticated) {
      return true;
    }

    return false;
  }

  /**
   * Explicitly authenticate for SharePoint access
   * This should only be called when user clicks "Connect SharePoint"
   */
  async authenticateForSharePoint(): Promise<boolean> {
    if (!this.msalInstance) {
      throw new Error('SharePoint service not initialized with MSAL instance');
    }

    // Prevent concurrent authentication attempts
    if (this.isAuthenticating) {
      throw new Error('Authentication is already in progress. Please wait for the current authentication to complete.');
    }

    const account = this.msalInstance.getAllAccounts()[0];
    if (!account) {
      throw new Error('No authenticated user found. Please log in to the application first.');
    }

    try {
      this.isAuthenticating = true;
      console.log('Authenticating for SharePoint access...');
      
      try {
        // First try silent authentication
        const response = await this.msalInstance.acquireTokenSilent({
          scopes: this.requiredScopes,
          account: account
        });
        
        // Cache the token
        this.authToken = response.accessToken;
        this.tokenExpiry = response.expiresOn?.getTime() || null;
        this.isAuthenticated = true;
        
        console.log('SharePoint authentication successful (silent)');
        return true;
      } catch (silentError: any) {
        console.log('Silent authentication failed, trying interactive...', silentError);
        
        // Check if there's already an interaction in progress
        if (silentError.errorCode === 'interaction_in_progress') {
          throw new Error('Another authentication is already in progress. Please wait and try again.');
        }
        
        try {
          // Try interactive authentication
          const response = await this.msalInstance.acquireTokenPopup({
            scopes: this.requiredScopes,
            prompt: 'select_account' // Let user select account instead of forcing consent
          });
          
          // Cache the token
          this.authToken = response.accessToken;
          this.tokenExpiry = response.expiresOn?.getTime() || null;
          this.isAuthenticated = true;
          
          console.log('SharePoint authentication successful (interactive)');
          return true;
        } catch (popupError: any) {
          console.error('Interactive authentication failed:', popupError);
          
          // Handle specific MSAL errors
          if (popupError.errorCode === 'interaction_in_progress') {
            throw new Error('Another authentication is already in progress. Please wait and try again.');
          } else if (popupError.errorCode === 'popup_window_error' || 
                     popupError.message?.includes('popup') ||
                     popupError.message?.includes('blocked')) {
            throw new Error('Popup was blocked by your browser. Please disable popup blocker for this site and try again.');
          } else if (popupError.errorCode === 'user_cancelled') {
            throw new Error('Authentication was cancelled by user.');
          }
          
          throw new Error(`Authentication failed: ${popupError.message || 'Unknown error'}`);
        }
      }
    } finally {
      this.isAuthenticating = false;
    }
  }

  /**
   * Disconnect from SharePoint
   */
  async disconnect(): Promise<void> {
    console.log('Disconnecting from SharePoint...');
    
    // Clear cached authentication state
    this.authToken = null;
    this.tokenExpiry = null;
    this.isAuthenticated = false;
    this.isAuthenticating = false; // Clear any pending auth state
    
    // Note: We don't remove the account from MSAL since they might still need
    // to be logged in for the main application
    console.log('SharePoint disconnection complete');
  }

  /**
   * Get current user's information
   */
  async getCurrentUser(): Promise<{ displayName: string; mail: string; userPrincipalName: string }> {
    try {
      const response = await this.makeGraphRequest<any>('/me');
      return {
        displayName: response.displayName,
        mail: response.mail || response.userPrincipalName,
        userPrincipalName: response.userPrincipalName
      };
    } catch (error) {
      console.error('Error fetching user info:', error);
      throw error;
    }
  }

  /**
   * Get current access token (for external use)
   * This allows other services to access the SharePoint token for making authenticated requests
   */
  async getCurrentAccessToken(): Promise<string> {
    return this.getAccessToken();
  }
}

export const sharePointService = new SharePointService();

// Initialize with MSAL instance from main.tsx
// This will be called after MSAL instance is available
export const initializeSharePointService = (msalInstance: PublicClientApplication) => {
  sharePointService.initialize(msalInstance);
};