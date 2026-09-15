import z from "zod";

export const MessageRes = z
  .object({
    message: z.string(),
  })
  .strict();

export type MessageResType = z.TypeOf<typeof MessageRes>;

export const SuccessRes = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    message: z.string(),
    data: dataSchema,
  });

export const FailureRes = z.object({
  success: z.literal(false),
  message: z.string(),
  data: z.unknown().optional(),
});

export type FailureResType = z.TypeOf<typeof FailureRes>;
