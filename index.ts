/**
 * Host half of the task-notification bundle.
 *
 * Every behaviour lives in the browser half, which observes the session list the
 * Client already keeps in memory; the Host row only makes the bundle selectable
 * and carries the config schema.
 */

/** No host-side behaviour. */
export function apply(): void {}
