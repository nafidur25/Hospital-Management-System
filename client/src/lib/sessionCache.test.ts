import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { clearHmsSessionCache } from "./sessionCache";

describe("clearHmsSessionCache", () => {
  it("removes role-scoped HMS data while retaining unrelated query entries", async () => {
    const queryClient = new QueryClient();
    const hmsKey = [["hms", "roleContext"], { type: "query" }] as const;
    const authKey = [["auth", "me"], { type: "query" }] as const;

    queryClient.setQueryData(hmsKey, { role: "admin" });
    queryClient.setQueryData(authKey, { id: 4, name: "Nusrat Jahan" });

    await clearHmsSessionCache(queryClient);

    expect(queryClient.getQueryData(hmsKey)).toBeUndefined();
    expect(queryClient.getQueryData(authKey)).toEqual({
      id: 4,
      name: "Nusrat Jahan",
    });
  });
});
