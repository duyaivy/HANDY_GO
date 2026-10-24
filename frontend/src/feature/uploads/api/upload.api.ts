import http from "@/shared/api/http";
import { SuccessResponse } from "@/shared/constants/type";
import { UploadImageResType } from "../types/upload.types";

const uploadApiRequest = {
  image: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    return http.post<SuccessResponse<UploadImageResType>>(
      "/api/uploads/image",
      formData,
      { baseUrl: "" },
    );
  },
};

export default uploadApiRequest;