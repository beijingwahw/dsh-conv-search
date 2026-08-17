/**
 * Global stylesheet adoption: the floating search bar chrome plus the two
 * `::highlight()` paint rules for the Custom Highlight API. Injected once
 * into document.head with a stable id so repeated plugin loads never
 * double-inject.
 */
/**
 * Inject the stylesheet once. Safe to call from multiple mount paths.
 */
export declare function adoptStyles(): void;
