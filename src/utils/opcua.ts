/**
 * Given a method node ID of the form `<prefix>;s=<parent>.<method>`,
 * returns the parent object node ID `<prefix>;s=<parent>`, or `undefined`
 * if the node ID does not follow that convention.
 */
export function inferMethodParent(nodeId: string): string | undefined {
  const marker = ";s=";
  const idx = nodeId.indexOf(marker);
  if (idx < 0) return undefined;
  const prefix = nodeId.slice(0, idx + marker.length);
  const body = nodeId.slice(idx + marker.length);
  const parts = body.split(".");
  if (parts.length <= 1) return undefined;
  parts.pop();
  return prefix + parts.join(".");
}
