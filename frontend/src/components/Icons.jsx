// Small inline SVG icons (no extra npm package). They use currentColor, so the parent sets the colour.
const base = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };

export const EyeIcon = (p) => (<svg {...base} {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>);
export const PencilIcon = (p) => (<svg {...base} {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>);
export const TrashIcon = (p) => (<svg {...base} {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>);
export const PlusIcon = (p) => (<svg {...base} {...p}><path d="M12 5v14" /><path d="M5 12h14" /></svg>);
export const ArrowLeftIcon = (p) => (<svg {...base} {...p}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>);
export const PowerIcon = (p) => (<svg {...base} {...p}><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></svg>);
export const SendIcon = (p) => (<svg {...base} {...p}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>);
export const CheckCircleIcon = (p) => (<svg {...base} {...p}><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" /><path d="M22 4L12 14l-3-3" /></svg>);
export const XCircleIcon = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6" /><path d="M9 9l6 6" /></svg>);
export const BanIcon = (p) => (<svg {...base} {...p}><circle cx="12" cy="12" r="10" /><path d="M4.9 4.9l14.2 14.2" /></svg>);
export const XIcon = (p) => (<svg {...base} {...p}><path d="M18 6L6 18" /><path d="M6 6l12 12" /></svg>);
export const CheckIcon = (p) => (<svg {...base} {...p}><path d="M20 6L9 17l-5-5" /></svg>);
export const KeyIcon = (p) => (<svg {...base} {...p}><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3L21 2" /><path d="M16 7l3 3" /><path d="M14 9l2 2" /></svg>);
export const UserXIcon = (p) => (<svg {...base} {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M17 8l5 5" /><path d="M22 8l-5 5" /></svg>);
export const UserCheckIcon = (p) => (<svg {...base} {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M17 11l2 2 4-4" /></svg>);
export const FileTextIcon = (p) => (<svg {...base} {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg>);
export const SlidersIcon = (p) => (<svg {...base} {...p}><path d="M4 21v-7" /><path d="M4 10V3" /><path d="M12 21v-9" /><path d="M12 8V3" /><path d="M20 21v-5" /><path d="M20 12V3" /><path d="M1 14h6" /><path d="M9 8h6" /><path d="M17 16h6" /></svg>);
export const RefreshIcon = (p) => (<svg {...base} {...p}><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 12A9 9 0 0 1 18.5 5.8L21 8" /><path d="M21 3v5h-5" /><path d="M3 21v-5h5" /></svg>);
