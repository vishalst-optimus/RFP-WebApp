# Import URL API Documentation

## Endpoint: Upload File from URL to Blob Storage

### URL
```
POST /api/v1/rfp/uploadFileFromUrl
```

### Headers
```
Content-Type: application/json
Authorization: Bearer {token}
```

### Request Body
```json
{
  "rfp_name": "string",
  "url": "string",
  "mediaType": "image" | "document" | "certificate",
  "source": "manual"
}
```

### Request Example
```json
{
  "rfp_name": "test",
  "url": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
  "mediaType": "document",
  "source": "manual"
}
```

### Response Body
```json
{
  "images": [
    {
      "name": "string",
      "blobUrl": "string",
      "size": number
    }
  ],
  "documents": [
    {
      "name": "string",
      "blobUrl": "string",
      "size": number
    }
  ],
  "certificates": [
    {
      "name": "string",
      "blobUrl": "string",
      "size": number
    }
  ]
}
```

### Response Example (Document Upload)
```json
{
  "images": [],
  "documents": [
    {
      "name": "dummy.pdf",
      "blobUrl": "https://yourstorageaccount.blob.core.windows.net/rfp-media/test/documents/dummy.pdf",
      "size": 13264
    }
  ],
  "certificates": []
}
```

### Response Example (Image Upload)
```json
{
  "images": [
    {
      "name": "company-logo.png",
      "blobUrl": "https://yourstorageaccount.blob.core.windows.net/rfp-media/test/images/company-logo.png",
      "size": 45678
    }
  ],
  "documents": [],
  "certificates": []
}
```

### Response Example (Certificate Upload)
```json
{
  "images": [],
  "documents": [],
  "certificates": [
    {
      "name": "iso-certificate.jpg",
      "blobUrl": "https://yourstorageaccount.blob.core.windows.net/rfp-media/test/certificates/iso-certificate.jpg",
      "size": 234567
    }
  ]
}
```

## Backend Implementation Notes

The backend should:

1. **Receive the URL** from the request body
2. **Download the file** from the provided URL (server-to-server, no CORS issues)
3. **Extract filename** from the URL path or Content-Disposition header
4. **Upload to blob storage** in the appropriate category folder based on `mediaType`:
   - `image` → `/rfp-media/{rfp_name}/images/`
   - `document` → `/rfp-media/{rfp_name}/documents/`
   - `certificate` → `/rfp-media/{rfp_name}/certificates/`
5. **Return response** with the blob URL and file metadata

## Error Handling

### Error Response Format
```json
{
  "error": "string",
  "message": "string",
  "statusCode": number
}
```

### Common Error Cases

**Invalid URL (400 Bad Request)**
```json
{
  "error": "Invalid URL",
  "message": "The provided URL is not valid or accessible",
  "statusCode": 400
}
```

**Download Failed (502 Bad Gateway)**
```json
{
  "error": "Download Failed",
  "message": "Unable to download file from the provided URL",
  "statusCode": 502
}
```

**Upload Failed (500 Internal Server Error)**
```json
{
  "error": "Upload Failed",
  "message": "Failed to upload file to blob storage",
  "statusCode": 500
}
```

**File Too Large (413 Payload Too Large)**
```json
{
  "error": "File Too Large",
  "message": "The file size exceeds the maximum allowed limit",
  "statusCode": 413
}
```

## Implementation Details

### Supported URL Schemes
- `http://`
- `https://`

### File Size Limits
- Maximum file size: TBD (configure based on your requirements)

### Supported File Types

**Images** (mediaType: "image"):
- jpg, jpeg, png, gif, bmp, svg, webp, tiff, ico

**Documents** (mediaType: "document"):
- pdf, doc, docx, txt, csv, xls, xlsx

**Certificates** (mediaType: "certificate"):
- jpg, jpeg, png, gif, bmp, svg, webp, tiff, ico (same as images)

### Security Considerations

1. **URL Validation**: Validate that the URL is properly formatted and uses http/https
2. **Timeout**: Set appropriate timeout for file downloads
3. **File Size Check**: Verify file size before uploading to blob storage
4. **File Type Validation**: Verify the downloaded file matches expected type
5. **Malware Scanning**: Consider scanning files before storing (optional)
6. **Rate Limiting**: Implement rate limiting to prevent abuse

## Comparison with uploadFilesToBlob

### uploadFileFromUrl
- **Purpose**: Download file from external URL and upload to blob storage
- **Content-Type**: `application/json`
- **File Source**: External URL (backend downloads)
- **Request Format**: JSON with URL string

### uploadFilesToBlob
- **Purpose**: Upload files directly from user's device
- **Content-Type**: `multipart/form-data`
- **File Source**: User's local files
- **Request Format**: FormData with file objects

Both endpoints return the **same response format** for consistency.
