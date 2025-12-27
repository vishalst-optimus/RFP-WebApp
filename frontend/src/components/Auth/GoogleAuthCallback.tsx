import React, { useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

const GoogleAuthCallback: React.FC = () => {
  useEffect(() => {
    const handleAuthCallback = () => {
      try {
        // Get the authorization code from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
          console.error('Authentication error:', error);
          // Send error to parent window
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error }, '*');
          }
          window.close();
          return;
        }

        if (code) {
          // Send the authorization code to the parent window
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', code }, '*');
          }
          window.close();
        } else {
          console.error('No authorization code received');
          if (window.opener) {
            window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: 'No authorization code received' }, '*');
          }
          window.close();
        }
      } catch (err) {
        console.error('Error handling auth callback:', err);
        if (window.opener) {
          window.opener.postMessage({ type: 'GOOGLE_AUTH_ERROR', error: 'Authentication failed' }, '*');
        }
        window.close();
      }
    };

    // Handle the callback immediately
    handleAuthCallback();
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        gap: 2
      }}
    >
      <CircularProgress />
      <Typography variant="h6">
        Completing Google Drive authentication...
      </Typography>
      <Typography variant="body2" color="text.secondary">
        This window will close automatically.
      </Typography>
    </Box>
  );
};

export default GoogleAuthCallback;