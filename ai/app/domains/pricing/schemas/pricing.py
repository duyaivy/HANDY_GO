from typing import Optional
from pydantic import BaseModel, Field


class EstimatePricingRequest(BaseModel):
    service_name: str = Field(..., description="Tên dịch vụ trong catalog (VD: Sửa máy lạnh)")
    description: Optional[str] = Field(None, description="Mô tả sự cố hoặc yêu cầu từ khách hàng")
    base_price_min: Optional[float] = Field(None, description="Giá sàn cơ sở từ catalog dịch vụ")
    base_price_max: Optional[float] = Field(None, description="Giá trần cơ sở từ catalog dịch vụ")


class EstimatePricingResponse(BaseModel):
    status: str = Field("success", description="Trạng thái phản hồi (success)")
    ai_ref_price_min: int = Field(..., description="Giá ước tính sàn (VND, làm tròn tiền chẵn)")
    ai_ref_price_max: int = Field(..., description="Giá ước tính trần (VND, làm tròn tiền chẵn)")
    matched_case: Optional[str] = Field(None, description="Trường hợp benchmark sự cố khớp được")
    confidence: float = Field(0.0, description="Độ tương đồng ngữ nghĩa (0.0 - 1.0)")
    is_fallback: bool = Field(False, description="True nếu không khớp benchmark và dùng giá fallback")
