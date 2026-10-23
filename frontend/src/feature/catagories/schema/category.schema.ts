
import { z } from "zod";

export const categorySchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),

  parent: z.unknown().nullable().optional(),

  _count: z.object({
    children: z.number(),
    services: z.number(),
  }),
});
export type CategoryService = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  iconUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CategoryDetailResType = {
  id: string;
  parentId: string | null;
  name: string;
  description: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  parent: {
    id: string;
    name: string;
  } | null;
  children: CategoryDetailResType[];
  services: CategoryService[];
  _count: {
    services: number;
    children: number;
  };
};

export type CategoryResType = z.infer<typeof categorySchema>;
