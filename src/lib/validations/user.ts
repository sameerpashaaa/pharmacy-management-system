import { z } from 'zod'

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character')

export const createUserSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Please enter a valid email address'),
  password: passwordSchema,
  phone: z.string().optional(),
  roleIds: z.array(z.string()).min(1, 'At least one role is required'),
  branchId: z.string().optional(),
  isActive: z.boolean().default(true),
})

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().optional(),
  roleIds: z.array(z.string()).optional(),
  branchId: z.string().optional(),
  isActive: z.boolean().optional(),
})

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .regex(/^[a-z_]+$/, 'Role name must be lowercase letters and underscores only'),
  displayName: z.string().min(2, 'Display name is required'),
  description: z.string().optional(),
  permissionIds: z.array(z.string()),
})

export const updateRoleSchema = createRoleSchema.partial()

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type CreateRoleInput = z.infer<typeof createRoleSchema>
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>
