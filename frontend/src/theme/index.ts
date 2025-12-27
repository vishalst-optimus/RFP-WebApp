import { createTheme } from '@mui/material/styles';
import type { ThemeOptions } from '@mui/material/styles';
// In MUI v5, PaletteMode is exported from '@mui/material'
import type { PaletteMode } from '@mui/material';

// Professional color palette with improved contrast and accessibility
const getThemeOptions = (mode: PaletteMode): ThemeOptions => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          // Light theme colors
          primary: {
            main: '#1565C0', // Professional blue
            light: '#42A5F5',
            dark: '#0D47A1',
            contrastText: '#FFFFFF',
          },
          secondary: {
            main: '#2E7D32', // Professional green
            light: '#66BB6A',
            dark: '#1B5E20',
            contrastText: '#FFFFFF',
          },
          error: {
            main: '#D32F2F',
            light: '#EF5350',
            dark: '#C62828',
          },
          warning: {
            main: '#ED6C02',
            light: '#FF9800',
            dark: '#E65100',
          },
          info: {
            main: '#0288D1',
            light: '#03DAC6',
            dark: '#01579B',
          },
          success: {
            main: '#2E7D32',
            light: '#4CAF50',
            dark: '#1B5E20',
          },
          background: {
            default: '#F8FAFC', // Slightly cooler gray
            paper: '#FFFFFF',
          },
          text: {
            primary: '#1E293B', // Darker, more professional
            secondary: '#64748B',
          },
          grey: {
            50: '#F8FAFC',
            100: '#F1F5F9',
            200: '#E2E8F0',
            300: '#CBD5E1',
            400: '#94A3B8',
            500: '#64748B',
            600: '#475569',
            700: '#334155',
            800: '#1E293B',
            900: '#0F172A',
          },
          divider: '#E2E8F0',
        }
      : {
          // Dark theme colors
          primary: {
            main: '#42A5F5', // Brighter blue for dark mode
            light: '#64B5F6',
            dark: '#1976D2',
            contrastText: '#000000',
          },
          secondary: {
            main: '#66BB6A', // Brighter green for dark mode
            light: '#81C784',
            dark: '#388E3C',
            contrastText: '#000000',
          },
          error: {
            main: '#F44336',
            light: '#E57373',
            dark: '#D32F2F',
          },
          warning: {
            main: '#FF9800',
            light: '#FFB74D',
            dark: '#F57C00',
          },
          info: {
            main: '#29B6F6',
            light: '#4FC3F7',
            dark: '#0288D1',
          },
          success: {
            main: '#66BB6A',
            light: '#81C784',
            dark: '#388E3C',
          },
          background: {
            default: '#0F172A', // Dark background
            paper: '#1E293B',   // Slightly lighter for cards
          },
          text: {
            primary: '#F8FAFC', // Light text
            secondary: '#CBD5E1',
          },
          grey: {
            50: '#0F172A',
            100: '#1E293B',
            200: '#334155',
            300: '#475569',
            400: '#64748B',
            500: '#94A3B8',
            600: '#CBD5E1',
            700: '#E2E8F0',
            800: '#F1F5F9',
            900: '#F8FAFC',
          },
          divider: '#334155',
        }),
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontSize: '1.5rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h4: {
      fontSize: '1.25rem',
      fontWeight: 600,
      lineHeight: 1.4,
    },
    h5: {
      fontSize: '1.125rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    subtitle1: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    subtitle2: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.4,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      lineHeight: 1.5,
      textTransform: 'none',
      letterSpacing: '0.02em',
    },
  },
  shape: {
    borderRadius: 12,
  },
  spacing: 8, // Base spacing unit
  shadows: [
    'none',
    '0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px 0px rgba(0, 0, 0, 0.06)',
    '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -1px rgba(0, 0, 0, 0.06)',
    '0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -2px rgba(0, 0, 0, 0.05)',
    '0px 20px 25px -5px rgba(0, 0, 0, 0.1), 0px 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
    '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        body: {
          scrollbarColor: theme.palette.mode === 'light' 
            ? '#CBD5E1 #F1F5F9' 
            : '#475569 #1E293B',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
          },
          '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
            background: theme.palette.mode === 'light' ? '#F1F5F9' : '#1E293B',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: theme.palette.mode === 'light' ? '#CBD5E1' : '#475569',
            borderRadius: 8,
            border: 'none',
          },
          '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
            backgroundColor: theme.palette.mode === 'light' ? '#94A3B8' : '#64748B',
          },
        },
      }),
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          padding: '10px 20px',
          fontSize: '0.875rem',
          lineHeight: 1.5,
          boxShadow: 'none',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        contained: {
          '&:hover': {
            boxShadow: '0px 4px 12px 0px rgba(21, 101, 192, 0.4)',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            boxShadow: '0px 2px 4px 0px rgba(21, 101, 192, 0.4)',
            transform: 'translateY(0px)',
          },
        },
        outlined: {
          borderWidth: '1.5px',
          '&:hover': {
            borderWidth: '1.5px',
            backgroundColor: 'rgba(21, 101, 192, 0.04)',
          },
        },
        text: {
          '&:hover': {
            backgroundColor: 'rgba(21, 101, 192, 0.04)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow: '0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px 0px rgba(0, 0, 0, 0.06)',
          border: '1px solid #E2E8F0',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -1px rgba(0, 0, 0, 0.06)',
            transform: 'translateY(-2px)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        elevation1: {
          boxShadow: '0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px 0px rgba(0, 0, 0, 0.06)',
        },
        elevation2: {
          boxShadow: '0px 4px 6px -1px rgba(0, 0, 0, 0.1), 0px 2px 4px -1px rgba(0, 0, 0, 0.06)',
        },
        elevation3: {
          boxShadow: '0px 10px 15px -3px rgba(0, 0, 0, 0.1), 0px 4px 6px -2px rgba(0, 0, 0, 0.05)',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          height: 6,
          borderRadius: 3,
          backgroundColor: '#E2E8F0',
        },
        bar: {
          borderRadius: 3,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#E2E8F0',
              transition: 'border-color 0.2s ease',
            },
            '&:hover fieldset': {
              borderColor: '#CBD5E1',
            },
            '&.Mui-focused fieldset': {
              borderWidth: '2px',
              borderColor: '#1565C0',
            },
          },
          '& .MuiInputLabel-root': {
            color: '#64748B',
            '&.Mui-focused': {
              color: '#1565C0',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 2px 0px rgba(0, 0, 0, 0.06)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
        },
      },
    },
  },
});

export const createAppTheme = (mode: PaletteMode) => createTheme(getThemeOptions(mode));

// Default light theme for backward compatibility
export const theme = createAppTheme('light');
