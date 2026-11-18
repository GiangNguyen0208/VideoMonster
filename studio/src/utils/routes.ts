/** Studio route paths (relative to the router basename `/studio`). */
const enc = encodeURIComponent;

/** Studio project page. */
export const projectPath = (projectId: string) => `/p/${enc(projectId)}`;

/** New-video wizard, optionally at one step (`?step=`). */
export const newVideoPath = (step?: string) => (step ? `/new?step=${enc(step)}` : "/new");
