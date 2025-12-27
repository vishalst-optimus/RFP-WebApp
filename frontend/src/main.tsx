import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { MsalProvider } from '@azure/msal-react'
import { PublicClientApplication } from '@azure/msal-browser'
import { msalConfig } from './authConfig'
import { initializeSharePointService } from './services/sharePointService'

// Create MSAL instance for Azure AD authentication
export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize MSAL and render app (only once)
const rootElement = document.getElementById('root')!;

msalInstance.initialize().then(() => {
  // Initialize SharePoint service with MSAL instance
  initializeSharePointService(msalInstance);
  
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>,
  );
});
