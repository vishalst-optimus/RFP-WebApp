# SharePoint Integration

This document explains how the SharePoint integration works in the RFP Web App and how to use it.

## Overview

The SharePoint integration allows users to:
- Connect to their Microsoft account (the same one they use to log into the app)
- Browse OneDrive and SharePoint files
- Select and insert files into their RFP documents
- Search for files across their SharePoint sites

## Components

### 1. SharePoint Service (`services/sharePointService.ts`)
Handles all Microsoft Graph API interactions:
- Authentication using MSAL tokens
- OneDrive file browsing
- SharePoint site access
- File search functionality
- File download capabilities

### 2. SharePoint Hook (`hooks/useSharePoint.ts`)
React hook that provides:
- Connection state management
- File and folder navigation
- Error handling
- Loading states

### 3. UI Components

#### ConnectCloudStorageDialog (`components/Media/ConnectCloudStorageDialog.tsx`)
- Shows connection status for SharePoint and other cloud providers
- Handles initial SharePoint connection
- Displays user account information

#### SharePointFilePicker (`components/Media/SharePointFilePicker.tsx`)
- Browse OneDrive and SharePoint files
- Search functionality
- File type filtering
- Multi-file selection
- Breadcrumb navigation

#### MediaLibraryDialog (`components/Media/MediaLibraryDialog.tsx`)
- Main media library interface
- Integrates SharePoint file picker
- Displays files from various sources

## Required Permissions

The application requires the following Microsoft Graph API scopes:
- `Files.Read` - Read user files
- `Files.Read.All` - Read all files user can access
- `Sites.Read.All` - Read SharePoint sites
- `User.Read` - Read user profile

These scopes are automatically requested when the user first accesses SharePoint functionality.

## Setup and Configuration

### 1. Azure App Registration
Ensure your Azure AD app registration includes:
- Redirect URI pointing to your application
- API permissions for Microsoft Graph (the scopes listed above)
- Appropriate platform configuration (SPA/Web)

### 2. Environment Variables
The application uses the following environment variables from your auth configuration:
- `VITE_AZURE_AD_CLIENT_ID`
- `VITE_AZURE_AD_TENANT_ID`

### 3. MSAL Configuration
The SharePoint service automatically uses the same MSAL instance configured for the main application authentication.

## Usage Flow

1. **User Authentication**: User must be logged in with their Microsoft account
2. **SharePoint Connection**: Click on "Cloud Drives" in Media Library
3. **Connect SharePoint**: If not already connected, click "Connect SharePoint"
4. **Browse Files**: Click "Browse SharePoint Files" to open the file picker
5. **File Selection**: Navigate folders, search, and select files
6. **Insert Files**: Selected files are inserted into the media library

## File Type Support

The SharePoint integration supports filtering by file types:
- Images (`image/*`)
- Documents (`.pdf`, `.doc`, `.docx`)
- Custom MIME type filtering

## Error Handling

The integration includes comprehensive error handling for:
- Authentication failures
- Network connectivity issues
- Permission errors
- File access restrictions

## Technical Details

### Authentication Flow
1. Uses existing MSAL instance from main app
2. Requests additional scopes for SharePoint access
3. Handles token refresh automatically
4. Supports both silent and interactive token acquisition

### API Endpoints Used
- `/me` - Get current user information
- `/me/drive` - Access user's OneDrive
- `/sites` - List SharePoint sites
- `/drives/{id}/items` - Browse drive contents
- `/me/drive/search` - Search for files

### File Operations
- **Browse**: List files and folders in drives
- **Search**: Global search across user's files
- **Download**: Get file content via download URL
- **Navigation**: Folder-based navigation with breadcrumbs

## Troubleshooting

### Common Issues

1. **"No authenticated user found"**
   - Ensure user is logged into the main application
   - Check MSAL instance initialization

2. **Permission errors**
   - Verify Azure app registration has required Graph API permissions
   - Check if admin consent is required for your organization

3. **Token acquisition failures**
   - Check network connectivity
   - Verify app registration configuration
   - Try interactive login (popup will appear)

### Debug Information

Enable console logging to see:
- SharePoint service initialization
- Token acquisition attempts
- API request details
- Error messages

## Future Enhancements

Potential improvements:
- Support for SharePoint document libraries
- Real-time file upload to SharePoint
- Advanced search filters
- File versioning support
- Collaborative features