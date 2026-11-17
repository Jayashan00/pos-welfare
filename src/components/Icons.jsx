const I = ({ d, size = 20, stroke = 2, children, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {d ? <path d={d} /> : children}
  </svg>
);

export const IconDashboard = (p) => <I {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></I>;
export const IconTill = (p) => <I {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M7 20h10M12 16v4M7 9h4M7 12h7" /></I>;
export const IconBox = (p) => <I {...p}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></I>;
export const IconStock = (p) => <I {...p}><path d="M3 21h18M5 21V10l7-5 7 5v11" /><path d="M9 21v-6h6v6" /></I>;
export const IconUsers = (p) => <I {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5" /></I>;
export const IconReceipt = (p) => <I {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></I>;
export const IconChart = (p) => <I {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></I>;
export const IconShield = (p) => <I {...p}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></I>;
export const IconSettings = (p) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></I>;
export const IconSearch = (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></I>;
export const IconBarcode = (p) => <I {...p}><path d="M3 5v14M7 5v14M10 5v14M14 5v14M17 5v14M21 5v14" /></I>;
export const IconPlus = (p) => <I {...p} d="M12 5v14M5 12h14" />;
export const IconMinus = (p) => <I {...p} d="M5 12h14" />;
export const IconX = (p) => <I {...p} d="M18 6L6 18M6 6l12 12" />;
export const IconTrash = (p) => <I {...p}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></I>;
export const IconEdit = (p) => <I {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></I>;
export const IconPrinter = (p) => <I {...p}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></I>;
export const IconPause = (p) => <I {...p}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></I>;
export const IconRecall = (p) => <I {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></I>;
export const IconUser = (p) => <I {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></I>;
export const IconLock = (p) => <I {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></I>;
export const IconDownload = (p) => <I {...p}><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></I>;
export const IconUpload = (p) => <I {...p}><path d="M12 21V9M7 14l5-5 5 5M4 3h16" /></I>;
export const IconCheck = (p) => <I {...p} d="M5 12l5 5 9-11" />;
export const IconAlert = (p) => <I {...p}><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" /></I>;
export const IconTag = (p) => <I {...p}><path d="M3 12V3h9l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></I>;
export const IconCash = (p) => <I {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" /></I>;
export const IconCard = (p) => <I {...p}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></I>;
export const IconQr = (p) => <I {...p}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" /></I>;
export const IconWallet = (p) => <I {...p}><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 7l12-4v4M16 13h2" /></I>;
export const IconSplit = (p) => <I {...p}><path d="M12 3v18M5 8h4M15 16h4" /></I>;
export const IconWifiOff = (p) => <I {...p}><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.7M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5M12 20h.01" /></I>;
export const IconHelp = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01" /></I>;
export const IconMenu = (p) => <I {...p} d="M3 6h18M3 12h18M3 18h18" />;
export const IconVoid = (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></I>;
export const IconEye = (p) => <I {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></I>;
