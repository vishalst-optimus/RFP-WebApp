import axios from 'axios';
import type { AnalysisData } from '../types';
import { msalInstance } from '../main';
import { loginRequest } from '../authConfig';

// Custom error class for subscription-related errors
export class SubscriptionRequiredError extends Error {
  constructor(message: string = 'Subscription required to access this feature') {
    super(message);
    this.name = 'SubscriptionRequiredError';
  }
}

// const BACKEND_URL = 'https://ca-rfp-dev-cc-01.livelyfield-8735fca8.canadacentral.azurecontainerapps.io'; 
// const BACKEND_URL = 'http://127.0.0.1:8000'; 
const BACKEND_URL = ''; // Use relative URLs so Vite proxy handles the routing 

export const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 300000, // 5 minutes for long operations
});

// Request interceptor for authentication with silent token refresh
api.interceptors.request.use(
  async (config) => {
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
  analyzeRFP: async (file: File, sessionId: string, rfpName?: string): Promise<AnalysisData> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', sessionId);
    
    // Add RFP name if provided
    if (rfpName) {
      formData.append('rfp_name', rfpName);
    }

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

  // Generate draft for a section (streaming)
  generateDraft: async (
    sessionId: string,
    userId: string,
    prompt: string,
    sectionName: string,
    sectionType: string,
    action: 'generate' | 'edit' | 'regenerate' = 'generate',
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('prompt_id', crypto.randomUUID());
    formData.append('prompt', prompt);
    formData.append('user_id', userId);
    formData.append('action', action);
    formData.append('section_name', sectionName);
    formData.append('section_type', sectionType);

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
    onChunk: (chunk: string) => void
  ): Promise<void> => {
    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('prompt_id', crypto.randomUUID());
    formData.append('prompt', prompt);
    formData.append('user_id', userId);
    formData.append('action', action);
    formData.append('section_name', sectionName);
    formData.append('section_type', sectionType);

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
    fileName: string,
    sectionDrafts: Record<string, any>
  ): Promise<{ content: ArrayBuffer; stats: { processingTime: string; documentSize: string; sectionsProcessed: string } }> => {
    const rfpData = {
      metadata: {
        document_type: "RFP Response",
        analysis_date: new Date().toISOString().split('T')[0],
        total_sections: Object.keys(sectionDrafts).length,
        file_name: fileName || "Unknown",
        session_id: sessionId
      },
      sections: {} as Record<string, { title: string; content: string; type: string }>
    };

    // Prepare sections data for document generation
    for (const [sectionName, draft] of Object.entries(sectionDrafts)) {
      rfpData.sections[sectionName] = {
        title: sectionName,
        content: draft.content,
        type: draft.original_section?.type || 'unknown'
      };
    }

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

    const response = await api.post('/api/v1/rfp/upload-multiple', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 600000, // 10 minutes for large file uploads
    });

    return response.data;
  },
};