import axios from 'axios';
import type { AnalysisData } from '../types';
import { msalInstance } from '../main';
import { loginRequest } from '../authConfig';

// Types for API responses
interface PricingSection {
  id: string;
  name: string;
  content?: string;
  isPricingRelated: boolean;
}

// Types for RFP Management
interface UserRFP {
  RFP_Name: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  exportedAt?: string;
  sectionsCount: number;
  isExported: boolean;
  confidenceScore: number;
}

interface UserRFPsResponse {
  rfps: UserRFP[];
  success: boolean;
  message?: string;
}

interface RFPData {
  RFP_Name: string;
  sessionId: string;
  sections: Array<{
    SectionName: string;
    Content: string;
    Image: string;
    Confidence: number;
  }>;
  isExported: boolean;
  confidenceScore: number;
  createdAt: string;
  updatedAt: string;
  exportedAt?: string;
}

interface LoadRFPResponse {
  data: {
    rfpName: string;
    sessionId: string;
    sections: Record<string, any>;
    analysisData?: any;
    status: string;
    createdAt: string;
    updatedAt: string;
    exportedAt?: string;
  };
  success: boolean;
  message?: string;
}

// Types for Past RFP functionality
interface PastRFP {
  id: string;
  name: string;
  sections: number;
  date: string;
}

interface PastRFPsResponse {
  rfps: PastRFP[];
  success: boolean;
  message?: string;
}

interface MatchStructureResponse {
  success: boolean;
  message: string;
  matchedStructure?: {
    sections: Array<{
      name: string;
      type: string;
      order: number;
    }>;
    tone: string;
    style: string;
  };
  createdSections?: Array<{
    name: string;
    content: string;
    type: string;
    order: number;
    tone: string;
    style: string;
    operation: 'updated' | 'added';
  }>;
  currentRfpName?: string;
  sectionsUpdated?: number;
  sectionsAdded?: number;
  failedSections?: any[];
}

interface RFPSection {
  id: string;
  name: string;
  content?: string;
}

interface RFPSectionsResponse {
  sections: RFPSection[];
  success: boolean;
  rfpId: string;
  rfpName: string;
  message?: string;
}

interface ImportSectionsRequest {
  sessionId: string;
  rfpName: string;
  currentRfpName: string;
  selectedSections: Array<{
    id: string;
    name: string;
  }>;
}

interface ImportSectionsResponse {
  message: string;
  success: boolean;
  updatedSections: Array<{
    id: string;
    name: string;
    type: string;
    content: string;
    completion_status: "empty" | "partial" | "complete";
    isNewSection: boolean;
  }>;
  operation: "sections_updated" | "new_section_created" | "mixed";
}

interface PricingSectionResponse {
  sections: PricingSection[];
  success: boolean;
}

interface PricingTableData {
  rfpName: string;
  currency: string;
  items: Array<{
    id: string;
    category: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  notes?: string;
  sessionId?: string;
  selectedSections?: string[];
  sectionName?: string;
}

// Interface for file table data (Excel/CSV uploads)
interface FileTableData {
  rfpName: string;
  sessionId: string;
  selectedSections?: string[];
  sectionName?: string;
  fileName?: string;
  tableData: any[]; // Raw JSON from xlsx library - preserves all columns
  notes?: string;
}

interface PricingTableResponse {
  message: string;
  success: boolean;
  updatedSections: Array<{
    id: string;
    name: string;
    type: string;
    content: string;
    completion_status: "empty" | "partial" | "complete";
    confidence_score: number;
    word_count: number;
    completion_notes?: string;
    needs_response?: boolean;
    section_order?: number;
    isNewSection: boolean;
  }>;
  operation: "sections_updated" | "new_section_created" | "mixed";
}

// Custom error class for subscription-related errors
export class SubscriptionRequiredError extends Error {
  constructor(message: string = 'Subscription required to access this feature') {
    super(message);
    this.name = 'SubscriptionRequiredError';
  }
}

// const BACKEND_URL = 'https://ca-rfp-dev-cc-01.livelyfield-8735fca8.canadacentral.azurecontainerapps.io'; 
// const BACKEND_URL = 'http://127.0.0.1:8000'; 
const BACKEND_URL = 'https://ca-rfpsaas-eus2-prod-001.mangocliff-47186dbe.eastus2.azurecontainerapps.io'; // Use relative URLs so Vite proxy handles the routing 

export const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 300000, // 5 minutes for long operations
});

