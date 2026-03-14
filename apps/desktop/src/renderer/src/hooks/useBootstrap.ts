import { useQuery } from "@tanstack/react-query";

export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => window.stockdesk.bootstrap.get()
  });
}

