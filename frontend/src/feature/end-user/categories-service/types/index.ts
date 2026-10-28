export interface CategoryItem {
  id: string;
  code: string;
  name: string;
  slug: string;
  imageUrl: string;
  iconName: string;
  serviceCount: number;
  description: string;
}

export interface ServiceItem {
  id: string;
  code: string;
  name: string;
  slug: string;
  categoryId: string;
  categoryName: string;
  imageUrl: string;
  shortDescription: string;
  fullDescription: string;
  isAvailable: boolean;
  processSteps?: {
    step: number;
    title: string;
    description: string;
  }[];
  commitments?: string[];
}

export type ViewMode = 'discovery' | 'catalogs' | 'detail';

export type SortOption = 'newest' | 'name-asc' | 'popular';
