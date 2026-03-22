export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit & { revalidate?: number }
): Promise<T> {
  const { revalidate, ...fetchOptions } = options ?? {};

  const res = await fetch(url, {
    ...fetchOptions,
    next: revalidate !== undefined ? { revalidate } : undefined,
  });

  if (!res.ok) {
    throw new ApiError(`API error: ${res.status} ${res.statusText}`, res.status);
  }

  return res.json();
}

export async function fetchWithFallback<T>(
  fetcher: () => Promise<T>,
  fallback: T
): Promise<{ data: T; isLive: boolean }> {
  try {
    const data = await fetcher();
    return { data, isLive: true };
  } catch {
    return { data: fallback, isLive: false };
  }
}
