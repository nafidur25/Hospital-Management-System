import type { QueryClient, QueryKey } from "@tanstack/react-query";

const isHmsQueryKey = (queryKey: QueryKey) =>
  queryKey.some(
    (segment) => Array.isArray(segment) && segment[0] === "hms",
  );

export async function clearHmsSessionCache(queryClient: QueryClient) {
  const filters = { predicate: ({ queryKey }: { queryKey: QueryKey }) => isHmsQueryKey(queryKey) };
  await queryClient.cancelQueries(filters);
  queryClient.removeQueries(filters);
}
