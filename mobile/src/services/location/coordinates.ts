/**
 * Kiểm tra tính hợp lệ của cặp tọa độ (vĩ độ / kinh độ):
 * - Phải là số hữu hạn (finite number)
 * - Vĩ độ nằm trong khoảng [-90, 90]
 * - Kinh độ nằm trong khoảng [-180, 180]
 * - Không phải tọa độ chưa khởi tạo (0, 0)
 */
export function isValidCoordinate(lat?: unknown, lng?: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return false;
  }
  const numLat = typeof lat === 'number' ? lat : (typeof lat === 'string' && lat.trim() !== '' ? Number(lat) : Number.NaN);
  const numLng = typeof lng === 'number' ? lng : (typeof lng === 'string' && lng.trim() !== '' ? Number(lng) : Number.NaN);

  return (
    Number.isFinite(numLat)
    && Number.isFinite(numLng)
    && numLat >= -90
    && numLat <= 90
    && numLng >= -180
    && numLng <= 180
    && (numLat !== 0 || numLng !== 0)
  );
}
