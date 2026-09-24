const PLACEHOLDER = /{{\s*([a-z][a-z0-9_]*)\s*}}/gi;

export function renderCommunicationTemplate(
  template: string,
  variables: Record<string, string | undefined>,
) {
  const unresolved = new Set<string>();
  const body = template.replace(PLACEHOLDER, (match, rawName: string) => {
    const name = rawName.toLowerCase();
    const value = variables[name];
    if (value === undefined || value === "") {
      unresolved.add(name);
      return match;
    }
    return value;
  });
  return { body, unresolved: [...unresolved] };
}

export function findCommunicationPlaceholders(template: string) {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1].toLowerCase()))];
}
