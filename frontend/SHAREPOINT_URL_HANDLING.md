# SharePoint URL Handling in RFP Media Integration

## URL Types from SharePoint

When you select files from SharePoint, the integration provides two types of URLs:

### 1. Web URL (`file.webUrl`)
- **Purpose**: SharePoint web interface URL for viewing the file
- **Example**: `https://contoso.sharepoint.com/sites/rfp/Shared%20Documents/company-structure.png`
- **Use Case**: For displaying links to view the file in SharePoint web interface

### 2. Download URL (`file.downloadUrl`)
- **Purpose**: Direct download URL that bypasses SharePoint web interface
- **Example**: `https://contoso.sharepoint.com/sites/rfp/_layouts/15/download.aspx?UniqueId=abc123&Translate=false&tempauth=...`
- **Use Case**: For direct file access, embedding, and API operations

## How URLs Are Obtained

The URLs come from Microsoft Graph API when browsing SharePoint files:

```javascript
// In sharePointService.ts
const response = await fetch(
  `${this.baseUrl}/sites/${siteId}/drives/${driveId}/items/${folderId}/children`,
  {
    headers: {
      'Authorization': `Bearer ${this.authToken}`,
      'Content-Type': 'application/json'
    }
  }
);

// Graph API returns file objects like:
{
  "id": "01234567-89AB-CDEF-0123-456789ABCDEF",
  "name": "company-structure.png",
  "size": 245760,
  "webUrl": "https://contoso.sharepoint.com/sites/rfp/Shared%20Documents/company-structure.png",
  "@microsoft.graph.downloadUrl": "https://contoso.sharepoint.com/sites/rfp/_layouts/15/download.aspx?..."
}
```

## Implementation Flow

### 1. File Selection (SharePointFilePicker.tsx)
```typescript
const handleInsertFiles = () => {
  const filesToInsert = selectedFiles.map(file => ({
    name: file.name,
    url: file.webUrl,           // SharePoint web URL
    downloadUrl: file.downloadUrl, // Direct download URL
    size: file.size
  }));
  
  onFilesSelected(filesToInsert);
};
```

### 2. Media Library Processing (MediaLibraryDialog.tsx)
```typescript
const newMediaItems: MediaItem[] = files.map((file, index) => ({
  id: `sharepoint_${Date.now()}_${index}`,
  name: file.name,
  type: categorizeFileByType(file.name),
  size: formatFileSize(file.size),
  source: 'sharepoint',
  url: file.url,               // Web URL for display
  downloadUrl: file.downloadUrl, // Download URL for API
  // ... other properties
}));
```

### 3. API Request (InsertMediaDialog.tsx)
```typescript
const insertRequest: InsertMediaRequest = {
  mediaItem: {
    ...mediaItem,
    // Use downloadUrl for direct access, fallback to webUrl
    url: mediaItem.downloadUrl || mediaItem.url,
    mimeType: mediaItem.mimeType || getMimeTypeFromFileName(mediaItem.name)
  },
  // ... other properties
};
```

## Backend Considerations

### URL Authentication
SharePoint download URLs include temporary authentication tokens:

```
https://contoso.sharepoint.com/sites/rfp/_layouts/15/download.aspx
  ?UniqueId=abc123
  &Translate=false
  &tempauth=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImtpZCI6...
  &ApiVersion=2.0
```

### Token Expiration
- Download URLs contain temporary auth tokens (typically valid for 1 hour)
- Your backend should:
  1. **Immediate Processing**: Download/process the file immediately when the API is called
  2. **Store Locally**: Save the file content to your own storage (database, file system, cloud storage)
  3. **Don't Store URLs**: Don't store the download URLs for later use due to expiration

### Recommended Backend Implementation

```python
# Example Python backend implementation
@app.route('/api/rfp/<rfp_id>/media/insert', methods=['POST'])
def insert_media(rfp_id):
    data = request.get_json()
    media_item = data['mediaItem']
    
    # 1. Download the file immediately
    file_url = media_item['url']  # This is the downloadUrl from frontend
    file_response = requests.get(file_url)
    
    if file_response.status_code == 200:
        # 2. Store file content (example: save to your storage)
        file_content = file_response.content
        stored_file_path = store_file_securely(file_content, media_item['name'])
        
        # 3. Save media record in database with your own URL
        media_record = {
            'id': generate_unique_id(),
            'rfp_id': rfp_id,
            'name': media_item['name'],
            'type': media_item['type'],
            'original_sharepoint_url': file_url,  # For reference
            'local_file_path': stored_file_path,   # Your storage path
            'size': media_item.get('size'),
            'mime_type': media_item['mimeType'],
            # ... insertion options
        }
        
        # Save to database
        save_media_record(media_record)
        
        return {
            'success': True,
            'data': {
                'insertionId': media_record['id'],
                # ... response data
            }
        }
    else:
        return {'success': False, 'error': 'Failed to download file'}, 400
```

### Alternative: Proxy Approach
If you prefer not to store files locally, you can create a proxy endpoint:

```python
@app.route('/api/rfp/<rfp_id>/media/<media_id>/content')
def get_media_content(rfp_id, media_id):
    # Get fresh SharePoint access token
    access_token = get_sharepoint_access_token()
    
    # Get file info from database
    media_record = get_media_record(media_id)
    
    # Use Graph API to get fresh download URL
    graph_response = requests.get(
        f"https://graph.microsoft.com/v1.0/sites/{site_id}/drives/{drive_id}/items/{media_record['sharepoint_file_id']}",
        headers={'Authorization': f'Bearer {access_token}'}
    )
    
    fresh_download_url = graph_response.json().get('@microsoft.graph.downloadUrl')
    
    # Proxy the file content
    file_response = requests.get(fresh_download_url)
    return Response(file_response.content, mimetype=media_record['mime_type'])
```

## Security Considerations

1. **Validate File Types**: Always validate file extensions and MIME types
2. **Size Limits**: Implement file size restrictions
3. **Access Control**: Ensure users can only access files they have permissions for
4. **Virus Scanning**: Consider scanning files before storage
5. **Audit Trail**: Log all media operations for compliance

## Error Handling

Common scenarios to handle:

1. **Token Expired**: Download URL no longer valid
2. **File Deleted**: File was removed from SharePoint
3. **Permission Denied**: User lost access to SharePoint file
4. **Network Issues**: SharePoint service unavailable

```typescript
// Frontend error handling example
try {
  const response = await mediaService.insertMedia(rfpId, insertRequest);
  if (response.success) {
    onInsert(response.data);
  } else {
    setError(response.error?.message || 'Failed to insert media');
  }
} catch (err: any) {
  if (err.code === 'MEDIA_NOT_ACCESSIBLE') {
    setError('The SharePoint file is no longer accessible. Please select a different file.');
  } else {
    setError('An error occurred while inserting the media');
  }
}
```

This implementation ensures reliable file access and proper error handling for SharePoint-integrated media in your RFP system.