import http from "@/shared/api/http";
import { SuccessResponse } from "@/shared/constants/type";
import { UploadImageResType } from "@/shared/validators/media.schema";

export const mediaApiRequest = {
  upload: (formData: FormData) =>
    http.post<SuccessResponse<UploadImageResType>>('/media/upload/', formData)
}