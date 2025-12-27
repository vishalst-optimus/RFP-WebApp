import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Select,
  MenuItem,
  FormControl,
  Button,
} from '@mui/material';
import { Storage as KnowledgeBaseIcon } from '@mui/icons-material';
import type { SelectChangeEvent } from '@mui/material/Select';

interface HeaderProps {
  projectName?: string;
  onProjectChange?: (name: string) => void;
  userEmail?: string;
  userName?: string;
  tenantId?: string | null;
  onLogout?: () => void;
  onKnowledgeBaseClick?: () => void;
  canAccessKnowledgeBase?: boolean;
}

const Header: React.FC<HeaderProps> = ({ 
  projectName = 'Project Name', 
  onProjectChange,
  userEmail,
  userName,
  tenantId,
  onLogout,
  onKnowledgeBaseClick,
  canAccessKnowledgeBase = false,
}) => {
  const handleProjectChange = (event: SelectChangeEvent<string>) => {
    onProjectChange?.(event.target.value);
  };

  // If projectName is not set or is default, show 'RFP' in grey; otherwise show projectName
  // Only show 'RFP' in grey if projectName is empty
  const isDefault = !projectName || projectName.trim() === '';
  const displayProjectName = isDefault ? 'RFP' : projectName;
  const isLoadingProjectName = isDefault;
  return (
    <AppBar 
      position="static" 
      elevation={0}
      sx={{ 
        backgroundColor: 'background.paper', 
        borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
        color: 'text.primary'
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', py: 1 }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ color: 'primary.main', fontWeight: 700 }}>
            RFP Agent
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
            Intelligent proposal generation and refinement
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Box sx={{ minWidth: 200, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              All RFPs
            </Typography>
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select
                value={displayProjectName}
                onChange={handleProjectChange}
                sx={{
                  backgroundColor: 'background.paper',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(0, 0, 0, 0.2)',
                  },
                }}
                displayEmpty
                renderValue={() => (
                  <span style={{ color: isLoadingProjectName ? '#888' : undefined }}>
                    {displayProjectName}
                  </span>
                )}
              >
                <MenuItem value={displayProjectName} sx={{ color: isLoadingProjectName ? '#888' : 'inherit' }}>
                  {displayProjectName}
                </MenuItem>
                {/* Additional projects can be added here */}
              </Select>
            </FormControl>
          </Box>

          {/* User Info & Logout */}
          {userName && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Knowledge Base Button - Only for personal accounts or admin users */}
              {canAccessKnowledgeBase && onKnowledgeBaseClick && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<KnowledgeBaseIcon />}
                  onClick={onKnowledgeBaseClick}
                >
                  Knowledge Base
                </Button>
              )}
              
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {userName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {userEmail}
                </Typography>
                {tenantId && (
                  <Typography variant="caption" color="primary" display="block">
                    Org: {tenantId.substring(0, 8)}...
                  </Typography>
                )}
              </Box>
              {onLogout && (
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={onLogout}
                >
                  Logout
                </Button>
              )}
            </Box>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Header;