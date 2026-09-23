import z from 'zod'

export const UploadImageRes = z.string()

export type UploadImageResType = z.TypeOf<typeof UploadImageRes>
