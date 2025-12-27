/**
 * Google Drive Service
 * Handles Google Drive integration using Google Drive API JavaScript client
 */

export interface GoogleDriveFile {
  id: string;
  name: string;
  size?: number;
  webViewLink?: string;
  downloadUrl?: string;
  thumbnailLink?: string;
  modifiedTime?: string;
  mimeType?: string;
  folder?: boolean;
  parents?: string[];
}

export interface GoogleDriveFolder {
  id: string;
  name: string;
  webViewLink?: string;
  parents?: string[];
}

// Extend Window interface for Google APIs
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

class GoogleDriveService {
  private isAuthenticated = false;
  private readonly CLIENT_ID = '464509752480-jnad05to6dhako9k86lh1fvuasdult97.apps.googleusercontent.com';
  private readonly API_KEY = ''; // Not needed for OAuth flow
  private readonly DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
  private readonly SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
  private gapiLoaded = false;
  private gisLoaded = false;
  private tokenClient: any = null;

  constructor() {
    this.initializeGAPI();
  }

  /**
   * Initialize Google API and Google Identity Services
   */
  private async initializeGAPI() {
    // Load Google API script
    if (!window.gapi) {
      await this.loadScript('https://apis.google.com/js/api.js');
    }
    
    // Load Google Identity Services script
    if (!window.google) {
      await this.loadScript('https://accounts.google.com/gsi/client');
    }

    // Initialize gapi
    await new Promise<void>((resolve) => {
      window.gapi.load('client', async () => {
        await window.gapi.client.init({
          discoveryDocs: [this.DISCOVERY_DOC],
        });
        this.gapiLoaded = true;
        resolve();
      });
    });

    // Initialize Google Identity Services
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.CLIENT_ID,
      scope: this.SCOPES,
      callback: '', // defined later
    });
    this.gisLoaded = true;
  }

  /**
   * Load external script
   */
  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });
  }

  /**
   * Check if current token is still valid
   */
  private isTokenValid(): boolean {
    const token = window.gapi.client.getToken();
    return token && !this.isTokenExpired(token);
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(token: any): boolean {
    return Date.now() >= (token.expires_at || 0);
  }

  /**
   * Authenticate with Google Drive using popup
   */
  public async authenticate(): Promise<void> {
    if (!this.gapiLoaded || !this.gisLoaded) {
      await this.initializeGAPI();
    }

    return new Promise((resolve, reject) => {
      try {
        this.tokenClient.callback = async (response: any) => {
          if (response.error !== undefined) {
            reject(new Error(response.error));
          } else {
            this.isAuthenticated = true;
            resolve();
          }
        };

        if (window.gapi.client.getToken() === null) {
          // Prompt the user to select a Google Account and ask for consent to share their data
          this.tokenClient.requestAccessToken({ prompt: 'consent' });
        } else {
          // Skip display of account chooser and consent dialog for an existing session.
          this.tokenClient.requestAccessToken({ prompt: '' });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Check for stored authentication
   */
  public async checkStoredAuth(): Promise<boolean> {
    if (!this.gapiLoaded || !this.gisLoaded) {
      try {
        await this.initializeGAPI();
      } catch (error) {
        console.error('Failed to initialize Google API:', error);
        return false;
      }
    }

    const token = window.gapi.client.getToken();
    if (token && !this.isTokenExpired(token)) {
      this.isAuthenticated = true;
      return true;
    }

    this.isAuthenticated = false;
    return false;
  }

  /**
   * Disconnect from Google Drive
   */
  public async disconnect(): Promise<void> {
    const token = window.gapi.client.getToken();
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token);
      window.gapi.client.setToken('');
    }
    this.isAuthenticated = false;
  }

  /**
   * Check if authenticated
   */
  public isConnected(): boolean {
    const token = window.gapi?.client?.getToken();
    return this.isAuthenticated && token && !this.isTokenExpired(token);
  }

  /**
   * Get current access token
   */
  public getAccessToken(): string | null {
    const token = window.gapi?.client?.getToken();
    return token ? token.access_token : null;
  }

  /**
   * Get user information
   */
  public async getUserInfo(): Promise<{ name: string; email: string }> {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const response = await window.gapi.client.drive.about.get({
        fields: 'user'
      });

      return {
        name: response.result.user?.displayName || 'Unknown',
        email: response.result.user?.emailAddress || 'Unknown'
      };
    } catch (error) {
      console.error('Error fetching user info:', error);
      // Don't throw here if it's just a user info fetch failure
      // The authentication itself might still be valid
      return {
        name: 'Unknown',
        email: 'Unknown'
      };
    }
  }

  /**
   * List files in Google Drive
   */
  public async listFiles(
    folderId?: string,
    pageSize: number = 50,
    query?: string
  ): Promise<GoogleDriveFile[]> {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      let searchQuery = '';
      
      if (folderId) {
        searchQuery = `'${folderId}' in parents`;
      } else {
        // List files in root if no folder specified
        searchQuery = "'root' in parents";
      }

      if (query) {
        searchQuery += ` and name contains '${query}'`;
      }

      // Add condition to exclude trashed files
      searchQuery += ' and trashed=false';

      const response = await window.gapi.client.drive.files.list({
        pageSize,
        fields: 'files(id,name,size,webViewLink,mimeType,modifiedTime,parents,thumbnailLink)',
        q: searchQuery,
        orderBy: 'folder,name'
      });

      const files = response.result.files || [];

      return files.map((file: any): GoogleDriveFile => ({
        id: file.id || '',
        name: file.name || 'Unnamed',
        size: file.size ? parseInt(file.size) : undefined,
        webViewLink: file.webViewLink || undefined,
        downloadUrl: file.id && !file.mimeType?.includes('google-apps') ? this.getDownloadUrl(file.id) : undefined,
        thumbnailLink: file.thumbnailLink || undefined,
        modifiedTime: file.modifiedTime || undefined,
        mimeType: file.mimeType || undefined,
        folder: file.mimeType === 'application/vnd.google-apps.folder',
        parents: file.parents || undefined
      }));
    } catch (error) {
      console.error('Error listing files:', error);
      throw new Error('Failed to fetch files from Google Drive');
    }
  }

  /**
   * Search files in Google Drive
   */
  public async searchFiles(query: string, pageSize: number = 20): Promise<GoogleDriveFile[]> {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const searchQuery = `name contains '${query}' and trashed=false`;

      const response = await window.gapi.client.drive.files.list({
        pageSize,
        fields: 'files(id,name,size,webViewLink,mimeType,modifiedTime,parents,thumbnailLink)',
        q: searchQuery,
        orderBy: 'relevance,modifiedTime desc'
      });

      const files = response.result.files || [];

      return files.map((file: any): GoogleDriveFile => ({
        id: file.id || '',
        name: file.name || 'Unnamed',
        size: file.size ? parseInt(file.size) : undefined,
        webViewLink: file.webViewLink || undefined,
        downloadUrl: file.id && !file.mimeType?.includes('google-apps') ? this.getDownloadUrl(file.id) : undefined,
        thumbnailLink: file.thumbnailLink || undefined,
        modifiedTime: file.modifiedTime || undefined,
        mimeType: file.mimeType || undefined,
        folder: file.mimeType === 'application/vnd.google-apps.folder',
        parents: file.parents || undefined
      }));
    } catch (error) {
      console.error('Error searching files:', error);
      throw new Error('Failed to search files in Google Drive');
    }
  }

  /**
   * Get file metadata
   */
  public async getFile(fileId: string): Promise<GoogleDriveFile> {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const response = await window.gapi.client.drive.files.get({
        fileId,
        fields: 'id,name,size,webViewLink,mimeType,modifiedTime,parents,thumbnailLink'
      });

      const file = response.result;

      return {
        id: file.id || '',
        name: file.name || 'Unnamed',
        size: file.size ? parseInt(file.size) : undefined,
        webViewLink: file.webViewLink || undefined,
        downloadUrl: file.id && !file.mimeType?.includes('google-apps') ? this.getDownloadUrl(file.id) : undefined,
        thumbnailLink: file.thumbnailLink || undefined,
        modifiedTime: file.modifiedTime || undefined,
        mimeType: file.mimeType || undefined,
        folder: file.mimeType === 'application/vnd.google-apps.folder',
        parents: file.parents || undefined
      };
    } catch (error) {
      console.error('Error getting file:', error);
      throw new Error('Failed to get file information');
    }
  }

  /**
   * Get downloadable URL for a file
   */
  public getDownloadUrl(fileId: string): string {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token available');
    }
    
    // Return the Google Drive API download URL with access token
    return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&access_token=${accessToken}`;
  }

  /**
   * Download file content
   */
  public async downloadFile(fileId: string): Promise<Blob> {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    try {
      const response = await window.gapi.client.request({
        path: `https://www.googleapis.com/drive/v3/files/${fileId}`,
        params: { alt: 'media' }
      });

      // Convert response to blob
      const blob = new Blob([response.body]);
      return blob;
    } catch (error) {
      console.error('Error downloading file:', error);
      throw new Error('Failed to download file');
    }
  }

  /**
   * Get folder breadcrumb path
   */
  public async getFolderPath(folderId: string): Promise<GoogleDriveFolder[]> {
    if (!this.isAuthenticated) {
      throw new Error('Not authenticated with Google Drive');
    }

    const path: GoogleDriveFolder[] = [];
    let currentFolderId = folderId;

    try {
      while (currentFolderId && currentFolderId !== 'root') {
        const response = await window.gapi.client.drive.files.get({
          fileId: currentFolderId,
          fields: 'id,name,webViewLink,parents'
        });

        const folder = response.result;
        path.unshift({
          id: folder.id || '',
          name: folder.name || 'Unnamed',
          webViewLink: folder.webViewLink || undefined,
          parents: folder.parents || undefined
        });

        // Move to parent folder
        currentFolderId = folder.parents?.[0] || '';
      }

      // Add root folder at the beginning
      path.unshift({
        id: 'root',
        name: 'My Drive',
        webViewLink: undefined,
        parents: undefined
      });

      return path;
    } catch (error) {
      console.error('Error getting folder path:', error);
      return [];
    }
  }
}

// Export singleton instance
export const googleDriveService = new GoogleDriveService();