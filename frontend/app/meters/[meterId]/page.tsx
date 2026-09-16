import { redirect } from 'next/navigation'

export default async function MeterAlias({ params }: { params: Promise<{ meterId: string }> }) {
  const { meterId } = await params
  redirect(`/dashboard/meters/${encodeURIComponent(meterId)}`)
}
