// ─── Design Tokens ───────────────────────────────────────────────────────────

export const COLORS = {
  bg: '#090909',
  surface: '#111111',
  surfaceElevated: '#1A1A1A',
  text: '#F2EFE8',
  textMuted: 'rgba(242,239,232,0.5)',
  textDim: 'rgba(242,239,232,0.3)',
  accent: '#E8A435',
  accentDim: 'rgba(232,164,53,0.15)',
  border: 'rgba(255,255,255,0.12)',
  borderFocus: 'rgba(232,164,53,0.5)',
  error: '#E85435',
  errorDim: 'rgba(232,84,53,0.15)',
  success: '#35C46A',
  successDim: 'rgba(53,196,106,0.15)',
  warning: '#E8A435',
  warningDim: 'rgba(232,164,53,0.15)',
  white: '#FFFFFF',
};

export const FONTS = {
  title: 'CormorantGaramond_700Bold',
  titleItalic: 'CormorantGaramond_700Bold_Italic',
  titleRegular: 'CormorantGaramond_400Regular',
  titleRegularItalic: 'CormorantGaramond_400Regular_Italic',
  body: undefined, // system font
};

export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 16,
  xl: 20,
  full: 999,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ─── Status Badge Config ─────────────────────────────────────────────────────

export const ROADTRIP_STATUS = {
  DRAFT: { label: 'Brouillon', color: COLORS.textMuted, bg: 'rgba(242,239,232,0.08)' },
  PLANNED: { label: 'Planifié', color: COLORS.accent, bg: COLORS.accentDim },
  ONGOING: { label: 'En cours', color: COLORS.success, bg: COLORS.successDim },
  COMPLETED: { label: 'Terminé', color: '#4EA8DE', bg: 'rgba(78,168,222,0.15)' },
};

export const BOOKING_STATUS = {
  PLANNED: { label: 'Planifié', color: COLORS.accent },
  BOOKED: { label: 'Réservé', color: COLORS.success },
  DONE: { label: 'Fait', color: '#4EA8DE' },
  CANCELLED: { label: 'Annulé', color: COLORS.error },
};
