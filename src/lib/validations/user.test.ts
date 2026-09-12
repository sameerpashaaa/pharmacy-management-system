import { createUserSchema, updateUserSchema, createRoleSchema } from '@/lib/validations/user'

describe('user validation schemas', () => {
  describe('createUserSchema', () => {
    it('accepts valid user data', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        roleIds: ['role-1'],
      }
      const result = createUserSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('rejects invalid email', () => {
      const data = {
        name: 'John Doe',
        email: 'not-an-email',
        password: 'Password123',
        roleIds: ['role-1'],
      }
      const result = createUserSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('rejects weak password', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'weak',
        roleIds: ['role-1'],
      }
      const result = createUserSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('requires at least one role', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        roleIds: [],
      }
      const result = createUserSchema.safeParse(data)
      expect(result.success).toBe(false)
    })
  })

  describe('updateUserSchema', () => {
    it('accepts partial updates', () => {
      const data = { name: 'Jane Doe' }
      const result = updateUserSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('accepts roleIds update', () => {
      const data = { roleIds: ['role-1', 'role-2'] }
      const result = updateUserSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })

  describe('createRoleSchema', () => {
    it('accepts valid role data', () => {
      const data = {
        name: 'custom_role',
        displayName: 'Custom Role',
        permissionIds: ['perm-1', 'perm-2'],
      }
      const result = createRoleSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('rejects invalid role name format', () => {
      const data = {
        name: 'Invalid Role',
        displayName: 'Invalid Role',
        permissionIds: ['perm-1'],
      }
      const result = createRoleSchema.safeParse(data)
      expect(result.success).toBe(false)
    })

    it('accepts empty permissionIds array', () => {
      const data = {
        name: 'custom_role',
        displayName: 'Custom Role',
        permissionIds: [],
      }
      const result = createRoleSchema.safeParse(data)
      expect(result.success).toBe(true)
    })
  })
})
