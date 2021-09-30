export function getQueryVariables() {
  const vars = {};
  const { searchParams } = new URL(location);
  for (const [ key, value ] of searchParams) {
    vars[key] = value;
  }
  return vars;
}
