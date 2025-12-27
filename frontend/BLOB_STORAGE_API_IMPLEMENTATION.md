# Blob Storage API Implementation

## Overview
This document describes the implementation of the blob storage API integration for saving media files from SharePoint and Google Drive.

## API Endpoint
```
POST api/v1/rfp/{rfp_name}/insert-to-blob
```

## Request Body
```typescript
{
  "mediaItems": [
    {
      "id": "media_001",
      "name": "example.pdf",
      "type": "document",
      "url": "https://example.com/file.pdf",
      "downloadUrl": "https://example.com/download/file.pdf", // optional
      "size": "2MB",
      "source": "sharepoint",
      "mimeType": "application/pdf",
      "file": null, // for uploaded files only
      "googleDriveFileId": null, // only for Google Drive files
      "googleDriveAccessToken": null // only for Google Drive files
    },
    {
      "id": "media_002",
      "name": "photo.png",
      "type": "image",
      "url": "https://example.com/photo.png",
      "size": "500KB",
      "source": "drive",
      "mimeType": "image/png",
      "googleDriveFileId": "someDriveId",
      "googleDriveAccessToken": "ya29.a0ARrdaM..."
    }
  ]
}
```

## Response Body
```typescript
{
  "success": true,
  "message": "Files saved successfully" // optional
}
```

## Implementation Details

### 1. mediaService.ts
Added a new method `insertToBlob` that:
- Takes `rfpName` and array of `MediaItem` objects
- Calls the POST endpoint with the media items
- Returns success/failure response

### 2. SharePointFilePicker.tsx
Updated to:
- Accept optional `rfpName` prop
- Call `mediaService.insertToBlob()` before notifying parent when Insert button is clicked
- Convert SharePoint files to `MediaItem` format
- Continue with normal flow even if blob storage call fails

### 3. GoogleDriveFilePicker.tsx
Updated to:
- Accept optional `rfpName` prop
- Call `mediaService.insertToBlob()` before notifying parent when Select button is clicked
- Convert Google Drive files to `MediaItem` format with access token
- Continue with normal flow even if blob storage call fails

### 4. MediaLibraryDialog.tsx
Updated to:
- Pass `rfpName` prop to both file pickers
- Enable blob storage integration for both SharePoint and Google Drive flows

## Flow Diagram

### SharePoint Flow
```
User selects files in SharePointFilePicker
  ↓
User clicks "Insert" button
  ↓
Convert files to MediaItem format
  ↓
Call mediaService.insertToBlob(rfpName, mediaItems)
  ↓
API saves files to blob storage
  ↓
Continue with normal flow (onFilesSelected callback)
  ↓
Files added to media library
```

### Google Drive Flow
```
User selects files in GoogleDriveFilePicker
  ↓
User clicks "Select" button
  ↓
Get Google Drive access token
  ↓
Convert files to MediaItem format (with token & file ID)
  ↓
Call mediaService.insertToBlob(rfpName, mediaItems)
  ↓
API saves files to blob storage
  ↓
Continue with normal flow (onFilesSelected callback)
  ↓
Files added to media library
```

## Key Features

### 1. Minimalistic API
- Only requires array of MediaItem objects
- Uses existing MediaItem interface
- Simple success/failure response

### 2. Error Handling
- Graceful error handling - flow continues even if blob storage fails
- Errors logged to console for debugging
- User experience not interrupted

### 3. Backward Compatibility
- `rfpName` is optional prop
- Works with or without blob storage integration
- Existing functionality preserved

### 4. Multiple File Support
- Supports batch upload of multiple files
- Single API call for all selected files
- Efficient network usage

## Testing Checklist

- [ ] Select single file from SharePoint and verify blob storage API called
- [ ] Select multiple files from SharePoint and verify blob storage API called
- [ ] Select single file from Google Drive and verify blob storage API called with token
- [ ] Select multiple files from Google Drive and verify blob storage API called with token
- [ ] Verify files still added to media library after blob storage call
- [ ] Verify flow continues if blob storage API fails
- [ ] Verify correct rfpName is passed in API call
- [ ] Verify MediaItem format matches expected structure

## Backend Implementation Notes

The backend should:
1. Accept the POST request at `api/v1/rfp/{rfp_name}/insert-to-blob`
2. Extract `mediaItems` array from request body
3. For each media item:
   - If `source === 'sharepoint'`: Use `downloadUrl` or `url` to fetch file
   - If `source === 'drive'`: Use `googleDriveFileId` and `googleDriveAccessToken` to fetch from Google Drive API
   - If `source === 'upload'`: Handle file from `file` property (if implementing file upload)
4. Save files to blob storage container
5. Return success response

## API Integration Example

```typescript
// In your component
import { mediaService } from '../../services/mediaService';

// When files are selected
const handleFilesSelected = async (files) => {
  const mediaItems = files.map(file => ({
    id: `unique_id_${file.id}`,
    name: file.name,
    type: determineFileType(file),
    url: file.url,
    downloadUrl: file.downloadUrl,
    size: formatFileSize(file.size),
    source: 'sharepoint', // or 'drive'
    mimeType: file.mimeType
  }));

  try {
    await mediaService.insertToBlob('my-rfp-name', mediaItems);
    console.log('Files saved to blob');
  } catch (error) {
    console.error('Blob storage error:', error);
    // Continue with flow
  }
};
```
