"use client"

export const dynamic = "force-dynamic"

import { Header } from "@/components/header"
import { RegisterForm } from "@/components/register-form"

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <RegisterForm />
      </main>
    </div>
  )
}
