# Past RFP API Endpoints Documentation

This document outlines the three API endpoints required for the Past RFP functionality in the RFP Web Application.

## 1. Get Past RFPs Endpoint

### Endpoint
```
GET /api/v1/rfp/getPastRFPs
```

### Description
Retrieves a list of past RFPs for the authenticated user.

### Request Headers
```
Authorization: Bearer {jwt_token}
X-Tenant-ID: {tenant_id}
Content-Type: application/json
```

### Request Body
No request body required.

### Query Parameters
- `rfpName` (string, optional): The name of the current RFP being created. Used to filter or contextualize the past RFPs list.

### Example Request
```
GET /api/v1/rfp/getPastRFPs?rfpName=New%20Corporate%20Security%20RFP
```

### Response Format

#### Success Response (200 OK)
```json
{
  "rfps": [
    {
      "id": "rfp_001",
      "name": "Downtown Office Complex Security",
      "sections": 8,
      "date": "2024-10-25"
    },
    {
      "id": "rfp_002", 
      "name": "Hospital Security Services RFP",
      "sections": 6,
      "date": "2024-09-15"
    },
    {
      "id": "rfp_003",
      "name": "Retail Mall Security Proposal", 
      "sections": 7,
      "date": "2024-08-30"
    }
  ],
  "success": true,
  "message": "Past RFPs retrieved successfully"
}
```

#### Error Response (403 Forbidden - Subscription Required)
```json
{
  "success": false,
  "detail": "notSubscribed",
  "message": "Subscription required to access past RFPs"
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to retrieve past RFPs",
  "error": "Database connection error"
}
```

---

## 2. Match Structure Endpoint

### Endpoint
```
POST /api/v1/rfp/matchStructure
```

### Description
Matches the structure and tone from a selected past RFP to apply to a new RFP.

### Request Headers
```
Authorization: Bearer {jwt_token}
X-Tenant-ID: {tenant_id}
Content-Type: application/json
```

### Request Body
```json
{
  "rfpId": "rfp_001",
  "sessionId": "session_12345",
  "rfpName": "New Corporate Security RFP"
}
```

### Request Body Parameters
- `rfpId` (string): The ID of the past RFP to match structure from
- `sessionId` (string): Current session ID for the new RFP
- `rfpName` (string): Name of the new RFP being created

### Response Format

#### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Structure and tone matched successfully",
  "matchedStructure": {
    "sections": [
      {
        "name": "Executive Summary",
        "type": "introduction",
        "order": 1
      },
      {
        "name": "Company Background",
        "type": "company_info", 
        "order": 2
      },
      {
        "name": "Proposed Security Solution",
        "type": "solution_overview",
        "order": 3
      },
      {
        "name": "Staffing Plan",
        "type": "staffing",
        "order": 4
      },
      {
        "name": "Technology & Equipment",
        "type": "technology",
        "order": 5
      },
      {
        "name": "Pricing Structure", 
        "type": "pricing",
        "order": 6
      },
      {
        "name": "Implementation Timeline",
        "type": "timeline",
        "order": 7
      },
      {
        "name": "References and Qualifications",
        "type": "references",
        "order": 8
      }
    ],
    "tone": "professional_formal",
    "style": "detailed_technical"
  }
}
```

#### Error Response (404 Not Found)
```json
{
  "success": false,
  "message": "Past RFP not found",
  "error": "No RFP found with ID: rfp_001"
}
```

#### Error Response (403 Forbidden - Subscription Required)
```json
{
  "success": false,
  "detail": "notSubscribed", 
  "message": "Subscription required to match RFP structure"
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to match RFP structure",
  "error": "AI service unavailable"
}
```

---

## 3. Get RFP Sections Endpoint

### Endpoint
```
GET /api/v1/rfp/getRFPSections
```

### Description
Retrieves all sections from a specific past RFP for selective import.

### Request Headers
```
Authorization: Bearer {jwt_token}
X-Tenant-ID: {tenant_id}
Content-Type: application/json
```

### Query Parameters
- `rfpId` (string, required): The ID of the past RFP to get sections from

### Example Request
```
GET /api/v1/rfp/getRFPSections?rfpId=rfp_001
```

### Response Format

#### Success Response (200 OK)
```json
{
  "sections": [
    {
      "id": "section_001",
      "name": "Executive Summary",
      "content": "Our company provides comprehensive security solutions..."
    },
    {
      "id": "section_002",
      "name": "Company Background",
      "content": "Established in 1995, our security firm has..."
    },
    {
      "id": "section_003", 
      "name": "Proposed Security Solution",
      "content": "We propose a multi-layered security approach..."
    },
    {
      "id": "section_004",
      "name": "Staffing Plan", 
      "content": "Our staffing model includes certified security personnel..."
    },
    {
      "id": "section_005",
      "name": "Technology & Equipment",
      "content": "State-of-the-art security technology including..."
    },
    {
      "id": "section_006",
      "name": "Pricing Structure",
      "content": "Our competitive pricing model offers..."
    }
  ],
  "success": true,
  "rfpId": "rfp_001",
  "rfpName": "Downtown Office Complex Security",
  "message": "RFP sections retrieved successfully"
}
```

#### Error Response (404 Not Found)
```json
{
  "success": false,
  "message": "RFP not found",
  "error": "No RFP found with ID: rfp_001"
}
```

#### Error Response (403 Forbidden - Subscription Required)
```json
{
  "success": false,
  "detail": "notSubscribed",
  "message": "Subscription required to access RFP sections"
}
```

#### Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Missing required parameter: rfpId"
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to retrieve RFP sections",
  "error": "Database query failed"
}
```

