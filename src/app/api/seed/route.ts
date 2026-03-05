import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export async function GET() {
  // Create admin user if not exists
  const existing = await prisma.user.findUnique({ where: { email: 'admin@complianceiq.com' } })
  if (!existing) {
    const hashed = await bcrypt.hash('admin123', 12)
    await prisma.user.create({
      data: { name: 'Admin', email: 'admin@complianceiq.com', password: hashed, role: 'ADMIN' },
    })
  }

  // Create demo user if not exists
  const demo = await prisma.user.findUnique({ where: { email: 'demo@alphanio.com' } })
  if (!demo) {
    const hashed = await bcrypt.hash('demo123', 12)
    await prisma.user.create({
      data: { name: 'Shrikant', email: 'demo@alphanio.com', password: hashed, role: 'USER' },
    })
  }

  return NextResponse.json({ message: 'Seed complete' })
}
