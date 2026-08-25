import React from 'react'
import AppShell from './_components/AppShell';

function DashboardLayout({children}:any) {
  return (
    <AppShell>{children}</AppShell>
  )
}

export default DashboardLayout;