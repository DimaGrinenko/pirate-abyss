type SpaceEvent = Pick<KeyboardEvent, 'code' | 'key' | 'stopPropagation' | 'preventDefault'>;

/** A modal owns Space; native buttons still need its default key activation. */
export function containDialogSpace(event: SpaceEvent, onButton: boolean): boolean {
  if (event.code !== 'Space' && event.key !== ' ') return false;
  event.stopPropagation();
  if (!onButton) event.preventDefault();
  return true;
}
