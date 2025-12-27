import { api } from './api';
import { sharePointService } from './sharePointService';

export interface MediaItem {
  id: string;
  name: string;
  type: 'image' | 'document' | 'certificate';
  url: string; // SharePoint web URL or file URL
  downloadUrl?: string; // Direct download URL
  size: string;
  source: 'sharepoint' | 'drive' | 'upload';
  mimeType: string;
  file?: File; // For uploaded files
  // Google Drive specific fields
  googleDriveFileId?: string;
  googleDriveAccessToken?: string | null;
}

export interface InsertMediaRequest {
  mediaItem: MediaItem;
  insertionOptions: {
    location: {
      type: 'section' | 'separate_page' | 'appendix';
      sectionId?: string;
      sectionTitle?: string;
    };
    displayOptions: {
      type: 'inline' | 'figure';
      caption?: string;
      figureNumber?: number;
    };
  };
}

export interface InsertMediaResponse {
  success: boolean;
  data?: {
    insertionId: string;
    mediaItem: {
      id: string;
      name: string;
      type: 'image' | 'document' | 'certificate';
      url: string;
      insertedAt: string;
    };
    location: {
      type: 'section' | 'separate_page' | 'appendix';
      sectionId?: string;
      sectionTitle?: string;
      position: number;
    };
    displayInfo: {
      type: 'inline' | 'figure';
      caption?: string;
      figureNumber?: number;
      renderedHtml: string;
    };
  };
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: {
      field: string;
      reason: string;
    };
  };
}

export interface InsertToBlobRequest {
  mediaItems: MediaItem[];
}

export interface InsertToBlobResponse {
  success: boolean;
  message?: string;
}

export interface BlobMediaItem {
  name: string;
  blobUrl: string;
  size: string;
  source: 'sharepoint' | 'drive' | 'upload';
}

export interface GetBlobDataResponse {
  rfpName: string;
  totalCount: number;
  images: BlobMediaItem[];
  documents: BlobMediaItem[];
  certificates: BlobMediaItem[];
}

export const mediaService = {
  /**
   * Get media files from blob storage for a specific RFP
   */
  getBlobData: async (rfpName: string): Promise<GetBlobDataResponse> => {
    try {
      const response = await api.get(
        `api/v1/rfp/getBlobData?rfp_name=${encodeURIComponent(rfpName)}`
      );
      return response.data;
    } catch (error: any) {
      console.error('Error fetching blob data:', error);
      throw error.response?.data || error;
    }
  },

  /**
   * Insert media items to blob storage
   */
  insertToBlob: async (rfpName: string, mediaItems: MediaItem[]): Promise<InsertToBlobResponse> => {
    try {
      const response = await api.post(
        `api/v1/rfp/${encodeURIComponent(rfpName)}/insert-to-blob`,
        { mediaItems }
      );
      return response.data;
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * Insert media item into RFP
   */
  insertMedia: async (rfpName: string, request: InsertMediaRequest): Promise<InsertMediaResponse> => {
    try {
      // Check if this is a SharePoint file that requires additional authorization
      const isSharePointFile = request.mediaItem.source === 'sharepoint' && 
                               request.mediaItem.downloadUrl?.includes('graph.microsoft.com');
      
      // Check if this is a Google Drive file that requires OAuth token
      const isGoogleDriveFile = request.mediaItem.source === 'drive' && 
                                request.mediaItem.googleDriveAccessToken;
      
      // Check if this is an uploaded file that needs to be handled differently
      const isUploadedFile = request.mediaItem.source === 'upload' && request.mediaItem.file;
      
      let headers: Record<string, string> = {};
      
      if (isSharePointFile) {
        try {
          // Get SharePoint access token for the backend to use
          const sharePointToken = await sharePointService.getCurrentAccessToken();
          headers['X-SharePoint-Token'] = `Bearer ${sharePointToken}`;
          console.log('Including SharePoint access token for backend file access');
        } catch (error) {
          console.warn('Could not get SharePoint access token:', error);
          // Continue without the token - the backend might still be able to handle it
        }
      }
      
      if (isGoogleDriveFile && request.mediaItem.googleDriveAccessToken) {
        // Include Google Drive OAuth token for backend to access the file
        headers['X-Google-Drive-Token'] = `Bearer ${request.mediaItem.googleDriveAccessToken}`;
        headers['X-Google-Drive-File-Id'] = request.mediaItem.googleDriveFileId || '';
        console.log('Including Google Drive access token for backend file access');
        
        // For Google Drive files, use the file ID to construct the proper download URL
        if (request.mediaItem.googleDriveFileId) {
          request.mediaItem.downloadUrl = `https://www.googleapis.com/drive/v3/files/${request.mediaItem.googleDriveFileId}?alt=media`;
        }
      }
      
      let requestData: any = request;
      
      // For uploaded files, we might need to send the file data differently
      if (isUploadedFile && request.mediaItem.file) {
        // Create FormData to send the file
        const formData = new FormData();
        formData.append('file', request.mediaItem.file);
        formData.append('mediaItem', JSON.stringify({
          ...request.mediaItem,
          file: undefined // Remove file from JSON as it's sent separately
        }));
        formData.append('insertionOptions', JSON.stringify(request.insertionOptions));
        
        const response = await api.post(
          `api/v1/rfp/${encodeURIComponent(rfpName)}/media/upload-and-insert`,
          formData,
          { 
            headers: {
              ...headers,
              'Content-Type': 'multipart/form-data'
            }
          }
        );
        return response.data;
      } else {
        // Regular request for SharePoint or other files
        console.log("--------------------------------------------") 
        console.log('Inserting media item via standard endpoint');
        console.log('Request Data:', requestData); 
        console.log("--------------------------------------------") 
        const response = await api.post(
          `api/v1/rfp/${encodeURIComponent(rfpName)}/media/insert`, 
          requestData,
          { headers }
        );
        return response.data;
      }
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * Get all media items in an RFP
   */
  getMediaItems: async (rfpName: string): Promise<MediaItem[]> => {
    try {
      const response = await api.get(`/rfp/${encodeURIComponent(rfpName)}/media`);
      return response.data.data || [];
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * Remove media item from RFP
   */
  removeMedia: async (rfpName: string, mediaId: string): Promise<void> => {
    try {
      await api.delete(`/rfp/${encodeURIComponent(rfpName)}/media/${mediaId}`);
    } catch (error: any) {
      throw error.response?.data || error;
    }
  },

  /**
   * Update media item display options
   */
  updateMediaDisplay: async (rfpName: string, mediaId: string, displayOptions: any): Promise<void> => {
    try {
      await api.patch(`/rfp/${encodeURIComponent(rfpName)}/media/${mediaId}`, { displayOptions });
    } catch (error: any) {
      throw error.response?.data || error;
    }
  }
};