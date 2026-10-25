import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import serviceApiRequest from "../api/service.api";
import { ServiceListConfig } from "../types/service-list-config.types";
import { CreateServiceBodyType } from "../schema/service.schema";

export const useServiceListQuery = (queryConfig: ServiceListConfig) => {
  return useQuery({
    queryKey: ["services", queryConfig],
    queryFn: async () => {
      const response = await serviceApiRequest.list(queryConfig);
      return response.payload.data;
    },
  });
};
export const useCreateServiceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateServiceBodyType) => serviceApiRequest.create(body),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["services"],
      });
    },
  });
};
