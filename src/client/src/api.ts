export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}

export async function postForm<T = void>(
  pathname: string,
  values: Record<string, string>,
): Promise<T> {
  const response = await fetch(pathname, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function deleteResource(pathname: string): Promise<void> {
  const response = await fetch(pathname, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}