// Request interceptor for authentication with silent token refresh
api.interceptors.request.use(
  async (config) => {
    // Skip Azure AD authentication for Google Drive endpoints
    if (config.url?.includes('google-drive') || config.headers?.['Skip-Azure-Auth'] === 'true') {
      console.log(`🔐 API Request (Google Drive): ${config.method?.toUpperCase()} ${config.url}`);
      console.log('⏭️ Skipping Azure AD authentication for Google Drive endpoint');
      return config;
    }

    const accounts = msalInstance.getAllAccounts();
    
    console.log(`🔐 API Request: ${config.method?.toUpperCase()} ${config.url}`);
    console.log(`👥 Accounts found: ${accounts.length}`);
    
    if (accounts.length === 0) {
      console.error('❌ No authenticated accounts found!');
      throw new Error('User not authenticated. Please log in.');
    }
    
    try {
      console.log('🔄 Acquiring token silently...');
      // Silent token acquisition - automatically refreshes if expired
      const response = await msalInstance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
      
      console.log('✅ Token acquired successfully');
      console.log(`📋 Token audience: ${(response as any).idTokenClaims?.aud}`);
      console.log(`🔑 Token scopes: ${response.scopes?.join(', ')}`);
      
      // Add authorization header
      config.headers.Authorization = `Bearer ${response.accessToken}`;
      
      // Add tenant ID header (null for personal accounts)
      const tenantId = accounts[0].tenantId || null;
      config.headers['X-Tenant-ID'] = tenantId || 'none';
      
      console.log(`✅ Request configured with auth headers`);
      
    } catch (error: any) {
      // If silent token acquisition fails, try interactive login
      console.error('❌ Silent token acquisition failed:', error.name, error.message);
      console.log('🔄 Attempting interactive token acquisition...');
      
      try {
        const response = await msalInstance.acquireTokenPopup(loginRequest);
        config.headers.Authorization = `Bearer ${response.accessToken}`;
        config.headers['X-Tenant-ID'] = accounts[0].tenantId || 'none';
        console.log('✅ Token acquired via popup');
      } catch (popupError) {
        console.error('❌ Token acquisition failed completely:', popupError);
        throw popupError;
      }
    }
    
    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for token expiration handling
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If 401 and we haven't retried yet, try to refresh token
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0) {
        try {
          const response = await msalInstance.acquireTokenPopup(loginRequest);
          originalRequest.headers.Authorization = `Bearer ${response.accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          // If refresh fails, logout user
          msalInstance.logoutPopup();
          return Promise.reject(refreshError);
        }
      }
    }
    
    return Promise.reject(error);
  }
);

export const rfpApi = {
  // Analyze RFP document
  // RFP Management APIs
  getUserRFPs: async (): Promise<UserRFPsResponse> => {
    try {
      const response = await api.get('/api/v1/rfps/user');
      return response.data;
    } catch (error: any) {
      console.error('Error fetching user RFPs:', error);
      if (error.response?.status === 402 && error.response?.data?.requires_subscription) {
        throw new SubscriptionRequiredError(error.response.data.message || 'Subscription required');
      }
      throw new Error(error.response?.data?.message || 'Failed to fetch RFPs');
    }
  },

  loadRFP: async (sessionId: string): Promise<LoadRFPResponse> => {
    try {
      const response = await api.get(`/api/v1/rfps/${sessionId}`);
      return response.data;
    } catch (error: any) {
      console.error('Error loading RFP:', error);
      if (error.response?.status === 402 && error.response?.data?.requires_subscription) {
        throw new SubscriptionRequiredError(error.response.data.message || 'Subscription required');
      }
      throw new Error(error.response?.data?.message || 'Failed to load RFP');
    }
  },

  analyzeRFP: async (file: File, sessionId: string, rfpName?: string): Promise<AnalysisData> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    
    // Send RFP name (consistent with other endpoints) - ensure it's never empty
    const rfpNameValue = rfpName && rfpName.trim() ? rfpName.trim() : 'Default RFP';
    formData.append('rfp_name', rfpNameValue);
    
    // Send the original file name for reference
    formData.append('rfp_file_name', file.name);

    try {
      const response = await api.post('/api/v1/rfp/analyze', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error: any) {
      console.log('🚨 Analyze error caught in API:', error);
      
      // Handle subscription-related errors (403 status - flexible response format)
      if (error.response?.status === 403) {
        console.log('🚨 403 error detected - checking for subscription error patterns');
        const responseData = error.response.data;
        
        // Check for different possible response formats
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          console.log('🚨 Detected subscription error - throwing SubscriptionRequiredError');
          throw new SubscriptionRequiredError('Subscription required to analyze RFP documents');
        }
      }
      
      throw error;
    }
  },

  // Analyze RFP from Google Drive
  analyzeGoogleDriveRFP: async (
    fileId: string, 
    fileName: string, 
    downloadUrl: string, 
    sessionId: string, 
    rfpName?: string
  ): Promise<AnalysisData> => {
    const payload = {
      google_drive_file_id: fileId,
      file_name: fileName,
      google_drive_download_url: downloadUrl,
      session_id: sessionId,
      rfp_name: rfpName && rfpName.trim() ? rfpName.trim() : 'Default RFP'
    };

    try {
      const response = await api.post('/api/v1/rfp/analyze-google-drive', payload, {
        headers: {
          'Content-Type': 'application/json',
          'Skip-Azure-Auth': 'true', // Explicitly skip Azure AD authentication
        },
      });

      return response.data;
    } catch (error: any) {
      console.log('🚨 Google Drive analyze error caught in API:', error);
      
      // Handle subscription-related errors (403 status)
      if (error.response?.status === 403) {
        console.log('🚨 403 error detected - checking for subscription error patterns');
        const responseData = error.response.data;
        
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          console.log('🚨 Detected subscription error - throwing SubscriptionRequiredError');
          throw new SubscriptionRequiredError('Subscription required to analyze RFP documents');
        }
      }
      
      throw error;
    }
  },

  // Generate draft for a section (streaming)
  generateDraft: async (
    sessionId: string,
    userId: string,
    prompt: string,
    sectionName: string,
    sectionType: string,
    action: 'generate' | 'edit' | 'regenerate' = 'generate',
    onChunk: (chunk: string) => void,
    rfpName?: string
  ): Promise<void> => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('prompt_id', crypto.randomUUID());
    formData.append('prompt', prompt);
    formData.append('user_id', userId);
    formData.append('action', action);
    formData.append('section_name', sectionName);
    formData.append('section_type', sectionType);

    // Send RFP name (same as analyze endpoint) - ensure it's never empty to prevent None in backend
    const rfpNameValue = rfpName && rfpName.trim() ? rfpName.trim() : 'Default RFP';
    formData.append('rfp_name', rfpNameValue);

    // Get token for fetch request (axios interceptor doesn't work with fetch)
    const accounts = msalInstance.getAllAccounts();
    let headers: HeadersInit = {};
    
    if (accounts.length > 0) {
      try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        headers = {
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
          'X-Tenant-ID': accounts[0].tenantId || 'none',
        };
      } catch (error) {
        console.error('Failed to acquire token for streaming:', error);
      }
    }

    const response = await fetch(`${BACKEND_URL}/api/v1/rfp/populate`, {
      method: 'POST',
      body: formData,
      headers,
    });

    // Handle subscription errors for fetch requests
    if (response.status === 403) {
      const responseData = await response.json().catch(() => ({}));
      console.log('🚨 403 error in generateDraft - response data:', responseData);
      
      const isSubscriptionError = 
        responseData?.detail === 'notSubscribed' ||
        responseData?.message?.toLowerCase().includes('subscription') ||
        responseData?.message?.toLowerCase().includes('no subscriptions found') ||
        !responseData?.hasSubscription;
        
      if (isSubscriptionError) {
        console.log('🚨 Detected subscription error in generateDraft - throwing SubscriptionRequiredError');
        throw new SubscriptionRequiredError('Subscription required to generate RFP content');
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body reader available');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Process each line from the stream
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            onChunk(line + '\n');
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  // Regenerate/edit section (streaming) - uses /regenerate endpoint
  regenerateSection: async (
    sessionId: string,
    userId: string,
    prompt: string,
    sectionName: string,
    sectionType: string,
    action: 'edit' | 'regenerate',
    onChunk: (chunk: string) => void,
    rfpName?: string
  ): Promise<void> => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('prompt_id', crypto.randomUUID());
    formData.append('prompt', prompt);
    formData.append('user_id', userId);
    formData.append('action', action);
    formData.append('section_name', sectionName);
    formData.append('section_type', sectionType);

    // Send RFP name (same as analyze/populate endpoints) - ensure it's never empty to prevent None in backend
    const rfpNameValue = rfpName && rfpName.trim() ? rfpName.trim() : 'Default RFP';
    formData.append('rfp_name', rfpNameValue);

    // Get token for fetch request (axios interceptor doesn't work with fetch)
    const accounts = msalInstance.getAllAccounts();
    let headers: HeadersInit = {};
    
    if (accounts.length > 0) {
      try {
        const tokenResponse = await msalInstance.acquireTokenSilent({
          ...loginRequest,
          account: accounts[0],
        });
        headers = {
          'Authorization': `Bearer ${tokenResponse.accessToken}`,
          'X-Tenant-ID': accounts[0].tenantId || 'none',
        };
      } catch (error) {
        console.error('Failed to acquire token for streaming:', error);
      }
    }

    const response = await fetch(`${BACKEND_URL}/api/v1/rfp/regenerate`, {
      method: 'POST',
      body: formData,
      headers,
    });

    // Handle subscription errors for fetch requests
    if (response.status === 403) {
      const responseData = await response.json().catch(() => ({}));
      console.log('🚨 403 error in regenerateSection - response data:', responseData);
      
      const isSubscriptionError = 
        responseData?.detail === 'notSubscribed' ||
        responseData?.message?.toLowerCase().includes('subscription') ||
        responseData?.message?.toLowerCase().includes('no subscriptions found') ||
        !responseData?.hasSubscription;
        
      if (isSubscriptionError) {
        console.log('🚨 Detected subscription error in regenerateSection - throwing SubscriptionRequiredError');
        throw new SubscriptionRequiredError('Subscription required to regenerate RFP content');
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('No response body reader available');
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Process each line from the stream
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            onChunk(line + '\n');
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  // Generate professional Word document
  generateDocument: async (
    sessionId: string,
    sectionDrafts: Record<string, any>,
    rfpName: string
  ): Promise<{ content: ArrayBuffer; stats: { processingTime: string; documentSize: string; sectionsProcessed: string } }> => {
    // Send RFP name (same as analyze/populate endpoints) - ensure it's never empty to prevent None in backend
    const rfpNameValue = rfpName && rfpName.trim() ? rfpName.trim() : 'Default RFP';
    
    const rfpData = {
      rfp_name: rfpNameValue,
      metadata: {
        document_type: "RFP Response",
        analysis_date: new Date().toISOString().split('T')[0],
        total_sections: Object.keys(sectionDrafts).length, // Will be determined by backend based on rfp_name
      }
    };

    console.log('📝 Generating document with data:', rfpData);

    try {
      const response = await api.post('/api/v1/rfp/generate-document', rfpData, {
        responseType: 'arraybuffer',
        timeout: 300000, // 5 minutes for large documents
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const stats = {
        processingTime: response.headers['x-processing-time'] || 'Unknown',
        documentSize: response.headers['x-document-size'] || 'Unknown',
        sectionsProcessed: response.headers['x-sections-processed'] || 'Unknown',
      };

      return {
        content: response.data,
        stats,
      };
    } catch (error: any) {
      console.log('🚨 Document generation error caught in API:', error);
      
      // Handle subscription-related errors (403 status - flexible response format)
      if (error.response?.status === 403) {
        console.log('🚨 403 error detected - checking for subscription error patterns');
        const responseData = error.response.data;
        
        // Check for different possible response formats
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          console.log('🚨 Detected subscription error - throwing SubscriptionRequiredError');
          throw new SubscriptionRequiredError('Subscription required to generate documents');
        }
      }
      
      throw error;
    }
  },

  // Upload multiple knowledge base documents
  uploadKnowledgeBaseDocuments: async (
    files: File[],
    tenantId: string
  ): Promise<{ message: string; uploaded_files: string[]; tenant_id: string }> => {
    const formData = new FormData();
    
    // Add tenant_id to form data
    formData.append('tenant_id', "2001");
    
    // Add all files to form data
    files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const response = await api.post('/api/v1/rfp/upload-multiple', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 600000, // 10 minutes for large file uploads
      });

      return response.data;
    } catch (error: any) {
      console.log('🚨 Upload error caught in API:', error);
      console.log('🚨 Error code:', error.code);
      console.log('🚨 Error message:', error.message);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      console.log('🚨 Error response headers:', error.response?.headers);
      
      // Handle network errors specifically
      if (error.code === 'ERR_NETWORK') {
        console.log('🚨 Network error detected - backend may not be running');
        throw new Error('Unable to connect to server. Please check if the backend is running on http://127.0.0.1:8000');
      }
      
      // Handle subscription-related errors (403 status - flexible response format)
      if (error.response?.status === 403) {
        console.log('🚨 403 error detected - checking for subscription error patterns');
        const responseData = error.response.data;
        
        // Check for different possible response formats
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          console.log('🚨 Detected subscription error - throwing SubscriptionRequiredError');
          throw new SubscriptionRequiredError('Subscription required to upload knowledge base documents');
        }
      }
      
      console.log('🚨 Other error - re-throwing original error');
      throw error;
    }
  },

  // Update section content to Cosmos DB (batch update to prevent race conditions)
  updateSectionContentToCosmos: async (
    rfpName: string,
    sections: Array<{ title: string; content: string; type?: string }>
  ): Promise<{ message: string; success: boolean; sections_updated: number }> => {
    const requestData = {
      rfp_name: rfpName,
      sections: sections.map(section => ({
        section_title: section.title,
        section_content: section.content,
        section_type: section.type || 'unknown'
      }))
    };

    try {
      console.log(`🔄 Updating ${sections.length} sections to Cosmos DB for RFP: ${rfpName}`);
      
      const response = await api.post('/api/v1/rfp/updateSectionContentToCosmos', requestData, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log(`✅ Successfully updated ${sections.length} sections to Cosmos DB`);
      return response.data;
    } catch (error: any) {
      console.log('🚨 Cosmos update error caught in API:', error);
      
      // Handle subscription-related errors (403 status - flexible response format)
      if (error.response?.status === 403) {
        console.log('🚨 403 error detected - checking for subscription error patterns');
        const responseData = error.response.data;
        
        // Check for different possible response formats
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          console.log('🚨 Detected subscription error - throwing SubscriptionRequiredError');
          throw new SubscriptionRequiredError('Subscription required to save section content to database');
        }
      }
      
      throw error;
    }
  },

  // TEST FUNCTION: Simulate subscription error (remove this in production)
  testSubscriptionError: async (): Promise<never> => {
    console.log('🧪 Simulating subscription error for testing');
    const mockError = {
      response: {
        status: 403,
        data: { detail: 'notSubscribed' }
      }
    };
    // Simulate the same error handling logic
    throw new SubscriptionRequiredError('Subscription required to upload knowledge base documents');
  },

  // Get pricing/cost related sections for section selection
  getPricingSections: async (sessionId: string, rfpName: string): Promise<PricingSectionResponse> => {
    try {
      const response = await api.get(`/api/v1/rfp/getPricingSections`, {
        params: {
          sessionId,
          rfpName
        }
      });
      return response.data;
    } catch (error: any) {
      console.log('🚨 Get pricing sections error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      throw error;
    }
  },

  // Submit pricing table data to be included in RFP document
  submitPricingTable: async (pricingData: PricingTableData): Promise<PricingTableResponse> => {
    try {
      const response = await api.post('/api/v1/rfp/pricingTable', pricingData);
      return response.data;
    } catch (error: any) {
      console.log('🚨 Pricing table submission error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      // Handle subscription-related errors
      if (error.response?.status === 403) {
        const responseData = error.response.data;
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          throw new SubscriptionRequiredError('Subscription required to add pricing tables to RFP');
        }
      }
      
      throw error;
    }
  },

  // Submit file table data (Excel/CSV) to be included in RFP document
  submitFileTable: async (fileTableData: FileTableData): Promise<PricingTableResponse> => {
    try {
      const response = await api.post('/api/v1/rfp/fileTable', fileTableData);
      return response.data;
    } catch (error: any) {
      console.log('🚨 File table submission error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      // Handle subscription-related errors
      if (error.response?.status === 403) {
        const responseData = error.response.data;
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          throw new SubscriptionRequiredError('Subscription required to add file tables to RFP');
        }
      }
      
      throw error;
    }
  },

  // Get list of past RFPs for the user
  getPastRFPs: async (rfpName?: string): Promise<PastRFPsResponse> => {
    try {
      // Send RFP name (same as other endpoints) - ensure it's never empty to prevent None in backend
      const rfpNameValue = rfpName && rfpName.trim() ? rfpName.trim() : 'Default RFP';
      
      const response = await api.get('/api/v1/rfp/getPastRFPs', {
        params: {
          rfpName: rfpNameValue
        }
      });
      return response.data;
    } catch (error: any) {
      console.log('🚨 Get past RFPs error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      // Handle subscription-related errors
      if (error.response?.status === 403) {
        const responseData = error.response.data;
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          throw new SubscriptionRequiredError('Subscription required to access past RFPs');
        }
      }
      
      throw error;
    }
  },

  // Match structure and tone from a past RFP
  matchStructure: async (rfpId: string, sessionId: string, rfpName: string, currentRfpName: string): Promise<MatchStructureResponse> => {
    try {
      const requestData = {
        rfpId,
        sessionId,
        rfpName,
        currentRfpName
      };
      
      const response = await api.post('/api/v1/rfp/matchStructure', requestData);
      return response.data;
    } catch (error: any) {
      console.log('🚨 Match structure error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      // Handle subscription-related errors
      if (error.response?.status === 403) {
        const responseData = error.response.data;
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          throw new SubscriptionRequiredError('Subscription required to match RFP structure');
        }
      }
      
      throw error;
    }
  },

  // Get sections from a specific past RFP
  getRFPSections: async (rfpId: string): Promise<RFPSectionsResponse> => {
    try {
      const response = await api.get(`/api/v1/rfp/getRFPSections`, {
        params: { rfpId }
      });
      return response.data;
    } catch (error: any) {
      console.log('🚨 Get RFP sections error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      // Handle subscription-related errors
      if (error.response?.status === 403) {
        const responseData = error.response.data;
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          throw new SubscriptionRequiredError('Subscription required to access RFP sections');
        }
      }
      
      throw error;
    }
  },

  // Import selected sections from past RFP to current RFP
  importSelectedSections: async (importData: ImportSectionsRequest): Promise<ImportSectionsResponse> => {
    try {
      const response = await api.post('/api/v1/rfp/importSelectedSections', importData);
      return response.data;
    } catch (error: any) {
      console.log('🚨 Import selected sections error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      // Handle subscription-related errors
      if (error.response?.status === 403) {
        const responseData = error.response.data;
        const isSubscriptionError = 
          responseData?.detail === 'notSubscribed' ||
          responseData?.message?.toLowerCase().includes('subscription') ||
          responseData?.message?.toLowerCase().includes('no subscriptions found') ||
          !responseData?.hasSubscription;
          
        if (isSubscriptionError) {
          throw new SubscriptionRequiredError('Subscription required to import RFP sections');
        }
      }
      
      throw error;
    }
  },

  // Upload files to blob storage
  uploadFilesToBlob: async (rfpName: string, files: File[], mediaType: 'image' | 'document' | 'certificate'): Promise<any> => {
    try {
      const formData = new FormData();
      formData.append('rfp_name', rfpName);
      formData.append('mediaType', mediaType);
      formData.append('source', 'manual');
      
      // Append all files
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await api.post('/api/v1/rfp/uploadFilesToBlob', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      return response.data;
    } catch (error: any) {
      console.log('🚨 Upload files to blob error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      throw error;
    }
  },

  // Upload file from URL to blob storage
  uploadFileFromUrl: async (rfpName: string, url: string, mediaType: 'image' | 'document' | 'certificate'): Promise<any> => {
    try {
      const response = await api.post('/api/v1/rfp/uploadFileFromUrl', {
        rfp_name: rfpName,
        url: url,
        mediaType: mediaType,
        source: 'manual'
      });
      
      return response.data;
    } catch (error: any) {
      console.log('🚨 Upload file from URL error:', error);
      console.log('🚨 Error response status:', error.response?.status);
      console.log('🚨 Error response data:', error.response?.data);
      
      // Handle network errors
      if (error.code === 'ERR_NETWORK') {
        throw new Error('Unable to connect to server. Please check if the backend is running.');
      }
      
      throw error;
    }
  },
};