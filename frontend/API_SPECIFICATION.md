# RFP Media Insertion API Specification

## Endpoint: Insert Media into RFP

### URL
```
POST /api/rfp/{rfpName}/media/insert
```

**Note**: `{rfpName}` should be URL-encoded to handle special characters and spaces in RFP names.

### Example URLs
```
POST /api/rfp/test/media/insert
POST /api/rfp/Company%20Restructuring%20RFP/media/insert
```

### Headers
```
Content-Type: application/json
Authorization: Bearer {token}
```

### Request Body
```json
{
  "mediaItem": {
    "id": "string",
    "name": "string", 
    "type": "image" | "document" | "certificate",
    "url": "string",
    "size": "string",
    "source": "sharepoint" | "drive" | "upload",
    "mimeType": "string"
  },
  "insertionOptions": {
    "location": {
      "type": "section" | "separate_page" | "appendix",
      "sectionId": "string", // Required when type is "section"
      "sectionTitle": "string" // Required when type is "section"
    },
    "displayOptions": {
      "type": "inline" | "figure", // "figure" only available for images
      "caption": "string" // Required when displayOptions.type is "figure"
    }
  }
}
```

### Request Example
```json
{
  "mediaItem": {
    "id": "sp_file_12345",
    "name": "company-structure.png",
    "type": "image",
    "url": "https://sharepoint.example.com/sites/rfp/documents/company-structure.png",
    "size": "245 KB",
    "source": "sharepoint",
    "mimeType": "image/png"
  },
  "insertionOptions": {
    "location": {
      "type": "section",
      "sectionId": "company_overview",
      "sectionTitle": "Company Overview"
    },
    "displayOptions": {
      "type": "figure",
      "caption": "Our organizational structure showing key departments and reporting lines"
    }
  }
}
```

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "insertionId": "insert_67890",
    "mediaItem": {
      "id": "sp_file_12345",
      "name": "company-structure.png",
      "type": "image",
      "url": "https://sharepoint.example.com/sites/rfp/documents/company-structure.png",
      "insertedAt": "2025-12-10T10:30:00Z"
    },
    "location": {
      "type": "section",
      "sectionId": "company_overview",
      "sectionTitle": "Company Overview",
      "position": 3
    },
    "displayInfo": {
      "type": "figure",
      "caption": "Our organizational structure showing key departments and reporting lines",
      "figureNumber": 1,
      "renderedHtml": "<figure class='rfp-figure'><img src='...' alt='...' /><figcaption>Figure 1: Our organizational structure showing key departments and reporting lines</figcaption></figure>"
    }
  },
  "message": "Media successfully inserted into RFP",
  "updatedSections": [
    {
      "id": "company_overview", 
      "name": "Company Overview",
      "type": "general",
      "content": "<p>We are a leading technology company...</p><figure class='rfp-figure'><img src='...' alt='...' /><figcaption>Figure 1: Our organizational structure showing key departments and reporting lines</figcaption></figure><p>Our team consists of...</p>",
      "completion_status": "complete",
      "confidence_score": 0.8,
      "word_count": 145,
      "isNewSection": false
    }
  ]
}
```

**Note**: When media insertion creates a new section (e.g., "Images", "Documents", or "Certificates"), the `isNewSection` field should be `true`. The UI will automatically add the new section to the RFP structure.

### Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "error": {
    "code": "INVALID_MEDIA_TYPE",
    "message": "The media type 'video' is not supported for RFP insertion",
    "details": {
      "field": "mediaItem.type",
      "reason": "Only image, document, and certificate types are allowed"
    }
  }
}
```

#### 404 Not Found
```json
{
  "success": false,
  "error": {
    "code": "SECTION_NOT_FOUND",
    "message": "The specified section does not exist in this RFP",
    "details": {
      "field": "insertionOptions.location.sectionId",
      "reason": "Section 'invalid_section' not found in RFP"
    }
  }
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "error": {
    "code": "MEDIA_NOT_ACCESSIBLE",
    "message": "Unable to access the specified media file",
    "details": {
      "field": "mediaItem.url",
      "reason": "SharePoint file permissions insufficient or file no longer exists"
    }
  }
}
```

## Validation Rules

### Media Type Validation
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`
- **Documents**: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`
- **Certificates**: `.pdf`, `.p12`, `.pfx`, `.crt`, `.cer`

### Display Type Validation
- `"figure"` option **only** available for `type: "image"`
- `"inline"` available for **all** media types
- Caption **required** when `displayOptions.type: "figure"`
- Caption should be between 10-500 characters

### Location Validation
- `sectionId` and `sectionTitle` **required** when `location.type: "section"`
- Validate that the section exists in the RFP
- Section must be editable (not locked or finalized)

## Additional API Endpoints

### Get RFP Media Items
```
GET /api/rfp/{rfpId}/media
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "insert_67890",
      "mediaItem": { ... },
      "location": { ... },
      "displayInfo": { ... },
      "insertedAt": "2025-12-10T10:30:00Z"
    }
  ]
}
```

### Remove Media from RFP
```
DELETE /api/rfp/{rfpId}/media/{mediaId}
```

**Response:**
```json
{
  "success": true,
  "message": "Media successfully removed from RFP"
}
```

### Update Media Display Options
```
PATCH /api/rfp/{rfpId}/media/{mediaId}
```

**Request Body:**
```json
{
  "displayOptions": {
    "type": "inline" | "figure",
    "caption": "string"
  }
}
```

## Frontend Integration

The frontend automatically:
1. **File Type Detection**: Categorizes files into Images/Documents/Certificates based on file extension
2. **Source Tagging**: Shows whether files come from SharePoint or Drive
3. **Validation**: Ensures proper form completion before API calls
4. **Error Handling**: Displays user-friendly error messages
5. **Loading States**: Shows progress indicators during API calls

## Business Logic Considerations

1. **Figure Numbering**: Backend should auto-increment figure numbers within each section
2. **Position Management**: Track insertion order within sections for proper rendering
3. **Duplicate Prevention**: Consider preventing duplicate media insertions
4. **Access Control**: Validate user permissions for both RFP and media file access
5. **File Size Limits**: Implement reasonable file size restrictions
6. **Audit Trail**: Log media insertion/removal activities for compliance

## Database Schema Suggestions

```sql
-- Media insertions table
CREATE TABLE rfp_media_insertions (
    id VARCHAR(255) PRIMARY KEY,
    rfp_id VARCHAR(255) NOT NULL,
    media_item_id VARCHAR(255) NOT NULL,
    media_name VARCHAR(500) NOT NULL,
    media_type ENUM('image', 'document', 'certificate') NOT NULL,
    media_url TEXT NOT NULL,
    media_source ENUM('sharepoint', 'drive', 'upload') NOT NULL,
    mime_type VARCHAR(255) NOT NULL,
    location_type ENUM('section', 'separate_page', 'appendix') NOT NULL,
    section_id VARCHAR(255),
    section_title VARCHAR(500),
    position_in_section INT,
    display_type ENUM('inline', 'figure'),
    caption TEXT,
    figure_number INT,
    rendered_html TEXT,
    inserted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    inserted_by VARCHAR(255) NOT NULL,
    INDEX idx_rfp_id (rfp_id),
    INDEX idx_section_id (section_id),
    FOREIGN KEY (rfp_id) REFERENCES rfps(id) ON DELETE CASCADE
);
```