const PLACEHOLDER = /{{\s*([a-z][a-z0-9_]*)\s*}}/gi;

export function renderDocumentTemplate(
  template: string,
  variables: Record<string, string>,
) {
  const unresolved = new Set<string>();
  const rendered = template.replace(PLACEHOLDER, (match, rawName: string) => {
    const name = rawName.toLowerCase();
    const value = variables[name];
    if (value === undefined) {
      unresolved.add(name);
      return match;
    }
    return value;
  });
  return { rendered, unresolved: [...unresolved].sort() };
}

export function findDocumentPlaceholders(template: string) {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((match) => match[1].toLowerCase()))].sort();
}