---

## 4. Import Selected Sections Endpoint

### Endpoint
```
POST /api/v1/rfp/importSelectedSections
```

### Description
Imports selected sections from a past RFP into the current RFP. If a section with the same name exists in the current RFP, it replaces the content. If the section doesn't exist, it creates a new section.

### Request Headers
```
Authorization: Bearer {jwt_token}
X-Tenant-ID: {tenant_id}
Content-Type: application/json
```

### Request Body
```json
{
  "sessionId": "session_12345",
  "rfpName": "Current RFP Name",
  "selectedSections": [
    {
      "id": "section_001",
      "name": "Executive Summary",
      "content": "Our company provides comprehensive security solutions..."
    },
    {
      "id": "section_003",
      "name": "Proposed Security Solution", 
      "content": "We propose a multi-layered security approach..."
    }
  ]
}
```

### Request Body Parameters
- `sessionId` (string): Current session ID for the RFP being worked on
- `rfpName` (string): Name of the current RFP
- `selectedSections` (array): Array of selected sections to import
  - `id` (string): Section ID from the past RFP
  - `name` (string): Section name
  - `content` (string, optional): Section content

### Response Format

#### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Successfully imported 2 sections (1 updated, 1 created)",
  "updatedSections": [
    {
      "id": "existing_section_001",
      "name": "Executive Summary",
      "type": "introduction",
      "content": "Our company provides comprehensive security solutions...",
      "completion_status": "complete",
      "confidence_score": 95,
      "word_count": 250,
      "completion_notes": "Content replaced with past RFP version",
      "needs_response": false,
      "section_order": 1,
      "isNewSection": false
    },
    {
      "id": "new_section_003", 
      "name": "Proposed Security Solution",
      "type": "solution_overview",
      "content": "We propose a multi-layered security approach...",
      "completion_status": "complete",
      "confidence_score": 90,
      "word_count": 420,
      "completion_notes": "New section created from past RFP",
      "needs_response": false,
      "section_order": 3,
      "isNewSection": true
    }
  ],
  "operation": "mixed"
}
```

#### Error Response (404 Not Found)
```json
{
  "success": false,
  "message": "Current RFP session not found",
  "error": "No active RFP session found for session ID: session_12345"
}
```

#### Error Response (403 Forbidden - Subscription Required)
```json
{
  "success": false,
  "detail": "notSubscribed",
  "message": "Subscription required to import RFP sections"
}
```

#### Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Invalid request: selectedSections cannot be empty"
}
```

#### Error Response (500 Internal Server Error)
```json
{
  "success": false,
  "message": "Failed to import sections",
  "error": "Database update failed"
}
```

### Response Fields
- `success` (boolean): Indicates if the operation was successful
- `message` (string): Human-readable status message
- `updatedSections` (array): Array of sections that were created or updated
- `operation` (string): Type of operation performed
  - `"sections_updated"`: Only existing sections were updated
  - `"new_section_created"`: Only new sections were created  
  - `"mixed"`: Both updates and creations occurred

### Backend Implementation Requirements
1. **Session Validation**: Verify the session exists and belongs to the authenticated user
2. **Content Processing**: Clean and validate the imported section content
3. **Section Matching**: Match sections by name to determine update vs create operations
4. **Database Updates**: Update existing sections or create new ones as needed
5. **Response Generation**: Return detailed information about what was changed
6. **Error Handling**: Proper validation and error responses

### Sample Backend Logic Flow
1. Validate authentication and session
2. Check user subscription status
3. Retrieve current RFP sections for the session
4. For each selected section:
   - Check if a section with the same name exists
   - If exists: Update content and metadata
   - If not exists: Create new section
5. Save changes to database
6. Return success response with updated sections

---

## Data Models

### PastRFP Model
```typescript
interface PastRFP {
  id: string;           // Unique identifier for the RFP
  name: string;         // Display name of the RFP
  sections: number;     // Number of sections in the RFP
  date: string;         // Creation/completion date (YYYY-MM-DD)
}
```

### RFPSection Model
```typescript
interface RFPSection {
  id: string;           // Unique identifier for the section
  name: string;         // Section name/title
  content?: string;     // Section content (optional, may be truncated)
}
```

### MatchedStructure Model
```typescript
interface MatchedStructure {
  sections: Array<{
    name: string;       // Section name
    type: string;       // Section type/category
    order: number;      // Display order
  }>;
  tone: string;         // Writing tone (e.g., "professional_formal")
  style: string;        // Writing style (e.g., "detailed_technical")
}
```

---

## Authentication & Authorization

All endpoints require:
1. Valid JWT token in the Authorization header
2. Tenant ID in the X-Tenant-ID header
3. Active subscription for accessing past RFP features

## Error Handling

The frontend handles the following error scenarios:
- **Network errors**: Display "Unable to connect to server" message
- **Subscription errors (403)**: Show subscription upgrade prompt
- **General errors**: Display specific error messages from the API
- **Loading states**: Show progress indicators during API calls

## Integration Notes

1. The `UsePastRFPDialog` component automatically calls `/getPastRFPs` when opened
2. When "Match Structure & Tone" is selected, `/matchStructure` is called
3. When "Import Selected Sections" is chosen, `/getRFPSections` is called to load the section list
4. All API calls include proper error handling for subscription requirements
5. The component supports loading states and displays appropriate user feedback