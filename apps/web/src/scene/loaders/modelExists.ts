export async function modelExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    const type = response.headers.get("content-type") ?? "";
    return response.ok && !type.includes("text/html");
  } catch {
    return false;
  }
}
