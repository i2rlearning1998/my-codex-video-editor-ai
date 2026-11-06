// The link between a project in this browser and its copy in the cloud. Shared
// by every place that saves a project to the cloud, so one project is one row.
export const LINKS_KEY = 'aive.cloudLinks';
export interface CloudLink {
  cloudId: string;
  revision: number;
}
type KV = Pick<Storage, 'getItem' | 'setItem'>;

export const readLinks = (storage: KV | null): Record<string, CloudLink> => {
  try {
    const value = JSON.parse(storage?.getItem(LINKS_KEY) ?? '{}') as unknown;
    return value && typeof value === 'object'
      ? (value as Record<string, CloudLink>)
      : {};
  } catch {
    return {};
  }
};
export const writeLink = (
  storage: KV | null,
  localId: string,
  link: CloudLink | null,
): void => {
  try {
    const links = readLinks(storage);
    if (link) links[localId] = link;
    else delete links[localId];
    storage?.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    // A browser without storage only forgets the link.
  }
};
