"use client";

import { useMutation } from "@tanstack/react-query";
import uploadApiRequest from "../api/upload.api";

export const useUploadImage = () => {
  return useMutation({
    mutationFn: uploadApiRequest.image,
  });
};