import React, { useState, useEffect, useCallback } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Select,
  MenuItem,
  FormControl,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import { 
  Storage as KnowledgeBaseIcon, 
  LightMode as LightModeIcon, 
  DarkMode as DarkModeIcon,
  Add as AddIcon
} from '@mui/icons-material';
import type { SelectChangeEvent } from '@mui/material/Select';
import { useThemeMode } from '../../contexts/ThemeContext.js';
import { rfpApi } from '../../services/api.js';

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

interface HeaderProps {
  projectName?: string;
  onProjectChange?: (name: string) => void;
  userEmail?: string;
  userName?: string;
  tenantId?: string | null;
  onLogout?: () => void;
  onKnowledgeBaseClick?: () => void;
  canAccessKnowledgeBase?: boolean;
  currentSessionId?: string;
  onRFPSwitch?: (sessionId: string, rfpName: string) => void;
  onCreateNewRFP?: () => void;
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
  currentSessionId,
  onRFPSwitch,
  onCreateNewRFP,
}) => {
  const { mode, toggleColorMode } = useThemeMode();
  const [userRFPs, setUserRFPs] = useState<UserRFP[]>([]);
  const [isLoadingRFPs, setIsLoadingRFPs] = useState(false);
  const [rfpDropdownOpen, setRfpDropdownOpen] = useState(false);
  
  // Load user RFPs when component mounts
  useEffect(() => {
    const loadUserRFPs = async () => {
      if (!userName) return; // Don't load if user not authenticated
      
      setIsLoadingRFPs(true);
      try {
        const response = await rfpApi.getUserRFPs();
        if (response.success) {
          setUserRFPs(response.rfps);
        }
      } catch (error) {
        console.error('Failed to load user RFPs:', error);
        setUserRFPs([]); // Set empty array on error
      } finally {
        setIsLoadingRFPs(false);
      }
    };

    loadUserRFPs();
  }, [userName]);

  // Function to refresh RFPs (can be called when needed)
  const refreshRFPs = useCallback(async () => {
    if (!userName) return;
    
    setIsLoadingRFPs(true);
    try {
      const response = await rfpApi.getUserRFPs();
      if (response.success) {
        setUserRFPs(response.rfps);
      }
    } catch (error) {
      console.error('Failed to refresh user RFPs:', error);
    } finally {
      setIsLoadingRFPs(false);
    }
  }, [userName]);
  
  const handleProjectChange = (event: SelectChangeEvent<string>) => {
    const selectedValue = event.target.value;
    
    if (selectedValue === 'new-rfp') {
      onCreateNewRFP?.();
      // Refresh the RFP list after creating new RFP
      setTimeout(() => refreshRFPs(), 1000); // Small delay to ensure backend is updated
      return;
    }
    
    // Find the selected RFP and switch to it
    const selectedRFP = userRFPs.find(rfp => rfp.sessionId === selectedValue);
    if (selectedRFP && onRFPSwitch) {
      onRFPSwitch(selectedRFP.sessionId, selectedRFP.RFP_Name);
    } else {
      onProjectChange?.(selectedValue);
    }
  };

  // If projectName is not set or is default, show 'RFP' in grey; otherwise show projectName
  // Only show 'RFP' in grey if projectName is empty
  const isDefault = !projectName || projectName.trim() === '';
  const displayProjectName = isDefault ? 'RFP' : projectName;
  const isLoadingProjectName = isDefault;
  return (
    <AppBar 
      position="static" 
      elevation={1}
      sx={{ 
        backgroundColor: 'background.paper', 
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary'
      }}
    >
      <Box sx={{ 
        maxWidth: { xs: '100%', lg: '1400px' }, 
        width: '100%',
        mx: 'auto'
      }}>
        <Toolbar sx={{ 
          justifyContent: 'space-between', 
          py: { xs: 2, sm: 2.5 },
          px: { xs: 2, sm: 3, md: 4 },
          minHeight: { xs: 70, sm: 80 }
        }}>
          <Box>
            <Typography 
              variant="h4" 
              component="h1" 
              sx={{ 
                color: 'primary.main', 
                fontWeight: 700,
                fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
                lineHeight: 1.2
              }}
            >
              AutoRFP
            </Typography>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'text.secondary', 
                mt: 0.5,
                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                display: { xs: 'none', sm: 'block' }
              }}
            >
              Intelligent proposal generation and refinement
            </Typography>
          </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 2, sm: 3 } }}>
          <Box sx={{ 
            minWidth: { xs: 150, sm: 200 }, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1 
          }}>
            <Typography 
              variant="body2" 
              sx={{ 
                color: 'text.secondary',
                display: { xs: 'none', sm: 'block' }
              }}
            >
              All RFPs
            </Typography>
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select
                value={currentSessionId && userRFPs.find(rfp => rfp.sessionId === currentSessionId) ? currentSessionId : displayProjectName}
                onChange={handleProjectChange}
                open={rfpDropdownOpen}
                onOpen={() => setRfpDropdownOpen(true)}
                onClose={() => setRfpDropdownOpen(false)}
                sx={{
                  backgroundColor: 'background.paper',
                  borderRadius: 2,
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'divider',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'primary.main',
                  },
                  '& .MuiSelect-select': {
                    py: 1,
                  }
                }}
                displayEmpty
                renderValue={(value) => {
                  const selectedRFP = userRFPs.find(rfp => rfp.sessionId === value);
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {isLoadingRFPs && <CircularProgress size={16} />}
                      <Typography 
                        variant="body2"
                        sx={{ 
                          color: selectedRFP ? 'text.primary' : (isLoadingProjectName ? 'text.secondary' : 'text.primary'),
                          fontWeight: selectedRFP ? 500 : (isLoadingProjectName ? 400 : 500)
                        }}
                      >
                        {selectedRFP ? selectedRFP.RFP_Name : displayProjectName}
                      </Typography>
                    </Box>
                  );
                }}
              >
                {/* Current/Default RFP if no match found */}
                {!currentSessionId || !userRFPs.find(rfp => rfp.sessionId === currentSessionId) ? (
                  <MenuItem value={displayProjectName} sx={{ color: isLoadingProjectName ? 'text.secondary' : 'inherit' }}>
                    {displayProjectName}
                  </MenuItem>
                ) : null}
                
                {/* User's RFPs */}
                {userRFPs.map((rfp) => (
                  <MenuItem key={rfp.sessionId} value={rfp.sessionId}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {rfp.RFP_Name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {rfp.sectionsCount} sections • {new Date(rfp.updatedAt).toLocaleDateString()}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))}
                
                {/* Create New RFP Option */}
                <MenuItem value="new-rfp" sx={{ borderTop: '1px solid', borderColor: 'divider', mt: 1, pt: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
                    <AddIcon fontSize="small" />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Create New RFP
                    </Typography>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Theme Toggle Button - Always visible */}
          <Tooltip title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}>
            <IconButton
              onClick={toggleColorMode}
              color="inherit"
              sx={{
                borderRadius: 2,
                padding: 1,
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              {mode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>

          {/* User Info & Logout */}
          {userName && (
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: { xs: 1.5, sm: 2 },
              flexShrink: 0
            }}>
              {/* Knowledge Base Button - Only for personal accounts or admin users */}
              {canAccessKnowledgeBase && onKnowledgeBaseClick && (
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<KnowledgeBaseIcon />}
                  onClick={onKnowledgeBaseClick}
                  sx={{
                    borderRadius: 2,
                    px: { xs: 1.5, sm: 2 },
                    py: 0.75,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    display: { xs: 'none', md: 'flex' }
                  }}
                >
                  Knowledge Base
                </Button>
              )}
              
              <Box sx={{ 
                textAlign: 'right',
                display: { xs: 'none', sm: 'block' }
              }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    lineHeight: 1.4
                  }}
                >
                  {userName}
                </Typography>
                <Typography 
                  variant="caption" 
                  sx={{ 
                    color: 'text.secondary',
                    fontSize: '0.75rem'
                  }}
                >
                  {userEmail}
                </Typography>
                {tenantId && (
                  <Typography 
                    variant="caption" 
                    sx={{
                      color: 'primary.main',
                      display: 'block',
                      fontSize: '0.75rem',
                      fontWeight: 500
                    }}
                  >
                    Org: {tenantId.substring(0, 8)}...
                  </Typography>
                )}
              </Box>
              {onLogout && (
                <Button 
                  variant="outlined" 
                  size="small" 
                  onClick={onLogout}
                  sx={{
                    borderRadius: 2,
                    px: { xs: 1.5, sm: 2 },
                    py: 0.75,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    minWidth: { xs: 'auto', sm: 'auto' }
                  }}
                >
                  Logout
                </Button>
              )}
            </Box>
          )}
        </Box>
      </Toolbar>
      </Box>
    </AppBar>
  );
};

export default Header;