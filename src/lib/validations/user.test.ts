import { resetPasswordSchema } from '@/lib/validations/auth'
import { createUserSchema, updateUserSchema, createRoleSchema } from '@/lib/validations/user'

describe('user validation schemas', () => {
  describe('createUserSchema', () => {
    it('accepts valid user data', () => {
      const data = {
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123!',
        roleIds: ['role-1'],
      }
      const result = createUserSchema.safeParse(data)
      expect(result.success).toBe(true)
    })

    it('rejects 9-character passwords', () => {
      const result = createUserSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Pass123!x',
        roleIds: ['role-1'],
      })
      expect(result.success).toBe(false)
    })

    it('accepts 10-character passwords meeting all requirements', () => {
      const result = createUserSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Pass123!xy',
        roleIds: ['role-1'],
      })
      expect(result.success).toBe(true)
    })

    it('rejects passwords missing uppercase', () => {
      const result = createUserSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123!',
        roleIds: ['role-1'],
      })
      expect(result.success).toBe(false)
    })

    it('rejects passwords missing a number', () => {
      const result = createUserSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password!xy',
        roleIds: ['role-1'],
      })
      expect(result.success).toBe(false)
    })

    it('rejects passwords missing a special character', () => {
      const result = createUserSchema.safeParse({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        roleIds: ['role-1'],
      })
      expect(result.success).toBe(false)
    })

    it('reset schema enforces the same policy', () => {
      const base = { token: 'tok', confirmPassword: 'x' }
      expect(
        resetPasswordSchema.safeParse({
          ...base,
          password: 'Short1!x',
          confirmPassword: 'Short1!x',
        }).success
      ).toBe(false)
      expect(
        resetPasswordSchema.safeParse({
          ...base,
          password: 'ValidPass123!',
          confirmPassword: 'ValidPass123!',
        }).success
      ).toBe(true)
      expect(
        resetPasswordSchema.safeParse({
          ...base,
          password: 'NoSpecial123',
          confirmPassword: 'NoSpecial123',
        }).success
      ).toBe(false)
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
