import type { Configuration } from "@azure/msal-browser";
import type { PopupRequest } from "@azure/msal-browser";

/**
 * MSAL Configuration for Azure AD Authentication
 * 
 * This configuration enables:
 * - Multi-tenant login (any Azure AD organization)
 * - Personal Microsoft account login
 * - Automatic tenant ID extraction after login
 */
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_AD_CLIENT_ID || "",
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_AD_TENANT_ID || "common"}`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "localStorage", // Store tokens in localStorage for persistence
    storeAuthStateInCookie: false, // Set to true if you need IE11/Edge support
  },
};

/**
 * Login request configuration
 * 
 * Scopes:
 * - Backend API scope: Access to your backend API
 * 
 * NOTE: We request ONLY the backend API scope because Azure AD can only 
 * issue tokens for one resource (audience) at a time. If you need User.Read 
 * for Microsoft Graph, request it separately when needed.
 * 
 * IMPORTANT: Directory roles (wids) are automatically included if the user has
 * admin roles in their organization. No special scopes needed.
 */
export const loginRequest: PopupRequest = {
  scopes: [
    import.meta.env.VITE_BACKEND_API_SCOPE || "api://d0f18278-e40b-4547-8da0-7992d2b22b70/Access_as_user"
  ].filter(Boolean), // Remove empty strings if env var not set
};

/**
 * Microsoft Graph request configuration
 * Used to fetch user's directory roles via Graph API
 */
export const graphRequest: PopupRequest = {
  scopes: ["User.Read", "Directory.Read.All"]
};

/**
 * SharePoint/OneDrive request configuration
 * Used for SharePoint and OneDrive file access
 */
export const sharePointRequest: PopupRequest = {
  scopes: [
    "Files.Read",
    "Files.Read.All", 
    "Sites.Read.All",
    "User.Read"
  ]
};
