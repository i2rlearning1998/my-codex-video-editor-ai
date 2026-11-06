// P4: Director used inside the editor makes the project an AI project. The
// editor notes the project's id here; the panel reads it and sets the tag.
export const AI_FLAG_KEY = 'aive.ws.aiProjects';
export function readAiProjects(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(AI_FLAG_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export function markAiProject(id: string): void {
  try {
    const all = readAiProjects();
    if (!all.includes(id))
      localStorage.setItem(
        AI_FLAG_KEY,
        JSON.stringify([...all, id].slice(-500)),
      );
  } catch {
    /* the tag is a convenience */
  }
}
