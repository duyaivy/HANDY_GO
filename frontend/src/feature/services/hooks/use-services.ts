import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import serviceApiRequest from "../api/service.api";
import { ServiceListConfig } from "../types/service-list-config.types";
import { CreateServiceBodyType, UpdateServiceBodyType } from "../schema/service.schema";

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
export const useUpdateServiceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateServiceBodyType;
    }) => serviceApiRequest.update(id, body),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["services"],
      });
    },
  });
};
export const useUpdateServiceStatusMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      isActive,
    }: {
      id: string;
      isActive: boolean;
    }) => serviceApiRequest.updateStatus(id, isActive),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["services"],
      });
    },
  });
};

export const useDeleteServiceMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      serviceApiRequest.deletePermanently(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["services"],
      });
    },
  });
};
export const useServiceDetailQuery = (id: string, enabled = true) =>
  useQuery({
    queryKey: ["services", "detail", id],
    queryFn: async () => {
      const response = await serviceApiRequest.detail(id);
      return response.payload.data;
    },
    enabled: enabled && !!id,
  });